begin;

-- Admin rescheduling of an existing private booking (issue #204).
--
-- The booking row is moved in place: its id, invite token, host, payment
-- references and amounts, registered guests, waivers and hire choices stay
-- attached because nothing but starts_at/ends_at changes. Date-relative
-- deadlines (equipment, top-up cut-off) are computed from starts_at when read,
-- so they follow the new time without a write.

-- Staff-only history of every move.
create table public.mem_private_booking_reschedules (
  id uuid primary key default gen_random_uuid(),
  private_booking_id uuid not null references public.mem_private_bookings(id) on delete cascade,
  old_starts_at timestamptz not null,
  old_ends_at timestamptz not null,
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  -- the staff hold that was standing on the new time and was lifted
  replaced_block_id uuid references public.mem_private_bookings(id) on delete set null,
  -- the hold placed on the old time, when staff kept it closed
  old_slot_block_id uuid references public.mem_private_bookings(id) on delete set null,
  staff_user_id uuid not null references auth.users(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  host_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index mem_private_booking_reschedules_booking_idx
  on public.mem_private_booking_reschedules(private_booking_id, created_at desc);
alter table public.mem_private_booking_reschedules enable row level security;
revoke all on public.mem_private_booking_reschedules from public, anon, authenticated;
grant select, update(host_notified_at) on public.mem_private_booking_reschedules to service_role;

create function public.mem_admin_reschedule_private_booking(
  p_booking_id uuid,
  p_expected_starts_at timestamptz,
  p_new_starts_at timestamptz,
  p_staff_user_id uuid,
  p_reason text,
  p_replace_block_id uuid default null,
  p_block_old_slot boolean default false,
  p_old_slot_note text default null
) returns public.mem_private_booking_reschedules
language plpgsql security definer set search_path = public as $$
declare
  b mem_private_bookings%rowtype;
  hold mem_private_bookings%rowtype;
  v_duration interval;
  v_hours integer;
  v_new_ends timestamptz;
  v_problem text;
  v_old_block uuid;
  v_audit mem_private_booking_reschedules%rowtype;
  v_old_start timestamptz;
  v_old_day date;
  v_new_day date;
begin
  if p_booking_id is null or p_new_starts_at is null or p_staff_user_id is null
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300
     or (p_block_old_slot and char_length(btrim(coalesce(p_old_slot_note, ''))) not between 3 and 300) then
    raise exception 'mem_private_reschedule_invalid';
  end if;

  select starts_at into v_old_start from mem_private_bookings where id = p_booking_id;
  if not found then raise exception 'mem_private_not_found'; end if;
  v_old_day := (v_old_start at time zone 'Europe/London')::date;
  v_new_day := (p_new_starts_at at time zone 'Europe/London')::date;
  -- Every private write serialises per London date. Take both dates in a
  -- fixed order so two opposite moves cannot deadlock.
  if v_old_day <= v_new_day then
    perform mem_private_lock_date(v_old_start);
    if v_new_day <> v_old_day then perform mem_private_lock_date(p_new_starts_at); end if;
  else
    perform mem_private_lock_date(p_new_starts_at);
    perform mem_private_lock_date(v_old_start);
  end if;

  select * into b from mem_private_bookings where id = p_booking_id for update;
  if not found then raise exception 'mem_private_not_found'; end if;
  if b.kind = 'block' or b.status <> 'confirmed' then
    raise exception 'mem_private_reschedule_not_allowed';
  end if;
  -- The screen was showing a different time: someone else moved it first.
  if b.starts_at is distinct from p_expected_starts_at then
    raise exception 'mem_private_reschedule_stale';
  end if;
  if b.starts_at <= now() then raise exception 'mem_private_reschedule_started'; end if;
  if exists (select 1 from mem_private_booking_places where private_booking_id = b.id and checked_in_at is not null) then
    raise exception 'mem_private_reschedule_started';
  end if;
  if p_new_starts_at = b.starts_at then raise exception 'mem_private_reschedule_same_time'; end if;

  v_duration := b.ends_at - b.starts_at;
  v_hours := round(extract(epoch from v_duration) / 3600)::integer;
  v_new_ends := p_new_starts_at + v_duration;

  -- Only a staff hold may give way, and only one the staff member chose.
  if p_replace_block_id is not null then
    select * into hold from mem_private_bookings where id = p_replace_block_id for update;
    if not found or hold.kind <> 'block' or hold.status <> 'confirmed'
       or not (hold.during && tstzrange(p_new_starts_at, v_new_ends, '[)')) then
      raise exception 'mem_private_reschedule_bad_hold';
    end if;
    update mem_private_bookings set status = 'cancelled', cancelled_at = now() where id = hold.id;
  end if;

  -- Run the shared slot rules against the new time with this booking out of
  -- the way, so it neither blocks itself nor satisfies the coaching
  -- second-hour rule for itself. Visible to no other transaction.
  update mem_private_bookings set status = 'cancelled' where id = b.id;
  v_problem := mem_private_slot_problem(b.kind, p_new_starts_at, v_hours, true);
  if v_problem is not null then
    raise exception 'mem_private_%', v_problem;
  end if;

  update mem_private_bookings
     set status = 'confirmed', starts_at = p_new_starts_at, ends_at = v_new_ends
   where id = b.id;

  if p_block_old_slot then
    insert into mem_private_bookings(kind, status, source, venue_id, starts_at, ends_at, created_by_user_id, note)
    values ('block', 'confirmed', 'manual', b.venue_id, b.starts_at, b.ends_at, p_staff_user_id, btrim(p_old_slot_note))
    returning id into v_old_block;
  end if;

  insert into mem_private_booking_reschedules(
    private_booking_id, old_starts_at, old_ends_at, new_starts_at, new_ends_at,
    replaced_block_id, old_slot_block_id, staff_user_id, reason)
  values (b.id, b.starts_at, b.ends_at, p_new_starts_at, v_new_ends,
    p_replace_block_id, v_old_block, p_staff_user_id, btrim(p_reason))
  returning * into v_audit;
  return v_audit;
exception
  -- Another booking or hold is on the new time (or, when keeping the old
  -- time closed, on the old one). The whole move rolls back.
  when exclusion_violation then
    raise exception 'mem_private_unavailable';
end;
$$;
revoke all on function public.mem_admin_reschedule_private_booking(uuid, timestamptz, timestamptz, uuid, text, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.mem_admin_reschedule_private_booking(uuid, timestamptz, timestamptz, uuid, text, uuid, boolean, text)
  to service_role;

commit;

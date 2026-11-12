begin;

-- Attendance corrections are private staff records. Never change a booking's
-- payer, refund destination, ticket owner or original purchased participant.
create table public.mem_booking_attendee_replacements (
  booking_id uuid primary key references public.mem_bookings(id),
  -- Household erasure may delete a participant with no purchased bookings.
  -- Keep the correction record without preventing that existing erasure flow.
  participant_id uuid references public.mem_participants(id) on delete set null,
  staff_user_id uuid not null references auth.users(id),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_at timestamptz not null default now()
);
alter table public.mem_booking_attendee_replacements enable row level security;
revoke all on public.mem_booking_attendee_replacements from public, anon, authenticated;
grant select, insert on public.mem_booking_attendee_replacements to service_role;

create function public.mem_admin_replace_attendee(
  p_booking_id uuid, p_participant_id uuid, p_staff_user_id uuid,
  p_reason text, p_expected_participant_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare
  b mem_bookings%rowtype;
  session_start timestamptz;
  bounds_min integer;
  bounds_max integer;
  attendee_age integer;
begin
  if p_staff_user_id is null or char_length(btrim(coalesce(p_reason,''))) not between 3 and 300 then
    raise exception 'mem_replacement_invalid';
  end if;
  select * into b from mem_bookings where id=p_booking_id for update;
  if not found then raise exception 'mem_booking_not_found'; end if;
  if b.participant_id is distinct from p_expected_participant_id
     or b.occurrence_id is null or b.course_run_id is not null
     or b.source::text='member' or b.status::text not in ('confirmed','attended','no_show')
     or exists(select 1 from mem_booking_attendee_replacements where booking_id=b.id) then
    raise exception 'mem_replacement_not_allowed';
  end if;
  if p_participant_id=b.participant_id then raise exception 'mem_replacement_same_person'; end if;
  select o.starts_at, f.age_min, f.age_max into session_start,bounds_min,bounds_max
    from mem_occurrences o join mem_offerings f on f.id=o.offering_id
    where o.id=b.occurrence_id and o.status::text in ('scheduled','completed');
  if not found or session_start>now() then raise exception 'mem_replacement_not_allowed'; end if;

  -- The participant lock also serialises the booking guard below: another
  -- booking or correction cannot claim this person between check and write.
  perform 1 from mem_participants where id=p_participant_id for update;
  if not found then raise exception 'mem_replacement_participant_missing'; end if;
  select extract(year from age((session_start at time zone 'Europe/London')::date,dob))::integer
    into attendee_age from mem_participants where id=p_participant_id;
  if attendee_age is null or attendee_age<0
    or (bounds_min is not null and attendee_age<bounds_min)
    or (bounds_max is not null and attendee_age>bounds_max) then
    raise exception 'mem_replacement_age_ineligible';
  end if;
  if exists(select 1 from mem_bookings x
    left join mem_booking_attendee_replacements r on r.booking_id=x.id
    where x.occurrence_id=b.occurrence_id and x.id<>b.id
      and x.status::text in ('pending_payment','confirmed','attended','no_show')
      and (x.participant_id=p_participant_id or r.participant_id=p_participant_id)) then
    raise exception 'mem_duplicate_booking';
  end if;
  insert into mem_booking_attendee_replacements(booking_id,participant_id,staff_user_id,reason)
    values(b.id,p_participant_id,p_staff_user_id,btrim(p_reason));
  -- This is a record of who actually skated, not a future ticket transfer.
  update mem_bookings set status='attended',updated_at=now() where id=b.id;
end;
$$;
revoke all on function public.mem_admin_replace_attendee(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.mem_admin_replace_attendee(uuid,uuid,uuid,text,uuid) to service_role;

create function public.mem_guard_replaced_attendee_booking()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- A correction belongs to one event and payer. Date transfers must not
  -- carry somebody else's attendance or safety information to a new date.
  if TG_OP='UPDATE' and exists(select 1 from mem_booking_attendee_replacements where booking_id=old.id)
    and (new.occurrence_id is distinct from old.occurrence_id
      or new.participant_id is distinct from old.participant_id
      or new.account_id is distinct from old.account_id) then
    raise exception 'mem_replacement_locked';
  end if;
  if new.occurrence_id is not null and new.status::text in ('pending_payment','confirmed','attended') then
    perform 1 from mem_participants where id=new.participant_id for update;
    if exists(select 1 from mem_booking_attendee_replacements r
      join mem_bookings b on b.id=r.booking_id
      where b.id<>new.id and b.occurrence_id=new.occurrence_id
        and r.participant_id=new.participant_id
        and b.status::text in ('pending_payment','confirmed','attended','no_show')) then
      raise exception 'mem_duplicate_booking';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.mem_guard_replaced_attendee_booking() from public,anon,authenticated;
create trigger mem_guard_replaced_attendee_booking
  before insert or update on public.mem_bookings
  for each row execute function public.mem_guard_replaced_attendee_booking();

commit;

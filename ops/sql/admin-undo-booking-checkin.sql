begin;

create table if not exists public.mem_booking_checkin_corrections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.mem_bookings(id),
  staff_user_id uuid not null references auth.users(id),
  previous_status text not null check (previous_status = 'attended'),
  reason text not null check (char_length(btrim(reason)) between 3 and 300),
  created_at timestamptz not null default now()
);

create index if not exists mem_booking_checkin_corrections_booking_idx
  on public.mem_booking_checkin_corrections (booking_id, created_at desc);

alter table public.mem_booking_checkin_corrections enable row level security;
revoke all on public.mem_booking_checkin_corrections from public, anon, authenticated;
grant select, insert on public.mem_booking_checkin_corrections to service_role;

create or replace function public.mem_admin_undo_booking_checkin(
  p_booking_id uuid,
  p_staff_user_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_status text;
begin
  if p_staff_user_id is null
     or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'mem_checkin_correction_invalid';
  end if;

  select status::text
    into booking_status
    from mem_bookings
    where id = p_booking_id
    for update;

  if not found then
    raise exception 'mem_booking_not_found';
  end if;

  -- The normal check-in route only changes mem_bookings.status. It does not
  -- write timestamps, deduct passes or credits, or award loyalty, so status
  -- is the complete state that needs reversing here.
  if booking_status <> 'attended' then
    raise exception 'mem_booking_not_attended';
  end if;

  update mem_bookings
    set status = 'confirmed',
        updated_at = now()
    where id = p_booking_id;

  insert into mem_booking_checkin_corrections (
    booking_id,
    staff_user_id,
    previous_status,
    reason
  ) values (
    p_booking_id,
    p_staff_user_id,
    booking_status,
    btrim(p_reason)
  );
end;
$$;

revoke all on function public.mem_admin_undo_booking_checkin(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mem_admin_undo_booking_checkin(uuid, uuid, text)
  to service_role;

commit;

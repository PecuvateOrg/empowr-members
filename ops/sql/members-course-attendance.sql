-- Add per-meeting attendance without changing a course's paid enrolment.
-- Apply as members_course_attendance through the Management API migration
-- endpoint, then regenerate the private hub's supabase ledger files.
create table public.mem_course_attendance (
  booking_id uuid not null references public.mem_bookings(id) on delete cascade,
  session_date date not null,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid not null,
  primary key (booking_id, session_date)
);
alter table public.mem_course_attendance enable row level security;
revoke all on table public.mem_course_attendance from public, anon, authenticated;
grant select, insert on table public.mem_course_attendance to service_role;

create function public.mem_check_in_course_booking(
  p_booking_id uuid, p_session_date date, p_checked_in_by uuid
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  enrolment public.mem_bookings%rowtype;
  course public.mem_course_runs%rowtype;
  offering_slug text;
  inserted_count integer;
begin
  -- Serialise with cancellation: never record a new arrival on a booking
  -- that was already cancelled, refunded, or still waiting for payment.
  select * into enrolment from public.mem_bookings where id = p_booking_id for update;
  if not found or enrolment.status not in ('confirmed', 'attended')
     or enrolment.course_run_id is null or enrolment.occurrence_id is not null then
    raise exception 'mem_course_checkin_invalid';
  end if;
  select * into course from public.mem_course_runs where id = enrolment.course_run_id for share;
  select slug into offering_slug from public.mem_offerings where id = course.offering_id;
  if offering_slug is distinct from 'beginners-foundation'
     or course.starts_on is null or course.ends_on is null or p_session_date is null
     or p_session_date < course.starts_on or p_session_date > course.ends_on
     or (p_session_date - course.starts_on) % 7 <> 0
     or p_session_date > (now() at time zone 'Europe/London')::date
     or p_checked_in_by is null then
    raise exception 'mem_course_checkin_invalid';
  end if;
  insert into public.mem_course_attendance (booking_id, session_date, checked_in_by)
    values (p_booking_id, p_session_date, p_checked_in_by)
    on conflict (booking_id, session_date) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;
revoke execute on function public.mem_check_in_course_booking(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.mem_check_in_course_booking(uuid, date, uuid) to service_role;

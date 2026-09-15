-- Run AFTER ops/sql/members-course-attendance.sql in a BEGIN/ROLLBACK
-- transaction. Cloned fixture rows never become visible to other sessions.
set local role service_role;
do $$
declare
  template public.mem_bookings%rowtype;
  fixture_course public.mem_course_runs%rowtype;
  fixture_booking public.mem_bookings%rowtype;
  course_id uuid := gen_random_uuid();
  booking_id uuid := gen_random_uuid();
  actor uuid := gen_random_uuid();
  today date := (now() at time zone 'Europe/London')::date;
  rejected_date date;
  rejected_status public.mem_bookings.status%type;
begin
  select b.* into template from public.mem_bookings b
    join public.mem_course_runs r on r.id = b.course_run_id
    join public.mem_offerings o on o.id = r.offering_id
    where o.slug = 'beginners-foundation' and b.status = 'confirmed' limit 1;
  if not found then raise exception 'No existing enrolment to clone for the rollback-only fixture'; end if;
  select (jsonb_populate_record(null::public.mem_course_runs,
    to_jsonb(r) || jsonb_build_object('id', course_id, 'starts_on', today - 14, 'ends_on', today + 7))).*
    into fixture_course from public.mem_course_runs r where r.id = template.course_run_id;
  insert into public.mem_course_runs select fixture_course.*;
  fixture_booking := jsonb_populate_record(null::public.mem_bookings,
    to_jsonb(template) || jsonb_build_object('id', booking_id, 'course_run_id', course_id,
      'stripe_checkout_session_id', null, 'stripe_payment_intent_id', null));
  insert into public.mem_bookings select fixture_booking.*;

  if not public.mem_check_in_course_booking(booking_id, today - 14, actor) then raise exception 'First arrival not saved'; end if;
  if public.mem_check_in_course_booking(booking_id, today - 14, actor) then raise exception 'Repeat arrival was not idempotent'; end if;
  if not public.mem_check_in_course_booking(booking_id, today - 7, actor) then raise exception 'Second week not saved independently'; end if;
  if (select count(*) from public.mem_course_attendance a where a.booking_id = fixture_booking.id) <> 2 then raise exception 'Attendance weeks not independent'; end if;
  if (select b.status from public.mem_bookings b where b.id = fixture_booking.id) <> 'confirmed' then raise exception 'Course enrolment was completed by attendance'; end if;
  foreach rejected_date in array array[today - 21, today - 13, today + 7] loop
    begin
      perform public.mem_check_in_course_booking(booking_id, rejected_date, actor);
      raise exception 'Invalid meeting date accepted';
    exception when raise_exception then
      if sqlerrm <> 'mem_course_checkin_invalid' then raise; end if;
    end;
  end loop;
  foreach rejected_status in array array['pending_payment', 'cancelled', 'refunded']::public.mem_booking_status[] loop
    update public.mem_bookings b set status = rejected_status where b.id = fixture_booking.id;
    begin
      perform public.mem_check_in_course_booking(booking_id, today, actor);
      raise exception 'Unpaid or cancelled booking accepted';
    exception when raise_exception then
      if sqlerrm <> 'mem_course_checkin_invalid' then raise; end if;
    end;
  end loop;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon', 'public.mem_course_attendance', 'SELECT')
    or has_table_privilege('authenticated', 'public.mem_course_attendance', 'SELECT')
    or has_function_privilege('anon', 'public.mem_check_in_course_booking(uuid,date,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.mem_check_in_course_booking(uuid,date,uuid)', 'EXECUTE') then
    raise exception 'Course attendance is accessible outside the staff API';
  end if;
end;
$$;
select 'Course attendance SQL checks passed; fixture transaction will be rolled back' as result;

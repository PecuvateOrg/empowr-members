-- Shared free skate hire (issue #144): Skate Jam + SYNKRON8 pay-as-you-go
-- bookings, and Beginners Foundation Level 1 courses (one size per participant
-- for the whole run). Builds on skate-jam-hire.sql; same size catalogue and
-- quantities (mem_skate_jam_hire_sizes), same jam_* columns on mem_bookings.
--
-- Stock pools: one per occurrence (Skate Jam, SYNKRON8) and one per course
-- run. They share the physical skates but never overlap in time today: Jam is
-- Thursday 20:45, SYNKRON8 Monday 20:30, Level 1 Tuesday 19:30.
--
-- Additive only, so the app version running before this deploys keeps working.
begin;

-- Which runs offer hire is an explicit flag, not the free-text label.
alter table public.mem_course_runs add column free_skate_hire boolean not null default false;

create table public.mem_skate_hire_run_stock (
  course_run_id uuid not null references public.mem_course_runs(id) on delete cascade,
  size smallint not null references public.mem_skate_jam_hire_sizes(size),
  reserved integer not null default 0 check (reserved >= 0),
  primary key (course_run_id,size)
);
alter table public.mem_skate_hire_run_stock enable row level security;
revoke all on public.mem_skate_hire_run_stock from public, anon, authenticated;
grant select on public.mem_skate_hire_run_stock to service_role;

-- Pay-as-you-go only: subscriber ('member') and walk-in bookings never qualify.
create function public.mem_skate_hire_eligible(p_source text, p_occurrence_id uuid, p_course_run_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select p_source = 'online' and case
    when p_course_run_id is not null then exists(
      select 1 from mem_course_runs where id = p_course_run_id and free_skate_hire)
    else exists(
      select 1 from mem_occurrences o join mem_offerings f on f.id = o.offering_id
      where o.id = p_occurrence_id and f.slug in ('skate-jam','synkron8'))
  end;
$$;
revoke all on function public.mem_skate_hire_eligible(text,uuid,uuid) from public, anon, authenticated;

-- Same rules as before, with the count sent to the run pool for course
-- bookings. Eligibility is checked only when hire is set or moved, so a later
-- change to a run's flag can never block cancelling an existing booking.
create or replace function public.mem_track_skate_jam_hire() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_live boolean := false; new_live boolean := false; restored boolean := false; cap integer;
begin
  if tg_op <> 'INSERT' then
    old_live := old.jam_hire_requested is true and old.status::text in ('pending_payment','confirmed','attended','no_show');
  end if;
  if tg_op <> 'DELETE' then
    if new.jam_hire_requested is not null and (tg_op = 'INSERT'
      or old.jam_hire_requested is distinct from new.jam_hire_requested
      or old.jam_skate_size is distinct from new.jam_skate_size
      or old.occurrence_id is distinct from new.occurrence_id
      or old.course_run_id is distinct from new.course_run_id
      or old.source is distinct from new.source)
      and not mem_skate_hire_eligible(new.source::text, new.occurrence_id, new.course_run_id)
    then raise exception 'mem_jam_hire_not_allowed'; end if;
    new_live := new.jam_hire_requested is true and new.status::text in ('pending_payment','confirmed','attended','no_show');
  end if;
  if tg_op='UPDATE' and old_live and new_live and old.jam_skate_size=new.jam_skate_size
    and old.occurrence_id is not distinct from new.occurrence_id
    and old.course_run_id is not distinct from new.course_run_id then return new; end if;
  if old_live then
    if old.course_run_id is not null then
      update mem_skate_hire_run_stock set reserved=reserved-1 where course_run_id=old.course_run_id and size=old.jam_skate_size;
    else
      update mem_skate_jam_hire_stock set reserved=reserved-1 where occurrence_id=old.occurrence_id and size=old.jam_skate_size;
    end if;
  end if;
  if new_live then
    -- The catalogue row lock also protects a quantity edit from racing a claim.
    select quantity into cap from mem_skate_jam_hire_sizes where size=new.jam_skate_size for share;
    if cap is null then raise exception 'mem_jam_hire_not_allowed'; end if;
    -- A paid booking restored from cancelled (late payment rescue, failed refund)
    -- must confirm even if its pair was resold meanwhile: the money is taken, so
    -- it over-allocates and staff see the size total on the register instead.
    restored := tg_op='UPDATE' and not old_live and old.status::text in ('cancelled','refunded','credited')
      and old.occurrence_id is not distinct from new.occurrence_id
      and old.course_run_id is not distinct from new.course_run_id and old.jam_skate_size=new.jam_skate_size;
    if new.course_run_id is not null then
      insert into mem_skate_hire_run_stock(course_run_id,size) values(new.course_run_id,new.jam_skate_size) on conflict do nothing;
      update mem_skate_hire_run_stock set reserved=reserved+1
        where course_run_id=new.course_run_id and size=new.jam_skate_size and (restored or reserved<cap);
    else
      insert into mem_skate_jam_hire_stock(occurrence_id,size) values(new.occurrence_id,new.jam_skate_size) on conflict do nothing;
      update mem_skate_jam_hire_stock set reserved=reserved+1
        where occurrence_id=new.occurrence_id and size=new.jam_skate_size and (restored or reserved<cap);
    end if;
    if not found then raise exception 'mem_jam_hire_sold_out'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

-- Unchanged except the lock order: size, then pool kind, then pool id, so
-- concurrent baskets mixing occurrence and course hire cannot deadlock.
create or replace function public.mem_reserve_skate_jam_hire(p_account_id uuid,p_choices jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare choice record;
begin
  if jsonb_typeof(p_choices) is distinct from 'array' then raise exception 'mem_jam_hire_invalid'; end if;
  if jsonb_array_length(p_choices) not between 1 and 10 then raise exception 'mem_jam_hire_invalid'; end if;
  if (select count(distinct value->>'booking_id') from jsonb_array_elements(p_choices)) <> jsonb_array_length(p_choices) then
    raise exception 'mem_jam_hire_invalid';
  end if;
  for choice in select c.booking_id, c.size from jsonb_to_recordset(p_choices) as c(booking_id uuid,size smallint)
    left join mem_bookings b on b.id = c.booking_id
    order by c.size nulls first, (b.course_run_id is not null), coalesce(b.course_run_id,b.occurrence_id), c.booking_id loop
    update mem_bookings set jam_hire_requested=(choice.size is not null),jam_skate_size=choice.size
      where id=choice.booking_id and account_id=p_account_id and status='pending_payment'
        and expires_at>now() and source='online' and stripe_checkout_session_id is null;
    if not found then raise exception 'mem_jam_hire_invalid'; end if;
  end loop;
end;
$$;

create or replace function public.mem_skate_jam_hire_availability(p_occurrence_id uuid)
returns table(size smallint,available integer) language sql stable security definer set search_path=public as $$
  select s.size,greatest(0,s.quantity-coalesce(h.reserved,0)) from mem_skate_jam_hire_sizes s
  left join mem_skate_jam_hire_stock h on h.size=s.size and h.occurrence_id=p_occurrence_id
  where mem_skate_hire_eligible('online', p_occurrence_id, null) order by s.size;
$$;

create function public.mem_skate_hire_run_availability(p_course_run_id uuid)
returns table(size smallint,available integer) language sql stable security definer set search_path=public as $$
  select s.size,greatest(0,s.quantity-coalesce(h.reserved,0)) from mem_skate_jam_hire_sizes s
  left join mem_skate_hire_run_stock h on h.size=s.size and h.course_run_id=p_course_run_id
  where mem_skate_hire_eligible('online', null, p_course_run_id) order by s.size;
$$;
revoke all on function public.mem_skate_hire_run_availability(uuid) from public,anon,authenticated;
grant execute on function public.mem_skate_hire_run_availability(uuid) to service_role;

-- Upcoming Beginners Foundation Level 1 runs (Jan and Mar 2027). The run that
-- started 2026-10-20 is nearly over and keeps its existing bookings as they are.
update public.mem_course_runs set free_skate_hire = true
 where id in ('cd90fffe-fad2-4ea7-a160-41eb0bf2e272','08921804-00ac-4000-bff5-942326a1e635');

commit;

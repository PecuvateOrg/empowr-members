-- Private bookings — schema proposal for review.
--
-- Design: planning/architecture/private-bookings.md. Not a migration file:
-- apply through the Supabase Management API, then regenerate the private
-- schema-of-record ledger with dump-ledger.mjs, per the repository CLAUDE.md.
--
-- Additive only. No existing table, function, policy or cron job is altered.
-- The one placeholder, <LADYWELL_VENUE_ID>, is filled in when seeding and is
-- deliberately not written into this public repository.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.mem_private_kind as enum
  ('birthday', 'coaching_one', 'coaching_group', 'custom', 'block');
create type public.mem_private_status as enum
  ('pending_payment', 'confirmed', 'cancelled');
create type public.mem_private_source as enum ('online', 'manual');
create type public.mem_private_equipment as enum ('own', 'hire');

-- Shared with planning/spec/admin-manual-booking.md, which reuses it
-- unchanged for manual bookings on mem_bookings.
create type public.mem_payment_handling as enum
  ('paid_bank_transfer', 'paid_stripe_manual', 'comp', 'owed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Rates and the launch switch. The hold function reads prices from here under
-- its lock; the client never supplies one.
create table public.mem_private_booking_types (
  kind              mem_private_kind primary key check (kind <> 'block'),
  title             text not null,
  -- birthday: per paid ticket; coaching_one: per hour;
  -- coaching_group: per person per hour; custom: null (quoted)
  unit_price_pence  integer check (unit_price_pence is null or unit_price_pence >= 0),
  min_places        integer not null default 1 check (min_places >= 1),
  -- null = no cap set yet (open decision)
  max_places        integer check (max_places is null or max_places >= min_places),
  -- coaching: per skater per booking, never per hour. birthday: null (included)
  hire_price_pence  integer check (hire_price_pence is null or hire_price_pence >= 0),
  venue_id          uuid not null references public.mem_venues (id),
  -- seeded false: nothing is bookable online until Empowr signs off
  active            boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.mem_private_bookings (
  id                          uuid primary key default gen_random_uuid(),
  kind                        mem_private_kind not null,
  status                      mem_private_status not null default 'pending_payment',
  source                      mem_private_source not null default 'online',
  venue_id                    uuid not null references public.mem_venues (id),
  starts_at                   timestamptz not null,
  ends_at                     timestamptz not null,
  during                      tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  host_account_id             uuid references public.mem_accounts (id),
  paid_places                 integer not null default 0 check (paid_places >= 0),
  total_places                integer not null default 0,
  -- list price snapshot incl. hire; for manual bookings payment_handling
  -- records what actually happened to the money
  price_pence                 integer not null default 0 check (price_pence >= 0),
  hire_pence                  integer not null default 0 check (hire_pence >= 0),
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  expires_at                  timestamptz,
  payment_handling            mem_payment_handling,
  created_by_user_id          uuid,
  -- internal only: manual payment note or block reason, never shown to customers
  note                        text,
  invite_token                text unique,
  cancelled_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint mem_private_ends_after_start check (ends_at > starts_at),
  constraint mem_private_total_covers_paid check (total_places >= paid_places),
  constraint mem_private_host_unless_block check ((kind = 'block') = (host_account_id is null)),
  constraint mem_private_block_is_manual check (kind <> 'block' or source = 'manual'),
  constraint mem_private_manual_has_actor check (source = 'online' or created_by_user_id is not null),
  constraint mem_private_manual_has_payment_handling
    check (kind = 'block' or source = 'online' or payment_handling is not null),
  constraint mem_private_hold_expires check (status <> 'pending_payment' or expires_at is not null),

  -- Half-open ranges: 15:00-16:00 and 16:00-17:00 do not collide. A single
  -- range column needs no btree_gist. One bookable space, so venue is not
  -- part of the constraint; see the design doc before adding a second venue.
  constraint mem_private_no_overlap
    exclude using gist (during with &&)
    where (status in ('pending_payment', 'confirmed'))
);

create index mem_private_bookings_host_idx on public.mem_private_bookings (host_account_id);
create index mem_private_bookings_starts_idx on public.mem_private_bookings (starts_at);

create table public.mem_private_booking_places (
  id                     uuid primary key default gen_random_uuid(),
  private_booking_id     uuid not null references public.mem_private_bookings (id),
  account_id             uuid not null references public.mem_accounts (id),
  participant_id         uuid not null references public.mem_participants (id),
  equipment              mem_private_equipment not null default 'own',
  hire_size              text check (hire_size in ('C10-UK1', 'UK1-UK3', 'UK4-UK7')),
  is_birthday_person     boolean not null default false,
  checked_in_at          timestamptz,
  checked_in_by_user_id  uuid,
  created_at             timestamptz not null default now(),

  constraint mem_private_place_once unique (private_booking_id, participant_id),
  constraint mem_private_hire_needs_size check ((equipment = 'hire') = (hire_size is not null))
);

create unique index mem_private_one_birthday_person
  on public.mem_private_booking_places (private_booking_id)
  where is_birthday_person;
create index mem_private_places_account_idx on public.mem_private_booking_places (account_id);

create trigger set_updated_at before update on public.mem_private_booking_types
  for each row execute function mem_set_updated_at();
create trigger set_updated_at before update on public.mem_private_bookings
  for each row execute function mem_set_updated_at();

-- ---------------------------------------------------------------------------
-- The bookable space
-- ---------------------------------------------------------------------------

-- Every type row names the same venue. Refuses rather than guessing if they
-- ever disagree, because the overlap constraint assumes a single space.
create function public.mem_private_venue()
returns uuid
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_count integer;
  v_venue uuid;
begin
  select count(distinct venue_id), min(venue_id::text)::uuid
    into v_count, v_venue
    from mem_private_booking_types;
  if v_count <> 1 then
    raise exception 'mem_private_venue_not_configured';
  end if;
  return v_venue;
end;
$function$;

-- ---------------------------------------------------------------------------
-- The one slot rule — shared by availability and every write path
-- ---------------------------------------------------------------------------

-- Returns why an interval cannot be booked, or null if it can. The public
-- availability read and the hold both call this, so the date picker can never
-- offer something the hold then refuses.
create function public.mem_private_slot_problem(
  p_kind mem_private_kind,
  p_starts_at timestamptz,
  p_hours integer,
  p_manual boolean default false
)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_local timestamp := p_starts_at at time zone 'Europe/London';
  v_start_hour integer := extract(hour from (p_starts_at at time zone 'Europe/London'));
  v_range tstzrange := tstzrange(p_starts_at, p_starts_at + make_interval(hours => p_hours), '[)');
  v_venue uuid := mem_private_venue();
begin
  if p_hours not in (1, 2) then
    return 'bad_duration';
  end if;
  if extract(isodow from v_local) <> 6 then
    return 'not_saturday';
  end if;
  if v_local::time not in (time '15:00', time '16:00') then
    return 'bad_start';
  end if;
  if v_start_hour + p_hours > 17 then
    return 'past_window';
  end if;
  if p_kind = 'birthday' and (v_start_hour <> 15 or p_hours <> 2) then
    return 'bad_duration';
  end if;

  if p_starts_at <= now() then
    return 'in_past';
  end if;
  -- KB: every private booking is made at least two weeks ahead. Staff entering
  -- an already-agreed booking are exempt.
  if not p_manual
     and v_local::date < (now() at time zone 'Europe/London')::date + 14 then
    return 'too_soon';
  end if;

  -- 16:00 one-hour coaching opens only behind a CONFIRMED coaching booking
  -- covering 15:00-16:00. Pending holds and blocks never qualify.
  if p_kind in ('coaching_one', 'coaching_group') and p_hours = 1 and v_start_hour = 16 then
    if not exists (
      select 1
      from mem_private_bookings b
      where b.status = 'confirmed'
        and b.kind in ('coaching_one', 'coaching_group')
        and b.during @> tstzrange(p_starts_at - interval '1 hour', p_starts_at, '[)')
    ) then
      return 'second_hour_locked';
    end if;
  end if;

  -- Members' own sessions in the same space (the All Ages Roller Disco runs
  -- here). Venue resolved exactly as mem_hold_bookings() resolves it.
  -- A staff block over a session is harmless, so blocks skip this.
  if p_kind <> 'block' and exists (
    select 1
    from mem_occurrences o
    join mem_offerings f on f.id = o.offering_id
    where coalesce(o.venue_id, f.venue_id) = v_venue
      and o.status = 'scheduled'
      and tstzrange(o.starts_at, o.ends_at, '[)') && v_range
  ) then
    return 'session_clash';
  end if;

  -- An expired hold no longer counts even before the sweep reaches it.
  if exists (
    select 1
    from mem_private_bookings b
    where b.during && v_range
      and (b.status = 'confirmed'
           or (b.status = 'pending_payment' and b.expires_at > now()))
  ) then
    return 'unavailable';
  end if;

  return null;
end;
$function$;

-- Used by the admin occurrence routes to refuse scheduling a session over an
-- active private booking or block. Returns the clashing booking id, or null.
create function public.mem_private_clash(
  p_venue_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  select b.id
  from mem_private_bookings b
  where b.venue_id = p_venue_id
    and b.during && tstzrange(p_starts_at, p_ends_at, '[)')
    and (b.status = 'confirmed'
         or (b.status = 'pending_payment' and b.expires_at > now()))
  order by b.starts_at
  limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- Serialises every write for one London date. The sequential-hour rule reads
-- other rows, which the exclusion constraint cannot express.
create function public.mem_private_lock_date(p_starts_at timestamptz)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_day date := (p_starts_at at time zone 'Europe/London')::date;
begin
  perform pg_advisory_xact_lock(hashtextextended('mem_private:' || v_day::text, 0));
  update mem_private_bookings
     set status = 'cancelled', cancelled_at = now()
   where status = 'pending_payment'
     and expires_at <= now()
     and (starts_at at time zone 'Europe/London')::date = v_day;
end;
$function$;

-- Online hold (p_manual_by null) or staff-entered booking (p_manual_by set).
-- Online: pending_payment with an expiry. Manual: confirmed immediately.
create function public.mem_hold_private_booking(
  p_account_id uuid,
  p_kind mem_private_kind,
  p_starts_at timestamptz,
  p_hours integer,
  p_paid_places integer,
  p_places jsonb default '[]'::jsonb,
  p_expiry_minutes integer default 30,
  p_manual_by uuid default null,
  p_payment_handling mem_payment_handling default null,
  p_note text default null,
  p_price_pence integer default null
)
returns mem_private_bookings
language plpgsql
set search_path to 'public'
as $function$
declare
  v_manual boolean := p_manual_by is not null;
  v_type mem_private_booking_types;
  v_problem text;
  v_count integer;
  v_hire_count integer;
  v_hire integer := 0;
  v_price integer;
  v_row mem_private_bookings;
begin
  if p_kind = 'block' then
    raise exception 'mem_private_bad_kind';
  end if;
  if p_kind = 'custom' and not v_manual then
    raise exception 'mem_private_bad_kind';
  end if;
  if v_manual and p_payment_handling is null then
    raise exception 'mem_private_payment_handling_required';
  end if;
  if jsonb_typeof(p_places) <> 'array' then
    raise exception 'mem_private_bad_places';
  end if;

  select * into v_type from mem_private_booking_types where kind = p_kind;
  if not found or (not v_manual and not v_type.active) then
    raise exception 'mem_private_not_offered';
  end if;

  perform mem_private_lock_date(p_starts_at);

  v_problem := mem_private_slot_problem(p_kind, p_starts_at, p_hours, v_manual);
  if v_problem is not null then
    raise exception 'mem_private_%', v_problem;
  end if;

  if p_paid_places < v_type.min_places then
    raise exception 'mem_private_below_minimum';
  end if;
  if v_type.max_places is not null and p_paid_places > v_type.max_places then
    raise exception 'mem_private_above_maximum';
  end if;

  v_count := jsonb_array_length(p_places);
  if p_kind in ('coaching_one', 'coaching_group') then
    if v_count <> p_paid_places or (p_kind = 'coaching_one' and p_paid_places <> 1) then
      raise exception 'mem_private_bad_places';
    end if;
    if (select count(distinct value->>'participant_id') from jsonb_array_elements(p_places)) <> v_count then
      raise exception 'mem_private_duplicate_participant';
    end if;
    if (select count(*)
          from mem_participants
         where account_id = p_account_id
           and id in (select (value->>'participant_id')::uuid
                        from jsonb_array_elements(p_places))) <> v_count then
      raise exception 'mem_private_participant_mismatch';
    end if;
    select count(*) into v_hire_count
      from jsonb_array_elements(p_places)
     where value->>'equipment' = 'hire';
    v_hire := coalesce(v_type.hire_price_pence, 0) * v_hire_count;
  elsif v_count <> 0 then
    -- birthday and custom guests register after the booking exists
    raise exception 'mem_private_bad_places';
  end if;

  v_price := case p_kind
    when 'birthday'       then v_type.unit_price_pence * p_paid_places
    when 'coaching_one'   then v_type.unit_price_pence * p_hours + v_hire
    when 'coaching_group' then v_type.unit_price_pence * p_paid_places * p_hours + v_hire
    else null
  end;
  -- Staff may record an agreed price; custom events are always quoted.
  if v_manual and p_price_pence is not null then
    v_price := p_price_pence;
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'mem_private_price_required';
  end if;

  insert into mem_private_bookings (
    kind, status, source, venue_id, starts_at, ends_at, host_account_id,
    paid_places, total_places, price_pence, hire_pence, expires_at,
    payment_handling, created_by_user_id, note, invite_token
  )
  values (
    p_kind,
    case when v_manual then 'confirmed' else 'pending_payment' end::mem_private_status,
    case when v_manual then 'manual' else 'online' end::mem_private_source,
    v_type.venue_id,
    p_starts_at,
    p_starts_at + make_interval(hours => p_hours),
    p_account_id,
    p_paid_places,
    p_paid_places + case when p_kind = 'birthday' then 1 else 0 end,
    v_price,
    v_hire,
    case when v_manual then null else now() + make_interval(mins => p_expiry_minutes) end,
    p_payment_handling,
    p_manual_by,
    p_note,
    case when v_manual and p_kind = 'birthday'
         then replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    end
  )
  returning * into v_row;

  insert into mem_private_booking_places (private_booking_id, account_id, participant_id, equipment, hire_size)
  select v_row.id,
         p_account_id,
         (value->>'participant_id')::uuid,
         coalesce(value->>'equipment', 'own')::mem_private_equipment,
         nullif(value->>'hire_size', '')
    from jsonb_array_elements(p_places);

  return v_row;
exception
  when exclusion_violation then
    raise exception 'mem_private_unavailable';
  when check_violation or invalid_text_representation then
    raise exception 'mem_private_bad_places';
end;
$function$;

-- Webhook confirmation. Sets the invite token for a birthday in the same
-- statement, so a confirmed birthday always has one.
create function public.mem_confirm_private_booking(
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns setof mem_private_bookings
language sql
set search_path to 'public'
as $function$
  update mem_private_bookings
     set status = 'confirmed',
         stripe_payment_intent_id = p_payment_intent_id,
         expires_at = null,
         invite_token = case
           when kind = 'birthday'
             then coalesce(invite_token, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
           else invite_token
         end
   where stripe_checkout_session_id = p_checkout_session_id
     and status = 'pending_payment'
  returning *;
$function$;

create function public.mem_block_private_slot(
  p_starts_at timestamptz,
  p_hours integer,
  p_user_id uuid,
  p_note text default null
)
returns mem_private_bookings
language plpgsql
set search_path to 'public'
as $function$
declare
  v_problem text;
  v_row mem_private_bookings;
begin
  if p_user_id is null then
    raise exception 'mem_private_actor_required';
  end if;
  perform mem_private_lock_date(p_starts_at);
  v_problem := mem_private_slot_problem('block', p_starts_at, p_hours, true);
  if v_problem is not null then
    raise exception 'mem_private_%', v_problem;
  end if;

  insert into mem_private_bookings (
    kind, status, source, venue_id, starts_at, ends_at, created_by_user_id, note
  )
  values (
    'block', 'confirmed', 'manual', mem_private_venue(), p_starts_at,
    p_starts_at + make_interval(hours => p_hours), p_user_id, p_note
  )
  returning * into v_row;
  return v_row;
exception
  when exclusion_violation then
    raise exception 'mem_private_unavailable';
end;
$function$;

-- Birthday guest registration, one place at a time, after payment.
create function public.mem_join_private_booking(
  p_booking_id uuid,
  p_account_id uuid,
  p_participant_id uuid,
  p_equipment mem_private_equipment,
  p_hire_size text,
  p_is_birthday_person boolean default false
)
returns mem_private_booking_places
language plpgsql
set search_path to 'public'
as $function$
declare
  v_booking mem_private_bookings;
  v_count integer;
  v_place mem_private_booking_places;
begin
  select * into v_booking
    from mem_private_bookings
   where id = p_booking_id
   for update;
  if not found or v_booking.kind <> 'birthday' then
    raise exception 'mem_private_not_found';
  end if;
  if v_booking.status <> 'confirmed' or v_booking.starts_at <= now() then
    raise exception 'mem_private_not_joinable';
  end if;
  if not exists (
    select 1 from mem_participants
     where id = p_participant_id and account_id = p_account_id
  ) then
    raise exception 'mem_private_participant_mismatch';
  end if;
  if exists (
    select 1 from mem_private_booking_places
     where private_booking_id = p_booking_id and participant_id = p_participant_id
  ) then
    raise exception 'mem_private_already_joined';
  end if;
  if p_is_birthday_person and exists (
    select 1 from mem_private_booking_places
     where private_booking_id = p_booking_id and is_birthday_person
  ) then
    raise exception 'mem_private_birthday_person_taken';
  end if;

  select count(*) into v_count
    from mem_private_booking_places
   where private_booking_id = p_booking_id;
  if v_count >= v_booking.total_places then
    raise exception 'mem_private_full';
  end if;

  insert into mem_private_booking_places (
    private_booking_id, account_id, participant_id, equipment, hire_size, is_birthday_person
  )
  values (
    p_booking_id, p_account_id, p_participant_id, p_equipment,
    case when p_equipment = 'hire' then p_hire_size end, p_is_birthday_person
  )
  returning * into v_place;
  return v_place;
exception
  when check_violation then
    raise exception 'mem_private_bad_places';
end;
$function$;

-- Public date picker. Returns only whether an interval is open, never who
-- holds it or why. Mirrors mem_public_occurrence_capacity: anon cannot read
-- mem_private_bookings, so this is the only public view of it.
create function public.mem_public_private_availability(p_from date, p_to date)
returns table (kind mem_private_kind, hours integer, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with days as (
    select p_from + i as day
      from generate_series(0, least(p_to, p_from + 180) - p_from) as i
     where extract(isodow from p_from + i) = 6
  ),
  combos (kind, start_hour, hours) as (
    values ('birthday'::mem_private_kind, 15, 2),
           ('coaching_one'::mem_private_kind, 15, 1),
           ('coaching_one'::mem_private_kind, 16, 1),
           ('coaching_one'::mem_private_kind, 15, 2),
           ('coaching_group'::mem_private_kind, 15, 1),
           ('coaching_group'::mem_private_kind, 16, 1),
           ('coaching_group'::mem_private_kind, 15, 2)
  ),
  candidates as (
    select c.kind,
           c.hours,
           (d.day + make_time(c.start_hour, 0, 0)) at time zone 'Europe/London' as starts_at
      from days d
     cross join combos c
      join mem_private_booking_types t on t.kind = c.kind and t.active
  )
  select c.kind, c.hours, c.starts_at, c.starts_at + make_interval(hours => c.hours)
    from candidates c
   where mem_private_slot_problem(c.kind, c.starts_at, c.hours, false) is null
   order by c.starts_at, c.kind, c.hours;
$function$;

-- ---------------------------------------------------------------------------
-- Hold expiry — a new job; members-release-expired-pendings is left alone
-- ---------------------------------------------------------------------------

select cron.schedule(
  'members-release-expired-private-holds',
  '* * * * *',
  $job$
    update mem_private_bookings
       set status = 'cancelled', cancelled_at = now()
     where status = 'pending_payment'
       and expires_at <= now()
  $job$
);

-- ---------------------------------------------------------------------------
-- RLS, grants
-- ---------------------------------------------------------------------------

alter table public.mem_private_booking_types enable row level security;
alter table public.mem_private_bookings enable row level security;
alter table public.mem_private_booking_places enable row level security;

create policy members_read_own_private_bookings on public.mem_private_bookings
  for select to authenticated
  using (host_account_id = member_account_id());
create policy members_read_own_private_places on public.mem_private_booking_places
  for select to authenticated
  using (account_id = member_account_id());

-- This project's default ACL strips DML from API roles on new tables, so
-- grants mirror the policies explicitly (see members_table_grants).
grant select, insert, update, delete on
  public.mem_private_booking_types, public.mem_private_bookings, public.mem_private_booking_places
  to service_role;
grant select on public.mem_private_bookings, public.mem_private_booking_places to authenticated;

-- PUBLIC holds EXECUTE by default; revoke it everywhere, then grant narrowly.
do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.mem_private_venue()',
    'public.mem_private_slot_problem(mem_private_kind, timestamptz, integer, boolean)',
    'public.mem_private_clash(uuid, timestamptz, timestamptz)',
    'public.mem_private_lock_date(timestamptz)',
    'public.mem_hold_private_booking(uuid, mem_private_kind, timestamptz, integer, integer, jsonb, integer, uuid, mem_payment_handling, text, integer)',
    'public.mem_confirm_private_booking(text, text)',
    'public.mem_block_private_slot(timestamptz, integer, uuid, text)',
    'public.mem_join_private_booking(uuid, uuid, uuid, mem_private_equipment, text, boolean)',
    'public.mem_public_private_availability(date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$grants$;

grant execute on function public.mem_public_private_availability(date, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed — KB-confirmed rates (entities/private-bookings, Empowr 2026-08-17).
-- Every type starts inactive.
-- ---------------------------------------------------------------------------

insert into public.mem_private_booking_types
  (kind, title, unit_price_pence, min_places, max_places, hire_price_pence, venue_id, active)
values
  ('birthday',       'Private Roller Disco Birthday Party', 2000, 10, null, null, '<LADYWELL_VENUE_ID>'::uuid, false),
  ('coaching_one',   '1:1 Private Skate Coaching',          4000,  1,    1,  500, '<LADYWELL_VENUE_ID>'::uuid, false),
  ('coaching_group', 'Private Group Skate Coaching',        2000,  3, null,  500, '<LADYWELL_VENUE_ID>'::uuid, false),
  ('custom',         'Custom Roller Skating Event',          null,  1, null, null, '<LADYWELL_VENUE_ID>'::uuid, false);

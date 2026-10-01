-- Private bookings: adding places after booking, and gear-only hire.
-- Plan: planning/architecture/private-bookings-add-places.md (approved 2026-10-01).
--
-- Additive only. One new enum value, one new table, two new functions, and the
-- booking hold function re-created with gear-only priced like hire. Nothing
-- existing is dropped or rewritten in data.

-- ---------------------------------------------------------------------------
-- Gear-only hire: pads and helmet, own skates. Same price as full hire; no size.
-- mem_private_hire_needs_size already allows it ((equipment = 'hire') = (size is not null)).
-- ---------------------------------------------------------------------------

alter type public.mem_private_equipment add value if not exists 'gear';

create or replace function public.mem_hold_private_booking(
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
     where value->>'equipment' in ('hire', 'gear');  -- gear-only costs the same (2026-10-01)
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

-- ---------------------------------------------------------------------------
-- Top-ups: one row per addition to a confirmed booking, each with its own
-- Stripe checkout. The booking's own payment and price snapshot are untouched.
-- ---------------------------------------------------------------------------

create table public.mem_private_booking_topups (
  id                          uuid primary key default gen_random_uuid(),
  private_booking_id          uuid not null references public.mem_private_bookings (id) on delete restrict,
  -- who pays: the host online; at the door, whoever's phone pays
  account_id                  uuid not null references public.mem_accounts (id) on delete restrict,
  source                      text not null check (source in ('online', 'door')),
  added_places                integer not null check (added_places >= 1),
  -- group coaching only: [{participant_id, account_id, equipment, hire_size}]
  places                      jsonb not null default '[]'::jsonb,
  amount_pence                integer not null check (amount_pence >= 0),
  hire_pence                  integer not null default 0 check (hire_pence >= 0),
  status                      mem_private_status not null default 'pending_payment',
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  expires_at                  timestamptz,
  created_by_user_id          uuid,
  confirmed_at                timestamptz,
  cancelled_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint mem_private_topup_door_has_actor check (source = 'online' or created_by_user_id is not null),
  constraint mem_private_topup_hold_expires check (status <> 'pending_payment' or expires_at is not null)
);

create index mem_private_topups_booking_idx on public.mem_private_booking_topups (private_booking_id);
create index mem_private_topups_account_idx on public.mem_private_booking_topups (account_id);

create trigger set_updated_at before update on public.mem_private_booking_topups
  for each row execute function mem_set_updated_at();

-- Reserve and price an addition. Prices come from the type row under the
-- booking's lock; the client never supplies one. Waivers are checked by the
-- app before this is called (as for bookings); a birthday guest still joins
-- through the invite link, which refuses anyone without one.
create function public.mem_hold_private_topup(
  p_booking_id uuid,
  p_account_id uuid,
  p_added_places integer,
  p_places jsonb default '[]'::jsonb,
  p_source text default 'online',
  p_created_by uuid default null,
  p_expiry_minutes integer default 30
)
returns mem_private_booking_topups
language plpgsql
set search_path to 'public'
as $function$
declare
  v_booking mem_private_bookings;
  v_type mem_private_booking_types;
  v_reserved integer;
  v_count integer;
  v_hours integer;
  v_hire_count integer := 0;
  v_hire integer := 0;
  v_amount integer;
  v_places jsonb := '[]'::jsonb;
  v_row mem_private_booking_topups;
begin
  if p_source not in ('online', 'door') then
    raise exception 'mem_private_bad_source';
  end if;
  if p_source = 'door' and p_created_by is null then
    raise exception 'mem_private_topup_needs_staff';
  end if;
  if p_added_places is null or p_added_places < 1 then
    raise exception 'mem_private_bad_places';
  end if;
  if jsonb_typeof(p_places) <> 'array' then
    raise exception 'mem_private_bad_places';
  end if;

  select * into v_booking from mem_private_bookings where id = p_booking_id for update;
  if not found or v_booking.kind not in ('birthday', 'coaching_group') then
    raise exception 'mem_private_not_found';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'mem_private_not_joinable';
  end if;

  -- Online closes 48 hours before the start so the team and equipment can be
  -- prepared (owner, 2026-10-01); the door is open until the session ends.
  if p_source = 'online' then
    if p_account_id is distinct from v_booking.host_account_id then
      raise exception 'mem_private_not_host';
    end if;
    if now() > v_booking.starts_at - interval '48 hours' then
      raise exception 'mem_private_topup_closed';
    end if;
  elsif now() >= v_booking.ends_at then
    raise exception 'mem_private_topup_closed';
  end if;

  select * into v_type from mem_private_booking_types where kind = v_booking.kind;

  -- The cap counts places already paid plus every addition still being paid
  -- for, so two people adding at once cannot overshoot it.
  select v_booking.paid_places + coalesce(sum(added_places), 0) into v_reserved
    from mem_private_booking_topups
   where private_booking_id = p_booking_id
     and status = 'pending_payment'
     and expires_at > now();
  if v_type.max_places is not null and v_reserved + p_added_places > v_type.max_places then
    raise exception 'mem_private_above_maximum';
  end if;

  v_count := jsonb_array_length(p_places);
  if v_booking.kind = 'birthday' then
    if v_count <> 0 then
      raise exception 'mem_private_bad_places';  -- guests join through the invite link
    end if;
    v_amount := v_type.unit_price_pence * p_added_places;  -- equipment included
  else
    if v_count <> p_added_places then
      raise exception 'mem_private_bad_places';
    end if;
    if (select count(distinct value->>'participant_id') from jsonb_array_elements(p_places)) <> v_count then
      raise exception 'mem_private_duplicate_participant';
    end if;
    -- Each skater must exist; online they must be the host's own household.
    select coalesce(jsonb_agg(jsonb_build_object(
             'participant_id', mp.id,
             'account_id', mp.account_id,
             'equipment', coalesce(e.value->>'equipment', 'own'),
             'hire_size', nullif(e.value->>'hire_size', '')
           )), '[]'::jsonb)
      into v_places
      from jsonb_array_elements(p_places) e
      join mem_participants mp on mp.id = (e.value->>'participant_id')::uuid
     where p_source = 'door' or mp.account_id = p_account_id;
    if jsonb_array_length(v_places) <> v_count then
      raise exception 'mem_private_participant_mismatch';
    end if;
    -- Not already on the booking, and not in another addition being paid for.
    if exists (
      select 1 from mem_private_booking_places
       where private_booking_id = p_booking_id
         and participant_id in (select (value->>'participant_id')::uuid from jsonb_array_elements(v_places))
    ) or exists (
      select 1 from mem_private_booking_topups t, jsonb_array_elements(t.places) tp
       where t.private_booking_id = p_booking_id
         and t.status = 'pending_payment'
         and t.expires_at > now()
         and tp.value->>'participant_id' in (select value->>'participant_id' from jsonb_array_elements(v_places))
    ) then
      raise exception 'mem_private_already_joined';
    end if;
    -- Equipment must be valid before money is taken, not when the place is written.
    if exists (
      select 1 from jsonb_array_elements(v_places)
       where value->>'equipment' not in ('own', 'hire', 'gear')
          or ((value->>'equipment' = 'hire') <> (value->>'hire_size' is not null))
          or (value->>'hire_size' is not null and value->>'hire_size' not in ('C10-UK1', 'UK1-UK3', 'UK4-UK7'))
    ) then
      raise exception 'mem_private_bad_places';
    end if;

    v_hours := round(extract(epoch from v_booking.ends_at - v_booking.starts_at) / 3600)::integer;
    select count(*) into v_hire_count
      from jsonb_array_elements(v_places)
     where value->>'equipment' in ('hire', 'gear');
    v_hire := coalesce(v_type.hire_price_pence, 0) * v_hire_count;
    v_amount := v_type.unit_price_pence * p_added_places * v_hours + v_hire;
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'mem_private_price_required';
  end if;

  insert into mem_private_booking_topups (
    private_booking_id, account_id, source, added_places, places,
    amount_pence, hire_pence, expires_at, created_by_user_id
  )
  values (
    p_booking_id, p_account_id, p_source, p_added_places, v_places,
    v_amount, v_hire, now() + make_interval(mins => p_expiry_minutes), p_created_by
  )
  returning * into v_row;
  return v_row;
end;
$function$;

-- Webhook confirmation. Runs once per checkout: a replayed Stripe event finds
-- nothing pending and changes nothing. An addition whose hold was swept before
-- the payment landed returns no row, so the app alerts staff (money taken,
-- places not added) exactly as for a stranded booking.
create function public.mem_confirm_private_topup(
  p_checkout_session_id text,
  p_payment_intent_id text
)
returns setof mem_private_booking_topups
language plpgsql
set search_path to 'public'
as $function$
declare
  v_topup mem_private_booking_topups;
begin
  select * into v_topup
    from mem_private_booking_topups
   where stripe_checkout_session_id = p_checkout_session_id
     and status = 'pending_payment'
   for update;
  if not found then
    return;
  end if;

  perform 1 from mem_private_bookings where id = v_topup.private_booking_id for update;

  update mem_private_bookings
     set paid_places = paid_places + v_topup.added_places,
         total_places = total_places + v_topup.added_places
   where id = v_topup.private_booking_id;

  insert into mem_private_booking_places (private_booking_id, account_id, participant_id, equipment, hire_size)
  select v_topup.private_booking_id,
         (value->>'account_id')::uuid,
         (value->>'participant_id')::uuid,
         (value->>'equipment')::mem_private_equipment,
         value->>'hire_size'
    from jsonb_array_elements(v_topup.places)
  on conflict (private_booking_id, participant_id) do nothing;

  update mem_private_booking_topups
     set status = 'confirmed',
         stripe_payment_intent_id = p_payment_intent_id,
         expires_at = null,
         confirmed_at = now()
   where id = v_topup.id
  returning * into v_topup;

  return next v_topup;
end;
$function$;

-- Unpaid additions release their reserved places, like booking holds.
select cron.schedule(
  'members-release-expired-private-topups',
  '* * * * *',
  $job$
    update mem_private_booking_topups
       set status = 'cancelled', cancelled_at = now()
     where status = 'pending_payment'
       and expires_at <= now()
  $job$
);

-- ---------------------------------------------------------------------------
-- RLS, grants
-- ---------------------------------------------------------------------------

alter table public.mem_private_booking_topups enable row level security;

create policy members_read_own_private_topups on public.mem_private_booking_topups
  for select to authenticated
  using (account_id = member_account_id());

grant select, insert, update, delete on public.mem_private_booking_topups to service_role;
grant select on public.mem_private_booking_topups to authenticated;

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.mem_hold_private_booking(uuid, mem_private_kind, timestamptz, integer, integer, jsonb, integer, uuid, mem_payment_handling, text, integer)',
    'public.mem_hold_private_topup(uuid, uuid, integer, jsonb, text, uuid, integer)',
    'public.mem_confirm_private_topup(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$grants$;

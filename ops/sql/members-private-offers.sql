-- Staff-issued birthday offers. Offers do not occupy the calendar; only checkout does.
create table public.mem_private_offers (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  starts_at timestamptz not null,
  paid_places integer not null check (paid_places > 0),
  price_pence integer not null check (price_pence > 0),
  venue_id uuid not null references public.mem_venues(id),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  booking_id uuid references public.mem_private_bookings(id),
  check (expires_at = created_at + interval '48 hours')
);
alter table public.mem_private_offers enable row level security;
revoke all on public.mem_private_offers from anon, authenticated;
grant all on public.mem_private_offers to service_role;
alter table public.mem_private_bookings add column equipment_deadline_days integer not null default 14
  check (equipment_deadline_days in (7,14));

create function public.mem_create_private_offer(p_starts_at timestamptz, p_paid_places integer, p_created_by uuid)
returns mem_private_offers language plpgsql set search_path to 'public' as $$
declare
  t mem_private_booking_types;
  o mem_private_offers;
  problem text;
begin
  if p_created_by is null or p_starts_at is null or p_paid_places is null then
    raise exception 'mem_private_bad_places';
  end if;
  select * into t from mem_private_booking_types where kind = 'birthday';
  if not found or not t.active then raise exception 'mem_private_not_offered'; end if;
  perform mem_private_lock_date(p_starts_at);
  problem := mem_private_slot_problem('birthday', p_starts_at, 2, true);
  if problem is not null then raise exception 'mem_private_%', problem; end if;
  if (p_starts_at at time zone 'Europe/London')::date >= (now() at time zone 'Europe/London')::date + 14 then
    raise exception 'mem_private_offer_use_public';
  end if;
  if p_paid_places < t.min_places then raise exception 'mem_private_below_minimum'; end if;
  if t.max_places is not null and p_paid_places + 1 > t.max_places then raise exception 'mem_private_above_maximum'; end if;
  if t.unit_price_pence is null or t.unit_price_pence <= 0 then raise exception 'mem_private_price_required'; end if;
  insert into mem_private_offers(starts_at, paid_places, price_pence, venue_id, created_by_user_id)
    values(p_starts_at, p_paid_places, p_paid_places * t.unit_price_pence, t.venue_id, p_created_by)
    returning * into o;
  return o;
end;
$$;

-- Token, account and price are verified here under the same calendar lock as ordinary bookings.
-- A repeat attempt returns its existing hold; a different account cannot take it over.
create function public.mem_hold_private_offer(p_token text, p_account_id uuid)
returns mem_private_bookings language plpgsql set search_path to 'public' as $$
declare
  o mem_private_offers;
  b mem_private_bookings;
  t mem_private_booking_types;
  problem text;
begin
  select * into o from mem_private_offers where token = p_token for update;
  if not found then raise exception 'mem_private_offer_missing'; end if;
  if o.expires_at <= now() or o.starts_at <= now() then raise exception 'mem_private_offer_expired'; end if;
  if p_account_id is null or not exists(select 1 from mem_accounts where id = p_account_id) then
    raise exception 'mem_private_participant_mismatch';
  end if;
  perform mem_private_lock_date(o.starts_at);
  if o.booking_id is not null then
    select * into b from mem_private_bookings where id = o.booking_id;
    if b.status = 'confirmed' then raise exception 'mem_private_offer_used'; end if;
    -- A lapsed hold is released here rather than waiting for the sweep, so a retry can start afresh.
    if b.status = 'pending_payment' and b.expires_at <= now() then
      update mem_private_bookings set status = 'cancelled', cancelled_at = now() where id = b.id;
    elsif b.status = 'pending_payment' then
      if b.host_account_id <> p_account_id then raise exception 'mem_private_unavailable'; end if;
      return b;
    end if;
  end if;
  -- Stripe cannot create a hosted session with less than 30 minutes to pay.
  if least(o.expires_at, o.starts_at) < now() + interval '31 minutes' then
    raise exception 'mem_private_offer_checkout_closed';
  end if;
  select * into t from mem_private_booking_types where kind = 'birthday';
  if not found or not t.active or t.venue_id <> o.venue_id then raise exception 'mem_private_not_offered'; end if;
  if t.max_places is not null and o.paid_places + 1 > t.max_places then raise exception 'mem_private_above_maximum'; end if;
  problem := mem_private_slot_problem('birthday', o.starts_at, 2, true);
  if problem is not null then raise exception 'mem_private_%', problem; end if;
  insert into mem_private_bookings(kind, status, source, venue_id, starts_at, ends_at,
    host_account_id, paid_places, total_places, price_pence, hire_pence, expires_at,
    created_by_user_id, equipment_deadline_days)
  values('birthday', 'pending_payment', 'online', o.venue_id, o.starts_at, o.starts_at + interval '2 hours',
    p_account_id, o.paid_places, o.paid_places + 1, o.price_pence, 0,
    least(now() + interval '41 minutes', o.expires_at + interval '10 minutes', o.starts_at + interval '10 minutes'),
    o.created_by_user_id, 7) returning * into b;
  update mem_private_offers set booking_id = b.id where id = o.id;
  return b;
exception when exclusion_violation then raise exception 'mem_private_unavailable';
end;
$$;
revoke all on function public.mem_create_private_offer(timestamptz,integer,uuid) from public, anon, authenticated;
revoke all on function public.mem_hold_private_offer(text,uuid) from public, anon, authenticated;
grant execute on function public.mem_create_private_offer(timestamptz,integer,uuid) to service_role;
grant execute on function public.mem_hold_private_offer(text,uuid) to service_role;

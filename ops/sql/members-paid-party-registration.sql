-- Already-paid birthday parties can reserve their slot before the host has an account.
alter type public.mem_payment_handling add value if not exists 'paid_externally';
alter table public.mem_private_bookings add column awaiting_host boolean not null default false;
alter table public.mem_private_bookings drop constraint mem_private_host_unless_block;
alter table public.mem_private_bookings add constraint mem_private_host_unless_block check (
  (kind = 'block' and host_account_id is null and not awaiting_host)
  or (kind <> 'block' and host_account_id is not null and not awaiting_host)
  or (kind = 'birthday' and host_account_id is null and awaiting_host and source = 'manual')
);
create table public.mem_paid_party_registrations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  booking_id uuid not null unique references public.mem_private_bookings(id),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  recipient_email text not null check(recipient_email = lower(btrim(recipient_email)) and position('@' in recipient_email) > 1),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
alter table public.mem_paid_party_registrations enable row level security;
revoke all on public.mem_paid_party_registrations from anon, authenticated;
grant all on public.mem_paid_party_registrations to service_role;

create function public.mem_create_paid_party_registration(
  p_request_id uuid, p_email text, p_starts_at timestamptz, p_paid_places integer,
  p_actor uuid, p_note text default null
) returns mem_paid_party_registrations language plpgsql set search_path to 'public' as $$
declare
  r mem_paid_party_registrations;
  t mem_private_booking_types;
  b mem_private_bookings;
  problem text;
begin
  if p_request_id is null or p_actor is null or p_starts_at is null or p_paid_places is null
    or p_email is null or position('@' in p_email) < 2 then raise exception 'mem_private_bad_places'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mem_paid_party:' || p_request_id::text, 0));
  select * into r from mem_paid_party_registrations where request_id = p_request_id;
  if found then
    if r.created_by_user_id <> p_actor then raise exception 'mem_paid_party_forbidden'; end if;
    return r;
  end if;
  select * into t from mem_private_booking_types where kind = 'birthday';
  if not found then raise exception 'mem_private_not_offered'; end if;
  if p_paid_places < t.min_places then raise exception 'mem_private_below_minimum'; end if;
  if t.max_places is not null and p_paid_places + 1 > t.max_places then raise exception 'mem_private_above_maximum'; end if;
  if t.unit_price_pence is null then raise exception 'mem_private_price_required'; end if;
  perform mem_private_lock_date(p_starts_at);
  problem := mem_private_slot_problem('birthday', p_starts_at, 2, true);
  if problem is not null then raise exception 'mem_private_%', problem; end if;
  insert into mem_private_bookings(kind,status,source,venue_id,starts_at,ends_at,paid_places,total_places,
    price_pence,hire_pence,payment_handling,created_by_user_id,note,awaiting_host)
  values('birthday','confirmed','manual',t.venue_id,p_starts_at,p_starts_at+interval '2 hours',p_paid_places,p_paid_places+1,
    t.unit_price_pence*p_paid_places,0,'paid_externally',p_actor,p_note,true) returning * into b;
  insert into mem_paid_party_registrations(request_id,booking_id,recipient_email,created_by_user_id)
    values(p_request_id,b.id,lower(btrim(p_email)),p_actor) returning * into r;
  return r;
exception when exclusion_violation then raise exception 'mem_private_unavailable';
end;
$$;

create function public.mem_claim_paid_party(p_token text, p_account_id uuid)
returns mem_private_bookings language plpgsql set search_path to 'public' as $$
declare
  r mem_paid_party_registrations;
  b mem_private_bookings;
  verified_email text;
begin
  select lower(u.email) into verified_email from mem_accounts a join auth.users u on u.id = a.user_id
    where a.id = p_account_id and u.email_confirmed_at is not null;
  select * into r from mem_paid_party_registrations where token = p_token for update;
  if not found then raise exception 'mem_paid_party_missing'; end if;
  if verified_email is null or verified_email <> r.recipient_email then raise exception 'mem_paid_party_forbidden'; end if;
  select * into b from mem_private_bookings where id = r.booking_id for update;
  if b.status <> 'confirmed' or b.starts_at <= now() then raise exception 'mem_paid_party_closed'; end if;
  if not b.awaiting_host then
    if b.host_account_id = p_account_id then return b; end if;
    raise exception 'mem_paid_party_forbidden';
  end if;
  update mem_private_bookings set host_account_id = p_account_id, awaiting_host = false,
    invite_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    where id = b.id returning * into b;
  update mem_paid_party_registrations set claimed_at = now() where id = r.id;
  return b;
end;
$$;
revoke all on function public.mem_create_paid_party_registration(uuid,text,timestamptz,integer,uuid,text) from public,anon,authenticated;
revoke all on function public.mem_claim_paid_party(text,uuid) from public,anon,authenticated;
grant execute on function public.mem_create_paid_party_registration(uuid,text,timestamptz,integer,uuid,text) to service_role;
grant execute on function public.mem_claim_paid_party(text,uuid) to service_role;

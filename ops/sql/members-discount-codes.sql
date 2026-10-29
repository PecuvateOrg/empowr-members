-- Apply through the shared database Management API, then regenerate its ledger.
-- This is a reviewed rollout input, not a generated migration.
begin;
create table public.mem_discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,40}$'),
  kind text not null check (kind in ('percentage','fixed')),
  value integer not null check (value > 0 and value <= 100000000 and (kind <> 'percentage' or value <= 100)),
  offering_id uuid references public.mem_offerings(id) on delete restrict,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.mem_discount_codes enable row level security;
revoke all on public.mem_discount_codes from public, anon, authenticated;
grant select, insert, update on public.mem_discount_codes to service_role;

alter table public.mem_bookings
  add column discount_code_id uuid references public.mem_discount_codes(id),
  add column discount_pence integer not null default 0 check (discount_pence >= 0);

-- Prices come from the existing authoritative hold RPC, never the browser.
-- The whole basket is locked and changed together, before credit reservation.
create function public.mem_apply_booking_discount(
  p_account_id uuid, p_booking_ids uuid[], p_code text,
  p_expected_discount integer, p_expected_total integer
) returns setof public.mem_bookings
language plpgsql security definer set search_path = public as $$
declare d mem_discount_codes; savings integer; total integer;
begin
  perform 1 from mem_accounts where id=p_account_id for update;
  if not found then raise exception 'mem_discount_hold_invalid'; end if;
  select * into d from mem_discount_codes where code=upper(btrim(p_code)) for share;
  if not found or not d.active or (d.expires_at is not null and d.expires_at<=now()) then
    raise exception 'mem_discount_unavailable';
  end if;
  perform 1 from mem_bookings where id=any(p_booking_ids) order by id for update;
  if coalesce(cardinality(p_booking_ids),0)=0 or cardinality(p_booking_ids)>10 or
    (select count(*) from mem_bookings where id=any(p_booking_ids)
      and account_id=p_account_id and status='pending_payment' and expires_at>now()
      and stripe_checkout_session_id is null and credit_applied_pence=0
      and discount_code_id is null and discount_pence=0)<>cardinality(p_booking_ids) then
    raise exception 'mem_discount_hold_invalid';
  end if;

  with prices as (
    select b.id, b.price_paid_pence,
      case when (d.offering_id is null or d.offering_id=coalesce(o.offering_id,r.offering_id))
        and coalesce(o.offering_id,r.offering_id) is not null
      then least(b.price_paid_pence, case when d.kind='fixed' then d.value
        else round(b.price_paid_pence::numeric*d.value/100)::integer end)
      else 0 end as saving
    from mem_bookings b
    left join mem_occurrences o on o.id=b.occurrence_id
    left join mem_course_runs r on r.id=b.course_run_id
    where b.id=any(p_booking_ids)
  ) update mem_bookings b set discount_code_id=d.id,
      discount_pence=p.saving, price_paid_pence=p.price_paid_pence-p.saving
    from prices p where b.id=p.id;
  select sum(discount_pence),sum(price_paid_pence) into savings,total
    from mem_bookings where id=any(p_booking_ids);
  if coalesce(savings,0)=0 then raise exception 'mem_discount_not_applicable'; end if;
  if p_expected_discount is null or p_expected_total is null or savings<>p_expected_discount or total<>p_expected_total then
    raise exception 'mem_discount_changed';
  end if;
  if total>0 and total<30 then raise exception 'mem_discount_minimum'; end if;
  return query select * from mem_bookings where id=any(p_booking_ids) order by id;
end;
$$;

-- A 100% discount confirms held places without creating a payment. No client
-- can call this function, and it refuses anything with a non-zero balance.
create function public.mem_confirm_discount_booking(p_account_id uuid,p_booking_ids uuid[],p_token text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from mem_accounts where id=p_account_id for update;
  perform 1 from mem_bookings where id=any(p_booking_ids) order by id for update;
  if p_token is null or p_token !~ '^memdiscount_[a-f0-9-]{36}$' or
    coalesce(cardinality(p_booking_ids),0)=0 or cardinality(p_booking_ids)>10 or
    (select count(*) from mem_bookings where id=any(p_booking_ids)
      and account_id=p_account_id and status='pending_payment' and expires_at>now()
      and stripe_checkout_session_id is null and price_paid_pence=0
      and credit_applied_pence=0 and discount_code_id is not null)<>cardinality(p_booking_ids) then
    raise exception 'mem_discount_hold_invalid';
  end if;
  update mem_bookings set status='confirmed',expires_at=null,stripe_checkout_session_id=p_token
    where id=any(p_booking_ids);
end;
$$;
revoke all on function public.mem_apply_booking_discount(uuid,uuid[],text,integer,integer) from public,anon,authenticated;
revoke all on function public.mem_confirm_discount_booking(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.mem_apply_booking_discount(uuid,uuid[],text,integer,integer) to service_role;
grant execute on function public.mem_confirm_discount_booking(uuid,uuid[],text) to service_role;
commit;

-- Deployment input, NOT a migration ledger entry. Apply through Supabase
-- Management API, then regenerate the shared schema-of-record ledger.
-- Must be applied before deploying the matching application code.
begin;
alter table public.mem_credits
  add column if not exists external_platform text,
  add column if not exists external_reference text,
  add column if not exists external_session text,
  add column if not exists external_session_date date,
  add column if not exists reason text,
  add column if not exists issued_by uuid,
  add column if not exists request_id uuid;
create unique index if not exists mem_credit_request_unique on public.mem_credits(request_id);
-- A legacy payment can be credited once, even by two staff at the same time.
create unique index if not exists mem_credit_external_unique
  on public.mem_credits(lower(btrim(external_platform)), lower(btrim(external_reference)))
  where external_reference is not null;
create unique index if not exists mem_credit_booking_unique
  on public.mem_credits(source_booking_id) where source_booking_id is not null;

alter table public.mem_bookings add column if not exists credit_applied_pence integer not null default 0
  check (credit_applied_pence >= 0 and credit_applied_pence <= coalesce(price_paid_pence,0));

create table public.mem_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mem_accounts(id),
  credit_id uuid not null references public.mem_credits(id),
  booking_id uuid not null references public.mem_bookings(id),
  amount_pence integer not null check(amount_pence > 0),
  state text not null default 'reserved' check(state in ('reserved','spent','released')),
  created_at timestamptz not null default now(),
  unique(credit_id, booking_id)
);
alter table public.mem_credit_allocations enable row level security;
create policy mem_credit_allocations_read on public.mem_credit_allocations for select to authenticated
 using(account_id in (select id from public.mem_accounts where user_id=auth.uid()));
grant select on public.mem_credit_allocations to authenticated;
grant all on public.mem_credit_allocations to service_role;

create table public.mem_booking_refunds (
  booking_id uuid primary key references public.mem_bookings(id),
  account_id uuid not null references public.mem_accounts(id),
  card_pence integer not null check(card_pence>=0),
  credit_pence integer not null check(credit_pence>=0),
  payment_intent text,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.mem_booking_refunds enable row level security;
grant all on public.mem_booking_refunds to service_role;
revoke all on public.mem_booking_refunds from anon,authenticated;
revoke all on public.mem_credit_allocations from anon,authenticated;
grant select on public.mem_credit_allocations to authenticated;
revoke insert,update,delete on public.mem_credits from anon,authenticated;

-- Existing fully redeemed credits stay spent. Existing unredeemed credits
-- become available without a backfill changing their value or expiry.
create view public.mem_credit_balances with (security_invoker=true) as
 select c.id,c.account_id,c.amount_pence,c.expires_at,c.source_booking_id,
 c.external_platform,c.external_reference,c.external_session,c.external_session_date,c.created_at,
 case when c.redeemed_booking_id is not null or c.expires_at<=now() then 0
 else greatest(0,c.amount_pence-coalesce((select sum(a.amount_pence) from public.mem_credit_allocations a
 where a.credit_id=c.id and a.state in ('reserved','spent')),0)) end::integer as available_pence,
 coalesce((select sum(a.amount_pence) from public.mem_credit_allocations a
 where a.credit_id=c.id and a.state='reserved'),0)::integer as reserved_pence
 from public.mem_credits c;
grant select on public.mem_credit_balances to authenticated,service_role;

create function public.mem_issue_credit(p_account_id uuid,p_request_id uuid,p_staff_id uuid,
 p_booking_id uuid,p_amount integer,p_platform text,p_reference text,p_session text,p_session_date date,
 p_reason text,p_expires_at timestamptz) returns public.mem_credits
 language plpgsql security definer set search_path=public as $$
declare b mem_bookings; c mem_credits;
begin
 perform 1 from mem_accounts where id=p_account_id for update;
 if not found then raise exception 'mem_account_missing'; end if;
 select * into c from mem_credits where request_id=p_request_id;
 if found then
   if c.account_id<>p_account_id then raise exception 'mem_credit_request_conflict'; end if;
   return c;
 end if;
 if p_request_id is null or p_staff_id is null or nullif(btrim(p_reason),'') is null
 or p_expires_at is null or p_expires_at<=now() then raise exception 'mem_credit_invalid'; end if;
 if p_booking_id is not null then
   select * into b from mem_bookings where id=p_booking_id and account_id=p_account_id for update;
   if not found or b.status<>'confirmed' or coalesce(b.price_paid_pence,0)<=0
     or exists(select 1 from mem_booking_refunds where booking_id=p_booking_id)
     then raise exception 'mem_booking_not_creditable'; end if;
   p_amount:=b.price_paid_pence;
 else
   if nullif(btrim(p_platform),'') is null or nullif(btrim(p_reference),'') is null
     or nullif(btrim(p_session),'') is null or p_session_date is null
     then raise exception 'mem_legacy_details_required'; end if;
 end if;
 if p_amount is null or p_amount<=0 then raise exception 'mem_credit_invalid'; end if;
 insert into mem_credits(account_id,amount_pence,source_booking_id,expires_at,external_platform,
 external_reference,external_session,external_session_date,reason,issued_by,request_id)
 values(p_account_id,p_amount,p_booking_id,p_expires_at,
 case when p_booking_id is null then btrim(p_platform) end,
 case when p_booking_id is null then btrim(p_reference) end,
 case when p_booking_id is null then btrim(p_session) end,
 case when p_booking_id is null then p_session_date end,btrim(p_reason),p_staff_id,p_request_id) returning * into c;
 if p_booking_id is not null then
   update mem_bookings set status='credited',cancelled_at=now() where id=p_booking_id;
 end if;
 return c;
end $$;

-- Called after the existing capacity/waiver hold, before any Stripe request.
-- The account lock serialises concurrent checkouts; credit locks also protect
-- against another transaction restoring/refunding the same notes.
create function public.mem_reserve_credit(p_account_id uuid,p_booking_ids uuid[],p_expected integer,p_token text)
 returns setof public.mem_bookings language plpgsql security definer set search_path=public as $$
declare b mem_bookings; c record; total integer; available integer; requested integer; remaining integer; take integer; used integer;
begin
 perform 1 from mem_accounts where id=p_account_id for update;
 if not found then raise exception 'mem_account_missing'; end if;
 perform 1 from mem_bookings where id=any(p_booking_ids) order by id for update;
 if cardinality(p_booking_ids)=0 or (select count(*) from mem_bookings where id=any(p_booking_ids)
 and account_id=p_account_id and status='pending_payment' and expires_at>now()
 and stripe_checkout_session_id is null and credit_applied_pence=0)<>cardinality(p_booking_ids)
 then raise exception 'mem_credit_hold_invalid'; end if;
 select sum(price_paid_pence) into total from mem_bookings where id=any(p_booking_ids);
 perform 1 from mem_credits where account_id=p_account_id order by id for update;
 select coalesce(sum(available_pence),0) into available from mem_credit_balances where account_id=p_account_id;
 requested:=least(total,available);
 -- Stripe GBP minimum: leave 30p on the card when credit cannot cover all.
 if total>requested and total-requested<30 then requested:=greatest(0,total-30); end if;
 if p_expected is null or p_expected<0 or requested<>p_expected then raise exception 'mem_credit_balance_changed'; end if;
 remaining:=requested;
 for b in select * from mem_bookings where id=any(p_booking_ids) order by id loop
   used:=0;
   for c in select * from mem_credit_balances where account_id=p_account_id and available_pence>0
     order by expires_at nulls last,created_at,id loop
     take:=least(c.available_pence,b.price_paid_pence-used,remaining);
     exit when take<=0;
     insert into mem_credit_allocations(account_id,credit_id,booking_id,amount_pence)
       values(p_account_id,c.id,b.id,take);
     used:=used+take; remaining:=remaining-take;
   end loop;
   update mem_bookings set credit_applied_pence=used,stripe_checkout_session_id=p_token,
     expires_at=now()+interval '45 minutes' where id=b.id;
 end loop;
 if remaining<>0 then raise exception 'mem_credit_allocation_failed'; end if;
 return query select * from mem_bookings where id=any(p_booking_ids) order by id;
end $$;

-- Lifecycle updates and the existing expiry sweep release reservations in
-- the same transaction. Confirming a booking commits, never re-deducts credit.
create function public.mem_credit_booking_transition() returns trigger
 language plpgsql security definer set search_path=public as $$
begin
 if new.status='confirmed' and old.status='pending_payment' then
   if (select coalesce(sum(amount_pence),0) from mem_credit_allocations
       where booking_id=new.id and state='reserved')<>new.credit_applied_pence
     then raise exception 'mem_credit_reservation_missing'; end if;
   update mem_credit_allocations set state='spent' where booking_id=new.id and state='reserved';
 elsif new.status in ('cancelled','refunded','credited') then
   update mem_credit_allocations set state='released' where booking_id=new.id and state='reserved';
   if new.status='refunded' then
     update mem_credit_allocations set state='released' where booking_id=new.id and state='spent';
   end if;
 end if;
 return new;
end $$;
create trigger mem_credit_booking_transition after update of status on public.mem_bookings
 for each row execute function public.mem_credit_booking_transition();

create function public.mem_begin_booking_refund(p_booking_id uuid,p_account_id uuid)
 returns public.mem_booking_refunds language plpgsql security definer set search_path=public as $$
declare b mem_bookings; r mem_booking_refunds;
begin
 select * into b from mem_bookings where id=p_booking_id and account_id=p_account_id for update;
 if not found then raise exception 'mem_booking_missing'; end if;
 select * into r from mem_booking_refunds where booking_id=p_booking_id;
 if found then return r; end if;
 if b.status<>'confirmed' or coalesce(b.price_paid_pence,0)<=0 then raise exception 'mem_booking_not_refundable'; end if;
 if b.price_paid_pence>b.credit_applied_pence and b.stripe_payment_intent_id is null
 then raise exception 'mem_payment_missing'; end if;
 insert into mem_booking_refunds(booking_id,account_id,card_pence,credit_pence,payment_intent)
 values(b.id,b.account_id,b.price_paid_pence-b.credit_applied_pence,b.credit_applied_pence,b.stripe_payment_intent_id)
 returning * into r;
 -- Durable claim: never roll back after an ambiguous Stripe timeout. Retry
 -- with the same Stripe idempotency key before finishing this transaction.
 update mem_bookings set status='cancelled',cancelled_at=now() where id=b.id;
 return r;
end $$;

create function public.mem_finish_booking_refund(p_booking_id uuid) returns boolean
 language plpgsql security definer set search_path=public as $$
declare r mem_booking_refunds;
begin
 perform 1 from mem_bookings where id=p_booking_id for update;
 select * into r from mem_booking_refunds where booking_id=p_booking_id for update;
 if not found then raise exception 'mem_refund_missing'; end if;
 if r.completed then return false; end if;
 update mem_bookings set status='refunded' where id=p_booking_id;
 update mem_booking_refunds set completed=true where booking_id=p_booking_id;
 return true;
end $$;

revoke all on function public.mem_issue_credit(uuid,uuid,uuid,uuid,integer,text,text,text,date,text,timestamptz) from public,anon,authenticated;
revoke all on function public.mem_reserve_credit(uuid,uuid[],integer,text) from public,anon,authenticated;
revoke all on function public.mem_begin_booking_refund(uuid,uuid) from public,anon,authenticated;
revoke all on function public.mem_finish_booking_refund(uuid) from public,anon,authenticated;
revoke all on function public.mem_credit_booking_transition() from public,anon,authenticated;
grant execute on function public.mem_issue_credit(uuid,uuid,uuid,uuid,integer,text,text,text,date,text,timestamptz) to service_role;
grant execute on function public.mem_reserve_credit(uuid,uuid[],integer,text) to service_role;
grant execute on function public.mem_begin_booking_refund(uuid,uuid) to service_role;
grant execute on function public.mem_finish_booking_refund(uuid) to service_role;
create function public.mem_settle_credit_checkout(p_token text,p_account_id uuid,p_session_id text,
 p_payment_intent text,p_amount integer,p_action text) returns integer
 language plpgsql security definer set search_path=public as $$
declare ids uuid[]; expected integer; n integer;
begin
 perform 1 from mem_bookings where account_id=p_account_id
   and stripe_checkout_session_id in (p_token,p_session_id) order by id for update;
 select array_agg(id),sum(price_paid_pence-credit_applied_pence) into ids,expected
   from mem_bookings where account_id=p_account_id and stripe_checkout_session_id in (p_token,p_session_id);
 if ids is null then raise exception 'mem_checkout_missing'; end if;
 if p_action='paid' then
   if p_amount<>expected or p_amount is null then raise exception 'mem_checkout_amount_mismatch'; end if;
   if not exists(select 1 from mem_bookings where id=any(ids) and status='pending_payment') then
     -- Already settled replays (including later cancellations) are no-ops.
     if exists(select 1 from mem_bookings b where id=any(ids) and status='cancelled'
       and not exists(select 1 from mem_booking_refunds r where r.booking_id=b.id))
       then raise exception 'mem_checkout_hold_released'; end if;
     return 0;
   end if;
   if exists(select 1 from mem_bookings where id=any(ids) and status<>'pending_payment')
     then raise exception 'mem_checkout_hold_released'; end if;
   update mem_bookings set status='confirmed',stripe_checkout_session_id=p_session_id,
     stripe_payment_intent_id=p_payment_intent,expires_at=null where id=any(ids);
 elsif p_action='processing' then
   update mem_bookings set expires_at=null,stripe_checkout_session_id=p_session_id
     where id=any(ids) and status='pending_payment';
 elsif p_action='release' then
   update mem_bookings set status='cancelled',cancelled_at=now()
     where id=any(ids) and status='pending_payment';
 else raise exception 'mem_checkout_action_invalid'; end if;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.mem_settle_credit_checkout(text,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.mem_settle_credit_checkout(text,uuid,text,text,integer,text) to service_role;
commit;

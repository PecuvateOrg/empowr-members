-- ✅ APPLIED LIVE 2026-09-28 — now in the ledger. Kept as the reviewed source;
-- do NOT re-apply. Change the schema with a new migration instead.
-- Deployment input, NOT a migration ledger entry. Apply through the Supabase
-- Management API, then regenerate the shared schema-of-record ledger with
-- dump-ledger.mjs.
--
-- ORDERING IS MANDATORY: apply this AFTER ops/scripts/member-credits.sql. It
-- references mem_bookings.credit_applied_pence and the mem_booking_refunds
-- table, neither of which exists until that script has run.
--
-- Must be applied before deploying the matching application code.
--
--
-- WHY: RESCUE CANNOT RESTORE A BOOKING THAT SPENT CREDIT.
--
-- mem_credit_booking_transition moves allocations `reserved -> spent` on
-- pending_payment -> confirmed ONLY. Rescue's transition is
-- cancelled -> confirmed, which matches neither branch of that trigger — and
-- by the time rescue runs, the row already passed through `cancelled`, whose
-- branch released every reserved allocation back to the member's balance.
--
-- So a rescued credit booking would be confirmed, with the place held and only
-- the card difference paid, while the credit that funded it sits spendable in
-- the balance. The member gets the value twice. Worse, rescue also bypasses the
-- `mem_credit_reservation_missing` assertion, which only guards the
-- pending_payment -> confirmed path, so nothing else would catch it.
--
-- Re-allocating instead of refusing is not available: the released credit may
-- already have been spent on another booking, and the specific notes it came
-- from may have expired. There is nothing safe to re-reserve. The remedy is a
-- human one — refund what was taken by card and issue fresh credit, or book the
-- place manually — so the error has to say that rather than fail generically.
--
-- ⚠️ This is the CREDIT case specifically. A card booking that is mid-refund is
-- ALREADY refused by the existing all-or-nothing guard below, because it
-- carries a stripe_payment_intent_id and that guard demands a null one. The
-- refund check added here is defence in depth for the paths where it does not:
-- a fully credit-funded booking never has a payment intent at all.
create or replace function public.mem_rescue_checkout(
  p_checkout_session_id text,
  p_user_id uuid,
  p_payment_intent_id text,
  p_allow_over_capacity boolean default false
) returns setof mem_bookings
language plpgsql
set search_path to 'public'
as $function$
declare
  v_ids uuid[];
  v_over boolean := false;
  v_capacity integer;
  v_live integer;
  r record;
begin
  -- Evidence of payment is REQUIRED, and it is the control that makes this
  -- safe. Seven code paths write status='cancelled'; two of them are
  -- deliberate (an admin releasing a hold, Empowr cancelling a session) and
  -- look identical to a swept hold on every other column. A deliberate
  -- release has no payment, so demanding the payment reference is what
  -- separates "the money exists and we lost the booking" from "someone chose
  -- to free this place". The caller takes it from Stripe, never from a human.
  if p_payment_intent_id is null or btrim(p_payment_intent_id) = '' then
    raise exception 'mem_payment_evidence_required';
  end if;

  -- Lock every row on this checkout. A basket pays for several at once, so
  -- the unit of rescue is the checkout, exactly as it is for the webhook.
  select array_agg(id) into v_ids
    from (
      select id from mem_bookings
       where stripe_checkout_session_id = p_checkout_session_id
       order by id
       for update
    ) locked;

  if v_ids is null then
    raise exception 'mem_booking_not_found';
  end if;

  -- All-or-nothing. A partially rescuable checkout means our picture of it is
  -- wrong, and guessing which half to restore is how one member gets a place
  -- and another silently does not.
  if exists (
    select 1 from mem_bookings
     where id = any(v_ids)
       and (status <> 'cancelled'
            or stripe_payment_intent_id is not null
            or rescued_at is not null)
  ) then
    raise exception 'mem_not_rescuable';
  end if;

  -- Credit cannot be re-reserved. See the note at the top of this file: the
  -- allocations were released on the way into `cancelled`, and rescue's
  -- cancelled -> confirmed transition neither re-reserves them nor trips the
  -- reservation assertion. Checked across the whole checkout, because the
  -- basket is the unit of rescue and one credit-funded row poisons the lot.
  if exists (
    select 1 from mem_bookings
     where id = any(v_ids)
       and coalesce(credit_applied_pence, 0) > 0
  ) then
    raise exception 'mem_credit_not_rescuable';
  end if;

  -- A refund already claimed for any row on this checkout. mem_booking_refunds
  -- is written BEFORE Stripe is called and is deliberately never rolled back,
  -- so its presence means "money is on its way back", whether or not the row
  -- has reached `refunded` yet. Restoring the place would hand back both.
  if exists (
    select 1 from mem_booking_refunds where booking_id = any(v_ids)
  ) then
    raise exception 'mem_refund_in_progress';
  end if;

  -- Occurrence targets. The session must still be scheduled and still to come:
  -- that is what stops a cancelled session or a past date being rescued into.
  for r in
    select occurrence_id as target_id, count(*)::int as n
      from mem_bookings
     where id = any(v_ids) and occurrence_id is not null
     group by occurrence_id
  loop
    select coalesce(o.capacity, v.default_capacity) into v_capacity
      from mem_occurrences o
      join mem_offerings f on f.id = o.offering_id
      left join mem_venues v on v.id = coalesce(o.venue_id, f.venue_id)
     where o.id = r.target_id
       and o.status = 'scheduled'
       and o.starts_at > now()
     for update of o;
    if not found then
      raise exception 'mem_not_bookable';
    end if;

    select count(*) into v_live
      from mem_bookings
     where occurrence_id = r.target_id
       and status in ('pending_payment', 'confirmed', 'attended');

    if v_capacity is not null and v_live + r.n > v_capacity then
      if not p_allow_over_capacity then
        raise exception 'mem_capacity_exceeded';
      end if;
      v_over := true;
    end if;
  end loop;

  -- Course-run targets.
  for r in
    select course_run_id as target_id, count(*)::int as n
      from mem_bookings
     where id = any(v_ids) and course_run_id is not null
     group by course_run_id
  loop
    select cr.capacity into v_capacity
      from mem_course_runs cr
      join mem_offerings f on f.id = cr.offering_id
     where cr.id = r.target_id
       and f.active = true
       and (cr.ends_on is null or cr.ends_on >= current_date)
     for update of cr;
    if not found then
      raise exception 'mem_not_bookable';
    end if;

    select count(*) into v_live
      from mem_bookings
     where course_run_id = r.target_id
       and status in ('pending_payment', 'confirmed', 'attended');

    if v_capacity is not null and v_live + r.n > v_capacity then
      if not p_allow_over_capacity then
        raise exception 'mem_capacity_exceeded';
      end if;
      v_over := true;
    end if;
  end loop;

  return query
    update mem_bookings
       set status = 'confirmed',
           stripe_payment_intent_id = p_payment_intent_id,
           expires_at = null,
           cancelled_at = null,
           rescued_by_user_id = p_user_id,
           rescued_at = now(),
           rescued_over_capacity = v_over
     where id = any(v_ids)
    returning *;
exception
  -- Mirrors mem_hold_bookings, which names this same collision
  -- 'mem_duplicate_booking'. Named separately here because the remedy differs:
  -- there it means "you already booked this", here it means "your money is a
  -- duplicate and needs refunding".
  when unique_violation then
    raise exception 'mem_already_booked';
end;
$function$;

revoke all on function public.mem_rescue_checkout(text, uuid, text, boolean) from public;
grant execute on function public.mem_rescue_checkout(text, uuid, text, boolean) to service_role;

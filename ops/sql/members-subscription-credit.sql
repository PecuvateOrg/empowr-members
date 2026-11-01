-- Subscription cancellation credit, stored against its booking (issue #141).
--
-- #139 issued these through mem_issue_credit's old-platform path, so they were
-- labelled as old-platform credits and the booking was marked `credited` in a
-- second, separate write. This function does both in one transaction and
-- records the credit with source_booking_id, like any other cancelled booking.
--
-- A subscriber's booking is £0 (the plan pays for it), so mem_issue_credit's
-- booking path, which credits price_paid_pence, cannot be reused: the amount
-- is the per-session share the app calculates and passes in.
--
-- Duplicates are stopped twice: request_id (the app passes the booking id)
-- and mem_credit_booking_unique on source_booking_id.
begin;

create or replace function public.mem_issue_subscription_credit(
  p_account_id uuid, p_request_id uuid, p_staff_id uuid, p_booking_id uuid,
  p_amount integer, p_reason text, p_expires_at timestamp with time zone
)
returns mem_credits
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b mem_bookings; c mem_credits;
begin
 perform 1 from mem_accounts where id=p_account_id for update;
 if not found then raise exception 'mem_account_missing'; end if;
 select * into c from mem_credits where request_id=p_request_id;
 if found then
   if c.account_id<>p_account_id then raise exception 'mem_credit_request_conflict'; end if;
   return c;
 end if;
 if p_request_id is null or p_staff_id is null or p_booking_id is null
 or nullif(btrim(p_reason),'') is null or p_amount is null or p_amount<=0
 or p_expires_at is null or p_expires_at<=now() then raise exception 'mem_credit_invalid'; end if;
 select * into b from mem_bookings where id=p_booking_id and account_id=p_account_id for update;
 if not found or b.status<>'confirmed' or b.source<>'member' or coalesce(b.price_paid_pence,0)<>0
   then raise exception 'mem_booking_not_creditable'; end if;
 insert into mem_credits(account_id,amount_pence,source_booking_id,expires_at,reason,issued_by,request_id)
 values(p_account_id,p_amount,p_booking_id,p_expires_at,btrim(p_reason),p_staff_id,p_request_id)
 returning * into c;
 update mem_bookings set status='credited',cancelled_at=now() where id=p_booking_id;
 return c;
end $function$;

revoke all on function public.mem_issue_subscription_credit(uuid,uuid,uuid,uuid,integer,text,timestamp with time zone) from public,anon,authenticated;
grant execute on function public.mem_issue_subscription_credit(uuid,uuid,uuid,uuid,integer,text,timestamp with time zone) to service_role;

-- Re-file the credits #139 already issued (5 on SYNKRON8, 2026-11-23) so they
-- read as cancelled-booking credits, not old-platform ones. Amounts unchanged.
update public.mem_credits c
   set source_booking_id = b.id,
       external_platform = null, external_reference = null,
       external_session = null, external_session_date = null
  from public.mem_bookings b
 where c.external_platform = 'Empowr subscription cancellation'
   and c.source_booking_id is null
   and b.id::text = c.external_reference
   and b.account_id = c.account_id
   and b.status = 'credited';

commit;

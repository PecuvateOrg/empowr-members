-- General member credit (owner, 2026-09-28).
--
-- mem_issue_credit only accepted credit tied to a Members booking (cancelled
-- and credited) or to an old-platform booking (platform, reference, session
-- and date all required). Staff also need plain account credit: a member who
-- takes credit instead of a refund, a goodwill gesture, compensation.
--
-- Same signature, so no overload is created and the app's existing call is
-- unchanged. Which path runs is decided by what is supplied:
--   booking id              → cancel that booking and credit its full value
--   any old-platform detail → old-platform credit, all four details required
--   neither                 → general credit: amount and reason only
-- A partly filled old-platform form is still refused rather than silently
-- becoming general credit, so a mistyped migration credit cannot lose its
-- duplicate check (mem_credit_external_unique).
--
-- Double submission is still stopped by request_id, exactly as before.

create or replace function public.mem_issue_credit(
  p_account_id uuid, p_request_id uuid, p_staff_id uuid, p_booking_id uuid,
  p_amount integer, p_platform text, p_reference text, p_session text,
  p_session_date date, p_reason text, p_expires_at timestamp with time zone
)
returns mem_credits
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b mem_bookings; c mem_credits; v_legacy boolean;
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
 v_legacy := nullif(btrim(p_platform),'') is not null or nullif(btrim(p_reference),'') is not null
   or nullif(btrim(p_session),'') is not null or p_session_date is not null;
 if p_booking_id is not null then
   select * into b from mem_bookings where id=p_booking_id and account_id=p_account_id for update;
   if not found or b.status<>'confirmed' or coalesce(b.price_paid_pence,0)<=0
     or exists(select 1 from mem_booking_refunds where booking_id=p_booking_id)
     then raise exception 'mem_booking_not_creditable'; end if;
   p_amount:=b.price_paid_pence;
 elsif v_legacy then
   if nullif(btrim(p_platform),'') is null or nullif(btrim(p_reference),'') is null
     or nullif(btrim(p_session),'') is null or p_session_date is null
     then raise exception 'mem_legacy_details_required'; end if;
 end if;
 if p_amount is null or p_amount<=0 then raise exception 'mem_credit_invalid'; end if;
 insert into mem_credits(account_id,amount_pence,source_booking_id,expires_at,external_platform,
 external_reference,external_session,external_session_date,reason,issued_by,request_id)
 values(p_account_id,p_amount,p_booking_id,p_expires_at,
 case when p_booking_id is null and v_legacy then btrim(p_platform) end,
 case when p_booking_id is null and v_legacy then btrim(p_reference) end,
 case when p_booking_id is null and v_legacy then btrim(p_session) end,
 case when p_booking_id is null and v_legacy then p_session_date end,btrim(p_reason),p_staff_id,p_request_id) returning * into c;
 if p_booking_id is not null then
   update mem_bookings set status='credited',cancelled_at=now() where id=p_booking_id;
 end if;
 return c;
end $function$;

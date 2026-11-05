-- The claim checks auth.users, which the API service role need not be able to read.
-- Run as the trusted function owner with access to auth.users. Keep this RPC
-- service-only: the API derives p_account_id from the authenticated session.
-- No booking data is changed by this migration.
alter function public.mem_claim_paid_party(text, uuid) security definer;
alter function public.mem_claim_paid_party(text, uuid)
  set search_path to pg_catalog, public, pg_temp;
revoke all on function public.mem_claim_paid_party(text, uuid) from public, anon, authenticated;
grant execute on function public.mem_claim_paid_party(text, uuid) to service_role;

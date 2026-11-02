-- 2026-11-02: account erasure also deletes the account's admin Inbox messages
-- (mem_contact_messages, ops/sql/members-contact-inbox.sql). The function body is the live one
-- (pg_get_functiondef, 2026-11-02) with only that delete added.
begin;

CREATE OR REPLACE FUNCTION public.mem_erase_account(p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.mem_participants%rowtype;
  archived int := 0;
  deleted int := 0;
  anonymised int := 0;
begin
  for p in select * from public.mem_participants where account_id = p_account_id loop
    -- Try the existing household-removal path first: the BEFORE DELETE trigger archives the
    -- participant's waivers (21 / 3-year retention). It fails when the participant has
    -- bookings or private-booking places (NO ACTION: 23503) or a membership (RESTRICT: 23001);
    -- the savepoint rolls the archive back too.
    begin
      delete from public.mem_participants where id = p.id;
      deleted := deleted + 1;
      continue;
    exception when foreign_key_violation or restrict_violation then
      null;
    end;
    -- Kept for its booking history: archive the waivers exactly as the trigger would, unlink
    -- them, then strip the personal fields. dob is NOT NULL and read in ~50 places, so it is
    -- coarsened to 1 January of the birth year rather than removed.
    perform public.mem_archive_participant_waivers_for(p);
    delete from public.mem_waiver_consents where participant_id = p.id;
    update public.mem_participants set
      name = 'Deleted skater',
      dob = date_trunc('year', dob)::date,
      emergency_contact_name = null,
      emergency_contact_phone = null,
      emergency_contact_relationship = null,
      medical_notes = null,
      default_travel_method = null,
      person_id = null,
      updated_at = now()
    where id = p.id;
    archived := archived + 1;
    anonymised := anonymised + 1;
  end loop;

  -- Messaging (2026-10-26): device push credentials and the messages sent to this account go with it.
  delete from public.mem_push_subscriptions where account_id = p_account_id;
  delete from public.mem_message_recipients where account_id = p_account_id;
  -- Contact-form messages (admin Inbox): name, email and free text, nothing we must keep.
  delete from public.mem_contact_messages where account_id = p_account_id;

  update public.mem_accounts set
    name = 'Deleted member',
    phone = null,
    whatsapp_opt_in = false,
    stripe_customer_id = null,
    deletion_hold = false,
    deletion_hold_note = null,
    updated_at = now()
  where id = p_account_id;

  return jsonb_build_object('participants_deleted', deleted, 'participants_anonymised', anonymised);
end;
$function$;

commit;

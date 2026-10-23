-- Members: account deletion (spec: Empowr Members/planning/spec/account-deletion.md, owner 2026-10-22).
--
-- A member's "delete my account" is a REQUEST: confirmed by an emailed link, the account is locked
-- straight away, then erased automatically 14 days later unless the member cancels, staff reverse
-- it, or an automatic hold applies. Erasure ANONYMISES rather than deletes, because booking,
-- payment and credit rows must be kept 7 years (Privacy Policy v1.8 s.5) and those tables point at
-- mem_accounts / mem_participants with NO ACTION / RESTRICT foreign keys.

-- 1. The login can go while the account row stays.
-- mem_accounts.user_id was NOT NULL ... ON DELETE CASCADE: deleting the auth user deleted the
-- account row, which the NO ACTION/RESTRICT FKs above refuse for any member with history. Altered
-- in place (never a second FK between the same tables: PostgREST embeds go ambiguous, PGRST201).
alter table public.mem_accounts alter column user_id drop not null;
alter table public.mem_accounts drop constraint mem_accounts_user_id_fkey,
  add constraint mem_accounts_user_id_fkey foreign key (user_id)
  references auth.users(id) on delete set null;

-- 2. Staff hold: a concern staff know about that the system cannot see (safeguarding, incident).
-- Has the same effect as the automatic hold checks. Note is staff-only and cleared at erasure.
alter table public.mem_accounts
  add column deletion_hold boolean not null default false,
  add column deletion_hold_note text;

-- 3. One row per deletion request. No personal data: the account id is the only link, and after
-- erasure that account row is itself anonymous.
create table public.mem_account_deletions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mem_accounts(id) on delete restrict,
  status text not null check (status in ('pending_confirmation','scheduled','held','cancelled','reversed','erased')),
  -- sha256 of the emailed confirm / cancel tokens; the tokens themselves are never stored.
  confirm_token_hash text,
  cancel_token_hash text,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  erase_after timestamptz,
  hold_reasons text[] not null default '{}',
  reminder_7_sent_at timestamptz,
  reminder_13_sent_at timestamptz,
  ended_at timestamptz,
  ended_by text,                      -- 'member' | staff email | 'system'
  outcome jsonb,                      -- scenarios applied, bookings cancelled, what was kept and until when
  crm_session_id uuid,                -- the PecuvateCRM escalation tracking this request
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one open request per account.
create unique index mem_account_deletions_open_idx on public.mem_account_deletions (account_id)
  where status in ('pending_confirmation','scheduled','held');
create index mem_account_deletions_due_idx on public.mem_account_deletions (erase_after) where status = 'scheduled';

-- 4. Reasons for leaving, deliberately NOT linked to the account so they survive erasure.
create table public.mem_account_deletion_reasons (
  id uuid primary key default gen_random_uuid(),
  reason text not null check (reason in ('child_stopped','moving_away','too_expensive','unhappy_sessions','rather_not_say','other')),
  detail text,
  created_at timestamptz not null default now()
);

-- Server-only, like the waiver archive: RLS on, no policies, no grants to API roles.
alter table public.mem_account_deletions enable row level security;
alter table public.mem_account_deletion_reasons enable row level security;
revoke all on public.mem_account_deletions from anon, authenticated;
revoke all on public.mem_account_deletion_reasons from anon, authenticated;
grant select, insert, update on public.mem_account_deletions to service_role;
grant select, insert on public.mem_account_deletion_reasons to service_role;

-- 5. Erase one account's personal data in a single transaction. Called by the scheduled job after
-- the app has dealt with Stripe and Brevo; the app then deletes the auth user (user_id -> null).
-- Idempotent: re-running on an erased account changes nothing.
create or replace function public.mem_erase_account(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;
revoke execute on function public.mem_erase_account(uuid) from public, anon, authenticated;
grant execute on function public.mem_erase_account(uuid) to service_role;

-- 6. The waiver-archive trigger body becomes a function erasure can also call, for a participant
-- that cannot be deleted. Body is the LIVE mem_archive_participant_waivers() (pg_get_functiondef,
-- 2026-10-23) with OLD replaced by the parameter; the trigger now delegates to it unchanged.
create or replace function public.mem_archive_participant_waivers_for(p public.mem_participants)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- WAIVER_ARCHIVE_RETENTION: adults 3 years from removal; children until 21
  -- if later. Change both here and in the delete-old-waivers job.
  retention constant interval := interval '3 years';
  child_until constant interval := interval '21 years';
  r record;
  remaining text[];
  others int;
begin
  for r in
    select distinct wr.*, pe.first_name, pe.last_name, pe.email
      from public.mem_waiver_consents c
      join public.waiver_responses wr on wr.id = c.waiver_response_id
      left join public.people pe on pe.id = wr.person_id
     where c.participant_id = p.id
  loop
    insert into public.mem_waiver_archive (
      source_response_id, source_participant_id, source_account_id,
      form_version_id, skater_name, signer_name, signer_email,
      has_minors, skating_mode, agreed_tc, agreed_waiver, agreed_photo,
      signed_at, purge_after
    ) values (
      r.id, p.id, p.account_id,
      r.form_version_id, p.name, nullif(trim(concat_ws(' ', r.first_name, r.last_name)), ''), r.email,
      r.has_minors, r.skating_mode, r.agreed_tc, r.agreed_waiver, r.agreed_photo,
      r.submitted_at,
      greatest(now() + retention, coalesce((p.dob + child_until)::timestamptz, now() + retention))
    );

    select coalesce(array_agg(n), '{}') into remaining
      from unnest(coalesce(r.skater_names, '{}')) n
     where lower(regexp_replace(trim(n), '\s+', ' ', 'g'))
        <> lower(regexp_replace(trim(p.name), '\s+', ' ', 'g'));

    select count(*) into others
      from public.mem_waiver_consents c
     where c.waiver_response_id = r.id and c.participant_id <> p.id;

    if cardinality(remaining) = 0 and others = 0 then
      delete from public.waiver_responses where id = r.id;
    else
      update public.waiver_responses set skater_names = remaining where id = r.id;
    end if;
  end loop;
end;
$$;
revoke execute on function public.mem_archive_participant_waivers_for(public.mem_participants) from public, anon, authenticated;

create or replace function public.mem_archive_participant_waivers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.mem_archive_participant_waivers_for(old);
  return old;
end;
$$;

-- 7. Children's collection (departure) consents follow the everyday child-record rule (owner
-- 2026-10-22: until 21, or 3 years after the session). departure_consents holds only the child's
-- NAME, never a date of birth, and records are never matched to a skater on a name alone, so the
-- child's age is unknown. Same answer as this job's existing "minor whose age is unknown" rule:
-- keep 18 years from the session, which is past 21 for any child old enough to skate.
-- Everything else in the job is the LIVE command (cron.job, 2026-10-23), unchanged.
select cron.unschedule('delete-old-waivers');
select cron.schedule('delete-old-waivers', '0 2 * * *', $job$
  DELETE FROM public.waiver_responses w
   WHERE (w.session_date < CURRENT_DATE - INTERVAL '3 years'
          OR w.submitted_at < NOW() - INTERVAL '3 years')
     -- a session it covered was within the last 3 years
     AND COALESCE(public.mem_waiver_last_covered_session(w.id), '-infinity'::date)
         < CURRENT_DATE - INTERVAL '3 years'
     -- a linked participant is still under 21
     AND NOT EXISTS (
       SELECT 1 FROM public.mem_waiver_consents c
         JOIN public.mem_participants mp ON mp.id = c.participant_id
        WHERE c.waiver_response_id = w.id
          AND mp.dob + INTERVAL '21 years' > CURRENT_DATE)
     -- covers a minor whose age is unknown: 18 years from signing
     AND NOT (w.has_minors
              AND NOT EXISTS (SELECT 1 FROM public.mem_waiver_consents c WHERE c.waiver_response_id = w.id)
              AND w.submitted_at > NOW() - INTERVAL '18 years');

  -- collection consents are always about a child whose age is not recorded: 18 years
  DELETE FROM public.departure_consents
   WHERE COALESCE(session_date, submitted_at::date) < CURRENT_DATE - INTERVAL '18 years';

  DELETE FROM public.people p
   WHERE NOT EXISTS (SELECT 1 FROM public.waiver_responses  w WHERE w.person_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.departure_consents d WHERE d.person_id = p.id);
$job$);

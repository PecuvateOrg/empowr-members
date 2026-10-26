-- Members: member messaging and installable app (spec: Empowr Members/planning/spec/member-messaging.md,
-- owner 2026-10-26).
--
-- Staff (admin, or a coach on CHECKIN_EMAILS) message the families booked on a session. Each message goes
-- out by email, to an in-app inbox, and as a Web Push alert if the member allowed it on a device.
--
-- Everything here is Members-owned (mem_ prefix). Writes go through service-role API routes behind the
-- role gates; members read only their own messages and may set only their own read_at.
--
-- FKs to mem_accounts are NO ACTION on purpose (never CASCADE: erasure keeps the account row, and
-- mem_erase_account() below deletes these rows explicitly). sender_user_id carries NO FK to auth.users, the
-- project's audit-column rule (2026-09-17 outage).

-- 1. The message as sent. sender_name is stored at send time so the sent log stays right if a coach's name
-- later changes; audience_label snapshots the session/offering title so the log and the email footer do too.
-- request_id makes a double click / retried request send once: the client mints it at preview time and the
-- unique index turns the second insert into a conflict the route answers with the existing message.
create table public.mem_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique,
  sender_user_id uuid not null,
  sender_role text not null check (sender_role in ('admin', 'coach')),
  sender_name text not null check (length(btrim(sender_name)) > 0),
  audience_type text not null check (audience_type in ('occurrence', 'offering', 'account')),
  audience_id uuid not null,
  audience_label text not null default '',
  subject text not null check (length(btrim(subject)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 2000),
  urgent boolean not null default false,
  created_at timestamptz not null default now()
);
create index mem_messages_created_idx on public.mem_messages (created_at desc);

-- 2. One row per account per message (a parent with two children gets ONE message naming both).
create table public.mem_message_recipients (
  message_id uuid not null references public.mem_messages(id) on delete cascade,
  account_id uuid not null references public.mem_accounts(id),
  participant_names text[] not null default '{}',
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed')),
  email_id text,
  email_error text,
  push_sent_count integer not null default 0,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (message_id, account_id)
);
create index mem_message_recipients_account_idx on public.mem_message_recipients (account_id, created_at desc);
create index mem_message_recipients_unread_idx on public.mem_message_recipients (account_id) where read_at is null;

-- 3. Web Push subscriptions: one per browser/device. A push answered 404/410 deletes its row.
create table public.mem_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mem_accounts(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index mem_push_subscriptions_account_idx on public.mem_push_subscriptions (account_id);

-- 4. RLS and grants. New tables get NO default DML grants on this project, so everything is explicit.
alter table public.mem_messages enable row level security;
alter table public.mem_message_recipients enable row level security;
alter table public.mem_push_subscriptions enable row level security;

revoke all on public.mem_messages from anon, authenticated;
revoke all on public.mem_message_recipients from anon, authenticated;
revoke all on public.mem_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.mem_messages to service_role;
grant select, insert, update, delete on public.mem_message_recipients to service_role;
grant select, insert, update, delete on public.mem_push_subscriptions to service_role;

-- Members read only the messages they are a recipient of, and only the columns they should see (not
-- sender_user_id, audience_id or request_id). Callers must name columns: select * is refused (42501).
grant select (id, sender_role, sender_name, audience_type, audience_label, subject, body, urgent, created_at)
  on public.mem_messages to authenticated;
create policy members_read_own_messages on public.mem_messages
  for select to authenticated
  using (exists (
    select 1 from public.mem_message_recipients r
    where r.message_id = mem_messages.id and r.account_id = public.member_account_id()
  ));

-- Recipient rows: read own (not the email delivery columns), and update ONLY read_at on own rows.
grant select (message_id, account_id, participant_names, read_at, created_at)
  on public.mem_message_recipients to authenticated;
grant update (read_at) on public.mem_message_recipients to authenticated;
create policy members_read_own_recipient_rows on public.mem_message_recipients
  for select to authenticated
  using (account_id = public.member_account_id());
create policy members_mark_own_messages_read on public.mem_message_recipients
  for update to authenticated
  using (account_id = public.member_account_id())
  with check (account_id = public.member_account_id());

-- Push subscriptions: no API-role access at all (endpoint + keys are credentials). The member-facing
-- subscribe/unsubscribe routes authenticate the member and write with the service client.

-- 5. Who a message goes to. Lives in SQL so the rule is one place and is tested against the real schema.
-- Confirmed OR attended: check-in flips a booking to 'attended', and a same-day "collect at 2pm" must still
-- reach the families whose children are already on site. Cancelled / credited / refunded / no_show /
-- pending_payment are excluded. A booking covers an occurrence directly (occurrence_id) or through its
-- course run (course_run_id = the occurrence's run). One row per ACCOUNT; names are the booked participants.
-- 'offering' = upcoming scheduled occurrences only. 'account' = that one account, no children listed.
create or replace function public.mem_message_audience(p_type text, p_id uuid)
returns table (account_id uuid, account_name text, participant_names text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'account' then
    return query
      select a.id, a.name, '{}'::text[] from public.mem_accounts a where a.id = p_id;
    return;
  end if;
  if p_type not in ('occurrence', 'offering') then
    raise exception 'unknown audience type %', p_type;
  end if;

  return query
    with occ as (
      select o.id, o.course_run_id
        from public.mem_occurrences o
       where (p_type = 'occurrence' and o.id = p_id)
          or (p_type = 'offering' and o.offering_id = p_id and o.status = 'scheduled' and o.starts_at >= now())
    ),
    hits as (
      select b.account_id as acc, p.name as pname
        from public.mem_bookings b
        join public.mem_participants p on p.id = b.participant_id
       where b.status in ('confirmed', 'attended')
         and (
           b.occurrence_id in (select id from occ)
           or b.course_run_id in (select course_run_id from occ where course_run_id is not null)
         )
    )
    select a.id, a.name, array_agg(distinct h.pname order by h.pname)
      from hits h
      join public.mem_accounts a on a.id = h.acc
     group by a.id, a.name
     order by a.name;
end;
$$;
revoke execute on function public.mem_message_audience(text, uuid) from public, anon, authenticated;
grant execute on function public.mem_message_audience(text, uuid) to service_role;

-- 6. Account deletion: erasure now also removes the account's push subscriptions (endpoint + keys are
-- credentials) and its message recipient rows. Body is the LIVE function (pg_get_functiondef, 2026-10-26),
-- with only these two deletes added before the account is anonymised.
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

  -- Messaging (2026-10-26): device push credentials and the messages sent to this account go with it.
  delete from public.mem_push_subscriptions where account_id = p_account_id;
  delete from public.mem_message_recipients where account_id = p_account_id;

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

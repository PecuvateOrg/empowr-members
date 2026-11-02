-- 2026-11-02: admin Inbox for the Members contact form, and phone alerts for staff.
--
-- mem_contact_messages: every message sent through members.empowrcic.org/contact (a copy still goes
-- to the CRM). account_id is the SIGNED-IN account at the time of sending, never a match on the
-- typed email. Replies go out through the normal message system (mem_messages), linked here.
--
-- mem_staff_push_subscriptions: admin devices that asked for alerts. Keyed by auth user, not
-- mem_accounts, because admins come from the ADMIN_EMAILS list and need not have a member account.
-- The sender re-checks ADMIN_EMAILS before every alert, so removing someone from the list stops them.
--
-- Both tables hold personal data and are service-role only: RLS on with no policies, and every API
-- role grant revoked explicitly (Supabase's default grants would otherwise expose them).
begin;

create table public.mem_contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid references public.mem_accounts(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  topic text not null check (char_length(topic) between 1 and 100),
  body text not null check (char_length(body) between 1 and 10000),
  status text not null default 'open' check (status in ('open', 'replied', 'closed')),
  read_at timestamptz,
  replied_at timestamptz,
  replied_by uuid,
  reply_message_id uuid references public.mem_messages(id) on delete set null
);
create index mem_contact_messages_created on public.mem_contact_messages (created_at desc);
create index mem_contact_messages_open on public.mem_contact_messages (status) where status = 'open';
create index mem_contact_messages_account on public.mem_contact_messages (account_id);

create table public.mem_staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index mem_staff_push_subscriptions_user on public.mem_staff_push_subscriptions (user_id);

alter table public.mem_contact_messages enable row level security;
alter table public.mem_staff_push_subscriptions enable row level security;
revoke all on public.mem_contact_messages from anon, authenticated;
revoke all on public.mem_staff_push_subscriptions from anon, authenticated;
grant all on public.mem_contact_messages to service_role;
grant all on public.mem_staff_push_subscriptions to service_role;

commit;

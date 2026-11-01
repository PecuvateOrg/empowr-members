-- Agent access step 2 (planning/spec/agent-access.md): every preview and send made through /api/mcp.
-- A preview row is also the token a send must quote: the send is refused unless it names a preview by
-- the same person, under 10 minutes old, for the same audience and text, with the count they saw.
-- Service role only; the app reads it for /admin/agent-activity.
create table if not exists public.mem_agent_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Null once the staff login is deleted; user_email keeps the record readable.
  user_id uuid references auth.users (id) on delete set null,
  user_email text not null,
  role text not null check (role in ('admin', 'coach')),
  client_id text,
  tool text not null,
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  ok boolean not null
);

create index if not exists mem_agent_actions_user_tool_time on public.mem_agent_actions (user_id, tool, created_at desc);
create index if not exists mem_agent_actions_time on public.mem_agent_actions (created_at desc);

alter table public.mem_agent_actions enable row level security;
revoke all on public.mem_agent_actions from anon, authenticated;
grant select, insert on public.mem_agent_actions to service_role;

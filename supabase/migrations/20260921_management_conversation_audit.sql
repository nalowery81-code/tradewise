create table if not exists public."ManagementConversations" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public."Companies"(id) on delete cascade,
  profile_id uuid not null references public."UserProfiles"(id) on delete cascade,
  user_role text not null check (user_role in ('manager','owner')),
  context_type text not null default 'chat' check (context_type in ('chat','profile_summary')),
  title text,
  model_name text
);

create table if not exists public."ManagementMessages" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public."ManagementConversations"(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  model_name text,
  sources jsonb not null default '[]'::jsonb
);

alter table public."ManagementConversations" enable row level security;
alter table public."ManagementMessages" enable row level security;

grant select, insert, update, delete on public."ManagementConversations" to service_role;
grant select, insert, update, delete on public."ManagementMessages" to service_role;

create index if not exists management_conversations_company_created_idx
  on public."ManagementConversations"(company_id, created_at desc);
create index if not exists management_conversations_profile_created_idx
  on public."ManagementConversations"(profile_id, created_at desc);
create index if not exists management_messages_conversation_created_idx
  on public."ManagementMessages"(conversation_id, created_at asc);

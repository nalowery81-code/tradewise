create table if not exists public."AIUsageEvents" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feature text not null,
  endpoint text not null,
  model text not null,
  conversation_type text,
  conversation_id uuid,
  input_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  web_search_calls integer not null default 0,
  file_search_calls integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ai_usage_events_created_idx
  on public."AIUsageEvents"(created_at desc);

create index if not exists ai_usage_events_feature_idx
  on public."AIUsageEvents"(feature, created_at desc);

alter table public."AIUsageEvents" enable row level security;
revoke all on public."AIUsageEvents" from anon, authenticated;
grant select, insert, update, delete on public."AIUsageEvents" to service_role;

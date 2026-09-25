create table if not exists public."PlatformAdminOpenAICostSnapshots" (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public."PlatformAdminOpenAICostSnapshots" enable row level security;

comment on table public."PlatformAdminOpenAICostSnapshots" is
  'Server-side snapshot cache for Platform Admin OpenAI cost/usage telemetry. Accessed through service-role server routes only.';

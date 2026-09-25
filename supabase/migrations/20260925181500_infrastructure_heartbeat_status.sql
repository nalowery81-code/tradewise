create table if not exists public."InfrastructureHeartbeatSources" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_key text not null unique,
  display_name text not null,
  token_hash text,
  is_active boolean not null default true,
  expected_interval_seconds integer not null default 300 check (expected_interval_seconds >= 60),
  stale_after_seconds integer not null default 900 check (stale_after_seconds >= 120),
  last_heartbeat_at timestamptz,
  last_payload jsonb
);

insert into public."InfrastructureHeartbeatSources"
(source_key, display_name, expected_interval_seconds, stale_after_seconds)
values ('home-server','CraftCompass Home Server',300,900)
on conflict (source_key) do nothing;

alter table public."InfrastructureHeartbeatSources" enable row level security;

create or replace function public.touch_infrastructure_heartbeat_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists infrastructure_heartbeat_sources_touch_updated_at
  on public."InfrastructureHeartbeatSources";
create trigger infrastructure_heartbeat_sources_touch_updated_at
before update on public."InfrastructureHeartbeatSources"
for each row execute function public.touch_infrastructure_heartbeat_updated_at();

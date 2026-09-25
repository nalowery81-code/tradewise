alter table public."ReportDefinitions"
  add column if not exists schema_version integer not null default 1,
  add column if not exists is_archived boolean not null default false;

alter table public."ReportDefinitions"
  drop constraint if exists report_definitions_schema_version_check;

alter table public."ReportDefinitions"
  add constraint report_definitions_schema_version_check
  check (schema_version >= 1);

create table if not exists public."ReportRuns" (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid null references public."ReportDefinitions"(id) on delete set null,
  report_type text not null,
  schema_version integer not null default 1,
  scope_company_id uuid null references public."Companies"(id) on delete set null,
  filters jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  status text not null default 'running',
  row_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  generated_by_profile_id uuid null references public."UserProfiles"(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  error_text text null,
  constraint report_runs_status_check check (status in ('running','completed','failed')),
  constraint report_runs_schema_version_check check (schema_version >= 1),
  constraint report_runs_filters_object check (jsonb_typeof(filters) = 'object'),
  constraint report_runs_sections_array check (jsonb_typeof(sections) = 'array'),
  constraint report_runs_summary_object check (jsonb_typeof(summary) = 'object')
);

create index if not exists report_runs_started_idx
  on public."ReportRuns"(started_at desc);

create index if not exists report_runs_definition_idx
  on public."ReportRuns"(definition_id, started_at desc);

create index if not exists report_runs_scope_company_idx
  on public."ReportRuns"(scope_company_id, started_at desc);

alter table public."ReportRuns" enable row level security;

comment on table public."ReportRuns" is
  'Audit/history metadata for CraftCompass report executions. Full report row payloads are intentionally not persisted.';

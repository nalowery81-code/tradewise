create table if not exists public."ReportDefinitions" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  report_type text not null,
  scope_company_id uuid null references public."Companies"(id) on delete cascade,
  filters jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  created_by_profile_id uuid null references public."UserProfiles"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_definitions_name_length check (length(btrim(name)) between 2 and 120),
  constraint report_definitions_type_check check (report_type in ('billing_usage','company_performance','ai_usage_cost','learning_quality','user_activity')),
  constraint report_definitions_filters_object check (jsonb_typeof(filters) = 'object'),
  constraint report_definitions_sections_array check (jsonb_typeof(sections) = 'array')
);

create index if not exists report_definitions_scope_company_idx
  on public."ReportDefinitions"(scope_company_id, updated_at desc);

alter table public."ReportDefinitions" enable row level security;

comment on table public."ReportDefinitions" is
  'Reusable CraftCompass report definitions. Null scope_company_id means platform-wide; company-scoped definitions are reusable later by tenant-restricted owner reporting.';

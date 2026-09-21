alter table public."WeeklyLearningRuns"
  add column if not exists source_checked_count integer not null default 0,
  add column if not exists source_issue_count integer not null default 0;

create table if not exists public."WeeklySourceChecks" (
  id uuid primary key default gen_random_uuid(),
  weekly_run_id uuid not null references public."WeeklyLearningRuns"(id) on delete cascade,
  message_id uuid,
  source_title text,
  source_url text not null,
  status text not null check (status in ('reachable','redirected','dead','blocked','unreachable','invalid')),
  http_status integer,
  final_url text,
  error_text text,
  checked_at timestamptz not null default now()
);

create index if not exists weekly_source_checks_run_idx
  on public."WeeklySourceChecks"(weekly_run_id, status, checked_at desc);

create index if not exists weekly_source_checks_url_idx
  on public."WeeklySourceChecks"(source_url, checked_at desc);

alter table public."WeeklySourceChecks" enable row level security;
revoke all on public."WeeklySourceChecks" from anon, authenticated;
grant select, insert, update, delete on public."WeeklySourceChecks" to service_role;

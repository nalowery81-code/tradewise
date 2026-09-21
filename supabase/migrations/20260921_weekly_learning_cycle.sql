create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create table if not exists public."WeeklyLearningRuns" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  trigger_type text not null check (trigger_type in ('scheduled','manual')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  review_count integer not null default 0,
  guidance_count integer not null default 0,
  synopsis text,
  model_name text,
  error_text text
);

create index if not exists weekly_learning_runs_created_idx
  on public."WeeklyLearningRuns"(created_at desc);

create table if not exists public."WeeklyLearningRunReviews" (
  run_id uuid not null references public."WeeklyLearningRuns"(id) on delete cascade,
  review_id uuid not null references public."ConversationAuditReviews"(id) on delete cascade,
  primary key (run_id, review_id)
);

create index if not exists weekly_learning_run_reviews_review_idx
  on public."WeeklyLearningRunReviews"(review_id);

alter table public."GuidanceLibrary"
  add column if not exists source_weekly_run_id uuid references public."WeeklyLearningRuns"(id) on delete set null;

alter table public."GuidanceLibrary"
  alter column created_by_admin_profile_id drop not null;

create index if not exists guidance_library_weekly_run_idx
  on public."GuidanceLibrary"(source_weekly_run_id)
  where source_weekly_run_id is not null;

alter table public."WeeklyLearningRuns" enable row level security;
alter table public."WeeklyLearningRunReviews" enable row level security;
revoke all on public."WeeklyLearningRuns" from anon, authenticated;
revoke all on public."WeeklyLearningRunReviews" from anon, authenticated;
grant select, insert, update, delete on public."WeeklyLearningRuns" to service_role;
grant select, insert, update, delete on public."WeeklyLearningRunReviews" to service_role;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'weekly_learning_cron_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'weekly_learning_cron_secret',
      'Secret used by Supabase Cron to invoke the CraftCompass weekly learning endpoint'
    );
  end if;
end
$$;

create or replace function public.verify_weekly_learning_secret(provided_secret text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_catalog
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'weekly_learning_cron_secret'
      and decrypted_secret = provided_secret
  );
$$;

revoke all on function public.verify_weekly_learning_secret(text) from public, anon, authenticated;
grant execute on function public.verify_weekly_learning_secret(text) to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'craftcompass-weekly-learning-sunday'
  limit 1;
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'craftcompass-weekly-learning-sunday',
  '0 10 * * 0',
  $cron$
    select net.http_post(
      url := 'https://app.craftcompassai.com/api/cron/weekly-learning',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'weekly_learning_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object('source', 'supabase-cron', 'scheduled_at', now()),
      timeout_milliseconds := 120000
    ) as request_id;
  $cron$
);

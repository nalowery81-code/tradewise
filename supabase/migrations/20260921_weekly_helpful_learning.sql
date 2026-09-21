alter table public."WeeklyLearningRuns"
  add column if not exists helpful_count integer not null default 0;

create table if not exists public."WeeklyLearningRunFeedback" (
  run_id uuid not null references public."WeeklyLearningRuns"(id) on delete cascade,
  feedback_id uuid not null references public."ConversationUserFeedback"(id) on delete cascade,
  primary key (run_id, feedback_id)
);

create index if not exists weekly_learning_run_feedback_feedback_idx
  on public."WeeklyLearningRunFeedback"(feedback_id);

alter table public."WeeklyLearningRunFeedback" enable row level security;
revoke all on public."WeeklyLearningRunFeedback" from anon, authenticated;
grant select, insert, update, delete on public."WeeklyLearningRunFeedback" to service_role;

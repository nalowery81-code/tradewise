create table if not exists public."ConversationUserFeedback" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  conversation_type text not null check (conversation_type in ('technician','management')),
  conversation_id uuid not null,
  message_id uuid not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('helpful')),
  unique (conversation_type, message_id, auth_user_id)
);

create index if not exists conversation_user_feedback_conversation_idx
  on public."ConversationUserFeedback"(conversation_type, conversation_id, created_at desc);

alter table public."ConversationUserFeedback" enable row level security;
revoke all on public."ConversationUserFeedback" from anon, authenticated;
grant select, insert, update, delete on public."ConversationUserFeedback" to service_role;

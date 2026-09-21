create table if not exists public."ConversationAuditReviews" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  conversation_type text not null check (conversation_type in ('technician','management')),
  conversation_id uuid not null,
  message_id uuid not null,
  status text not null default 'needs_review' check (status in ('good','needs_review','incorrect','corrected','resolved')),
  category text,
  correction_note text,
  corrected_answer text,
  admin_profile_id uuid not null references public."UserProfiles"(id) on delete cascade
);

create unique index if not exists conversation_audit_reviews_message_uidx
  on public."ConversationAuditReviews"(conversation_type, message_id);

create index if not exists conversation_audit_reviews_conversation_idx
  on public."ConversationAuditReviews"(conversation_type, conversation_id, updated_at desc);

create table if not exists public."ConversationFeedbackRequests" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  conversation_type text not null check (conversation_type in ('technician','management')),
  conversation_id uuid not null,
  message_id uuid,
  target_auth_user_id uuid not null references auth.users(id) on delete cascade,
  requested_by_admin_profile_id uuid not null references public."UserProfiles"(id) on delete cascade,
  question text not null,
  status text not null default 'pending' check (status in ('pending','responded','dismissed')),
  rating text check (rating is null or rating in ('helpful','mixed','not_helpful')),
  response_text text
);

create index if not exists conversation_feedback_target_status_idx
  on public."ConversationFeedbackRequests"(target_auth_user_id, status, created_at desc);

create index if not exists conversation_feedback_conversation_idx
  on public."ConversationFeedbackRequests"(conversation_type, conversation_id, created_at desc);

alter table public."ConversationAuditReviews" enable row level security;
alter table public."ConversationFeedbackRequests" enable row level security;

revoke all on public."ConversationAuditReviews" from anon, authenticated;
revoke all on public."ConversationFeedbackRequests" from anon, authenticated;

grant select, insert, update, delete on public."ConversationAuditReviews" to service_role;
grant select, insert, update, delete on public."ConversationFeedbackRequests" to service_role;

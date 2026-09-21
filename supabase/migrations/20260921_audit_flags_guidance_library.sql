create table if not exists public."ConversationAuditFlags" (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  conversation_type text not null check (conversation_type in ('technician','management')), conversation_id uuid not null, message_id uuid not null,
  reporter_auth_user_id uuid not null references auth.users(id) on delete cascade, reporter_role text not null check (reporter_role in ('technician','manager','owner')),
  comment text not null, status text not null default 'pending' check (status in ('pending','confirmed','dismissed','resolved')),
  reviewed_by_admin_profile_id uuid references public."UserProfiles"(id) on delete set null, reviewed_at timestamptz
);
create index if not exists conversation_audit_flags_conversation_idx on public."ConversationAuditFlags"(conversation_type, conversation_id, status, created_at desc);
create index if not exists conversation_audit_flags_message_idx on public."ConversationAuditFlags"(conversation_type, message_id, status);
create unique index if not exists conversation_audit_flags_pending_reporter_uidx on public."ConversationAuditFlags"(conversation_type, message_id, reporter_auth_user_id) where status='pending';

create table if not exists public."GuidanceLibrary" (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  title text not null, guidance_text text not null, scope text not null default 'all' check (scope in ('all','technician','management')),
  topic text, priority integer not null default 50 check (priority between 1 and 100),
  status text not null default 'draft' check (status in ('draft','active','inactive','superseded')),
  source_review_id uuid references public."ConversationAuditReviews"(id) on delete set null,
  source_flag_id uuid references public."ConversationAuditFlags"(id) on delete set null,
  created_by_admin_profile_id uuid not null references public."UserProfiles"(id) on delete cascade, activated_at timestamptz
);
create index if not exists guidance_library_status_scope_idx on public."GuidanceLibrary"(status, scope, priority desc, updated_at desc);
alter table public."ConversationAuditFlags" enable row level security;
alter table public."GuidanceLibrary" enable row level security;
revoke all on public."ConversationAuditFlags" from anon, authenticated;
revoke all on public."GuidanceLibrary" from anon, authenticated;
grant select, insert, update, delete on public."ConversationAuditFlags" to service_role;
grant select, insert, update, delete on public."GuidanceLibrary" to service_role;

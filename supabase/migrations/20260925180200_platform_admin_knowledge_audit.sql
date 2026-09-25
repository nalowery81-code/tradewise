create table if not exists public."PlatformAdminKnowledgeAudit" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_profile_id uuid references public."UserProfiles"(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  note text
);

create index if not exists platform_admin_knowledge_audit_created_idx
  on public."PlatformAdminKnowledgeAudit"(created_at desc);
create index if not exists platform_admin_knowledge_audit_entity_idx
  on public."PlatformAdminKnowledgeAudit"(entity_type, entity_id, created_at desc);

alter table public."PlatformAdminKnowledgeAudit" enable row level security;

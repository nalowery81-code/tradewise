create table if not exists public."PlatformAdminCompanyAudit" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_profile_id uuid null references public."UserProfiles"(id) on delete set null,
  company_id uuid not null references public."Companies"(id) on delete cascade,
  action text not null,
  before_state jsonb null,
  after_state jsonb null,
  note text null
);

create index if not exists platform_admin_company_audit_created_at_idx
  on public."PlatformAdminCompanyAudit" (created_at desc);

create index if not exists platform_admin_company_audit_company_id_idx
  on public."PlatformAdminCompanyAudit" (company_id, created_at desc);

alter table public."PlatformAdminCompanyAudit" enable row level security;

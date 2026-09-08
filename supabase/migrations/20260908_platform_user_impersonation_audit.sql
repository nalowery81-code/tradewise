create table if not exists public."PlatformImpersonationAudit" (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public."UserProfiles"(id) on delete cascade,
  target_profile_id uuid not null references public."UserProfiles"(id) on delete cascade,
  target_company_id uuid not null references public."Companies"(id) on delete cascade,
  action text not null check (action in ('start','stop')),
  created_at timestamptz not null default now()
);

create index if not exists platform_impersonation_audit_admin_idx on public."PlatformImpersonationAudit" (admin_profile_id, created_at desc);
create index if not exists platform_impersonation_audit_target_idx on public."PlatformImpersonationAudit" (target_profile_id, created_at desc);

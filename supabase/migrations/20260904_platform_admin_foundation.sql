alter table public."UserProfiles"
  add column if not exists is_platform_admin boolean not null default false;

alter table public."Companies"
  add column if not exists account_type text not null default 'demo',
  add column if not exists status text not null default 'active';

alter table public."Companies" drop constraint if exists companies_account_type_check;
alter table public."Companies"
  add constraint companies_account_type_check check (account_type in ('internal','demo','customer'));

alter table public."Companies" drop constraint if exists companies_status_check;
alter table public."Companies"
  add constraint companies_status_check check (status in ('active','disabled'));

-- The live Tradewise workspace should be marked internal after applying this migration.
-- Platform-admin access is granted to a specific owner profile separately so the owner role remains unchanged.

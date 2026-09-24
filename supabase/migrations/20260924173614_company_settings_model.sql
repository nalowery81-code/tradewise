alter table public."Companies"
  add column if not exists timezone text not null default 'America/Indiana/Indianapolis',
  add column if not exists trades text[] not null default array['plumbing']::text[],
  add column if not exists jurisdictions jsonb not null default '[{"country":"US","state":"IN"}]'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public."Companies"
  drop constraint if exists companies_timezone_not_blank;
alter table public."Companies"
  add constraint companies_timezone_not_blank check (length(btrim(timezone)) > 0);

alter table public."Companies"
  drop constraint if exists companies_trades_not_empty;
alter table public."Companies"
  add constraint companies_trades_not_empty check (cardinality(trades) > 0);

alter table public."Companies"
  drop constraint if exists companies_jurisdictions_is_array;
alter table public."Companies"
  add constraint companies_jurisdictions_is_array
  check (jsonb_typeof(jurisdictions) = 'array');

alter table public."Companies"
  drop constraint if exists companies_settings_is_object;
alter table public."Companies"
  add constraint companies_settings_is_object
  check (jsonb_typeof(settings) = 'object');

comment on column public."Companies".timezone is
  'IANA timezone used for company scheduling, reporting, and local-time behavior.';
comment on column public."Companies".trades is
  'Enabled skilled trades for the company workspace, stored as normalized lowercase slugs.';
comment on column public."Companies".jurisdictions is
  'Jurisdiction configuration used to select verified code/source context.';
comment on column public."Companies".settings is
  'Company-specific application preferences that do not belong in global CraftCompass configuration.';

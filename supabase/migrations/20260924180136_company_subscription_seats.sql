alter table public."Companies"
  add column if not exists plan_code text not null default 'mvp',
  add column if not exists subscription_status text not null default 'manual',
  add column if not exists seat_limits jsonb not null default '{"owners":1,"managers":2,"technicians":8}'::jsonb;

alter table public."Companies"
  drop constraint if exists companies_plan_code_not_blank;
alter table public."Companies"
  add constraint companies_plan_code_not_blank check (length(btrim(plan_code)) > 0);

alter table public."Companies"
  drop constraint if exists companies_subscription_status_check;
alter table public."Companies"
  add constraint companies_subscription_status_check
  check (subscription_status in ('manual','trialing','active','past_due','canceled','paused'));

alter table public."Companies"
  drop constraint if exists companies_seat_limits_is_object;
alter table public."Companies"
  add constraint companies_seat_limits_is_object
  check (
    jsonb_typeof(seat_limits) = 'object'
    and (seat_limits->>'owners') ~ '^[0-9]+$'
    and (seat_limits->>'managers') ~ '^[0-9]+$'
    and (seat_limits->>'technicians') ~ '^[0-9]+$'
  );

comment on column public."Companies".plan_code is
  'CraftCompass commercial plan identifier. Billing provider products map to this value rather than owning product logic.';
comment on column public."Companies".subscription_status is
  'Internal subscription state. manual is used before automated billing is connected.';
comment on column public."Companies".seat_limits is
  'Maximum active or pending seats allowed by role. Deactivated profiles do not consume seats.';

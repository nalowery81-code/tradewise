alter table public."Messages"
  add column if not exists sources jsonb not null default '[]'::jsonb;

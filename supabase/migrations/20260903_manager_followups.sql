create table if not exists public."ManagerFollowUps" (
  id uuid primary key default gen_random_uuid(),
  technician_id uuid references public."Technicians"(id) on delete set null,
  technician_name text not null,
  note text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists manager_followups_status_created_idx
  on public."ManagerFollowUps" (status, created_at desc);

create index if not exists manager_followups_technician_idx
  on public."ManagerFollowUps" (technician_id, created_at desc);

alter table public."ManagerFollowUps" enable row level security;

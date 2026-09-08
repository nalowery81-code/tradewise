alter table public."Companies"
  add column if not exists feature_flags jsonb not null default '{
    "manager_search": false,
    "manager_history": false,
    "manager_follow_up": true,
    "manager_technicians": true,
    "manager_notes": false,
    "owner_overview": true,
    "owner_company": true,
    "owner_assignments": true,
    "owner_add_manager": true,
    "owner_add_technician": true
  }'::jsonb;

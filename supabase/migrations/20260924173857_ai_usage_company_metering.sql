alter table public."AIUsageEvents"
  add column if not exists company_id uuid references public."Companies"(id) on delete set null;

create index if not exists ai_usage_events_company_created_idx
  on public."AIUsageEvents" (company_id, created_at desc)
  where company_id is not null;

update public."AIUsageEvents" e
set company_id = c.company_id
from public."Conversations" c
where e.company_id is null
  and e.conversation_type = 'technician'
  and e.conversation_id = c.id;

update public."AIUsageEvents" e
set company_id = c.company_id
from public."ManagementConversations" c
where e.company_id is null
  and e.conversation_type = 'management'
  and e.conversation_id = c.id;

comment on column public."AIUsageEvents".company_id is
  'Customer company responsible for tenant-specific AI usage. NULL represents platform/global overhead.';

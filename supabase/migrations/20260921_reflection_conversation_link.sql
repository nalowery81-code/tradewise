
alter table public."Reflections"
  add column if not exists conversation_id uuid null references public."Conversations"(id) on delete set null;

create index if not exists reflections_conversation_id_idx
  on public."Reflections"(conversation_id);

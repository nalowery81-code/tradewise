alter table public."Technicians"
  add column if not exists default_jurisdiction jsonb;

alter table public."Technicians"
  drop constraint if exists technicians_default_jurisdiction_is_object;
alter table public."Technicians"
  add constraint technicians_default_jurisdiction_is_object
  check (default_jurisdiction is null or jsonb_typeof(default_jurisdiction) = 'object');

alter table public."Conversations"
  add column if not exists jurisdiction jsonb;

alter table public."Conversations"
  drop constraint if exists conversations_jurisdiction_is_object;
alter table public."Conversations"
  add constraint conversations_jurisdiction_is_object
  check (jurisdiction is null or jsonb_typeof(jurisdiction) = 'object');

create or replace function private.jurisdiction_allowed(p_company_id uuid, p_jurisdiction jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."Companies" c
    cross join lateral jsonb_array_elements(c.jurisdictions) as allowed
    where c.id = p_company_id
      and upper(coalesce(allowed->>'country', '')) = upper(coalesce(p_jurisdiction->>'country', ''))
      and upper(coalesce(allowed->>'state', '')) = upper(coalesce(p_jurisdiction->>'state', ''))
      and lower(coalesce(allowed->>'locality', '')) = lower(coalesce(p_jurisdiction->>'locality', ''))
  )
$$;

revoke all on function private.jurisdiction_allowed(uuid, jsonb) from public;
grant execute on function private.jurisdiction_allowed(uuid, jsonb) to authenticated, service_role;

create or replace function public.validate_technician_default_jurisdiction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_jurisdiction is not null
     and not private.jurisdiction_allowed(new.company_id, new.default_jurisdiction) then
    raise exception 'Technician default jurisdiction must be enabled for the company.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_technician_default_jurisdiction_trigger on public."Technicians";
create trigger validate_technician_default_jurisdiction_trigger
before insert or update of company_id, default_jurisdiction
on public."Technicians"
for each row execute function public.validate_technician_default_jurisdiction();

create or replace function public.set_conversation_jurisdiction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_default_jurisdiction jsonb;
  v_company_jurisdictions jsonb;
begin
  if new.technician_id is null then return new; end if;

  select t.company_id, t.default_jurisdiction
    into v_company_id, v_default_jurisdiction
  from public."Technicians" t
  where t.id = new.technician_id;

  if v_company_id is null then
    raise exception 'Technician company could not be resolved.';
  end if;

  if new.jurisdiction is null then
    if v_default_jurisdiction is not null then
      new.jurisdiction := v_default_jurisdiction;
    else
      select c.jurisdictions into v_company_jurisdictions
      from public."Companies" c
      where c.id = v_company_id;

      if jsonb_typeof(v_company_jurisdictions) = 'array'
         and jsonb_array_length(v_company_jurisdictions) = 1 then
        new.jurisdiction := v_company_jurisdictions->0;
      end if;
    end if;
  end if;

  if new.jurisdiction is not null
     and not private.jurisdiction_allowed(v_company_id, new.jurisdiction) then
    raise exception 'Conversation jurisdiction must be enabled for the company.';
  end if;

  return new;
end;
$$;

drop trigger if exists set_conversation_jurisdiction_trigger on public."Conversations";
create trigger set_conversation_jurisdiction_trigger
before insert or update of technician_id, jurisdiction
on public."Conversations"
for each row execute function public.set_conversation_jurisdiction();

update public."Technicians" t
set default_jurisdiction = c.jurisdictions->0
from public."Companies" c
where t.company_id = c.id
  and t.default_jurisdiction is null
  and jsonb_typeof(c.jurisdictions) = 'array'
  and jsonb_array_length(c.jurisdictions) = 1;

update public."Conversations" c
set jurisdiction = coalesce(
  t.default_jurisdiction,
  case
    when jsonb_typeof(co.jurisdictions) = 'array' and jsonb_array_length(co.jurisdictions) = 1
    then co.jurisdictions->0
    else null
  end
)
from public."Technicians" t
join public."Companies" co on co.id = t.company_id
where c.technician_id = t.id
  and c.jurisdiction is null;

comment on column public."Technicians".default_jurisdiction is
  'Optional default job jurisdiction for this technician; must be enabled on the company.';
comment on column public."Conversations".jurisdiction is
  'Active job jurisdiction governing jurisdiction-sensitive guidance for this conversation.';

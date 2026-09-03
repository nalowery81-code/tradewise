create table if not exists public."Companies" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public."UserProfiles" add column if not exists company_id uuid references public."Companies"(id);
alter table public."Technicians" add column if not exists company_id uuid references public."Companies"(id);
alter table public."Reflections" add column if not exists company_id uuid references public."Companies"(id);
alter table public."Conversations" add column if not exists company_id uuid references public."Companies"(id);
alter table public."ManagerFollowUps" add column if not exists company_id uuid references public."Companies"(id);
alter table public."ManagerNotes" add column if not exists company_id uuid references public."Companies"(id);
alter table public."ManagerNotes" add column if not exists technician_id uuid references public."Technicians"(id) on delete cascade;
alter table public."TechnicianAliases" add column if not exists company_id uuid references public."Companies"(id);
alter table public.ai_insights add column if not exists company_id uuid references public."Companies"(id);

do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public."Companies" order by created_at asc limit 1;
  if v_company_id is null then
    insert into public."Companies" (name) values ('Tradewise') returning id into v_company_id;
  end if;

  update public."UserProfiles" set company_id = v_company_id where company_id is null;
  update public."Technicians" set company_id = v_company_id where company_id is null;

  update public."Reflections" r set company_id = coalesce(t.company_id, v_company_id)
  from public."Technicians" t where r.company_id is null and r.technician_id = t.id;
  update public."Reflections" set company_id = v_company_id where company_id is null;

  update public."Conversations" c set company_id = coalesce(t.company_id, v_company_id)
  from public."Technicians" t where c.company_id is null and c.technician_id = t.id;
  update public."Conversations" set company_id = v_company_id where company_id is null;

  update public."ManagerFollowUps" f set company_id = coalesce(t.company_id, v_company_id)
  from public."Technicians" t where f.company_id is null and f.technician_id = t.id;
  update public."ManagerFollowUps" set company_id = v_company_id where company_id is null;

  update public."ManagerNotes" n
  set technician_id = t.id, company_id = t.company_id
  from public."Technicians" t
  where n.technician_name = t.canonical_name and (n.technician_id is null or n.company_id is null);
  update public."ManagerNotes" set company_id = v_company_id where company_id is null;

  update public."TechnicianAliases" a set company_id = coalesce(t.company_id, v_company_id)
  from public."Technicians" t where a.company_id is null and a.technician_id = t.id;
  update public."TechnicianAliases" set company_id = v_company_id where company_id is null;

  update public.ai_insights a set company_id = coalesce(t.company_id, v_company_id)
  from public."Technicians" t where a.company_id is null and a.technician_id = t.id;
  update public.ai_insights set company_id = v_company_id where company_id is null;

  update public."UserProfiles" set role = 'owner' where role = 'manager';
end $$;

alter table public."UserProfiles" alter column company_id set not null;
alter table public."Technicians" alter column company_id set not null;
alter table public."Reflections" alter column company_id set not null;
alter table public."Conversations" alter column company_id set not null;
alter table public."ManagerFollowUps" alter column company_id set not null;
alter table public."ManagerNotes" alter column company_id set not null;
alter table public."ManagerNotes" alter column technician_id set not null;
alter table public."TechnicianAliases" alter column company_id set not null;
alter table public.ai_insights alter column company_id set not null;

alter table public."UserProfiles" drop constraint if exists userprofiles_role_check;
alter table public."UserProfiles" add constraint userprofiles_role_check check (role in ('owner','manager','technician'));

alter table public."Technicians" drop constraint if exists "Technicians_canonical_name_key";
alter table public."Technicians" add constraint technicians_company_name_unique unique (company_id, canonical_name);

alter table public."ManagerNotes" drop constraint if exists "ManagerNotes_technician_name_key";
alter table public."ManagerNotes" add constraint manager_notes_company_technician_unique unique (company_id, technician_id);

create table if not exists public."ManagerTechnicians" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public."Companies"(id) on delete cascade,
  manager_profile_id uuid not null references public."UserProfiles"(id) on delete cascade,
  technician_id uuid not null references public."Technicians"(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (manager_profile_id, technician_id)
);

create index if not exists userprofiles_company_role_idx on public."UserProfiles" (company_id, role);
create index if not exists technicians_company_name_idx on public."Technicians" (company_id, canonical_name);
create index if not exists reflections_company_created_idx on public."Reflections" (company_id, created_at desc);
create index if not exists conversations_company_updated_idx on public."Conversations" (company_id, updated_at desc);
create index if not exists manager_followups_company_status_idx on public."ManagerFollowUps" (company_id, status, created_at desc);

alter table public."Companies" enable row level security;
alter table public."ManagerNotes" enable row level security;
alter table public."ManagerTechnicians" enable row level security;

create or replace function public.current_tradewise_company_id()
returns uuid language sql stable security definer set search_path = public
as $$ select company_id from public."UserProfiles" where auth_user_id = auth.uid() limit 1 $$;

create or replace function public.current_tradewise_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public."UserProfiles" where auth_user_id = auth.uid() limit 1 $$;

revoke all on function public.current_tradewise_company_id() from public;
revoke all on function public.current_tradewise_role() from public;
grant execute on function public.current_tradewise_company_id() to authenticated;
grant execute on function public.current_tradewise_role() to authenticated;

drop policy if exists "Technicians open for demo" on public."Technicians";
drop policy if exists "Authenticated users can read technicians" on public."Technicians";
drop policy if exists "Authenticated users can insert technicians" on public."Technicians";
drop policy if exists "Authenticated users can update technicians" on public."Technicians";
create policy "Company members can read technicians" on public."Technicians"
for select to authenticated
using (
  company_id = public.current_tradewise_company_id()
  and (auth_user_id = auth.uid() or public.current_tradewise_role() in ('owner','manager'))
);

drop policy if exists "Allow public read reflections" on public."Reflections";
drop policy if exists "Allow reads from Reflections" on public."Reflections";
drop policy if exists "Allow inserts into Reflections" on public."Reflections";
create policy "Company members can read reflections" on public."Reflections"
for select to authenticated
using (
  company_id = public.current_tradewise_company_id()
  and (
    public.current_tradewise_role() in ('owner','manager')
    or exists (select 1 from public."Technicians" t where t.id = "Reflections".technician_id and t.auth_user_id = auth.uid())
  )
);

drop policy if exists "Aliases open for demo" on public."TechnicianAliases";
drop policy if exists "Authenticated users can read aliases" on public."TechnicianAliases";
drop policy if exists "Authenticated users can insert aliases" on public."TechnicianAliases";
drop policy if exists "Authenticated users can update aliases" on public."TechnicianAliases";
create policy "Company members can read aliases" on public."TechnicianAliases"
for select to authenticated using (company_id = public.current_tradewise_company_id());

drop policy if exists "Allow read" on public.ai_insights;
drop policy if exists "Allow insert" on public.ai_insights;
create policy "Company managers can read insights" on public.ai_insights
for select to authenticated
using (company_id = public.current_tradewise_company_id() and public.current_tradewise_role() in ('owner','manager'));

create policy "Members can read own company" on public."Companies"
for select to authenticated using (id = public.current_tradewise_company_id());

create policy "Owners can read company profiles" on public."UserProfiles"
for select to authenticated
using (
  auth_user_id = auth.uid()
  or (company_id = public.current_tradewise_company_id() and public.current_tradewise_role() = 'owner')
);

create policy "Company managers can read notes" on public."ManagerNotes"
for select to authenticated
using (company_id = public.current_tradewise_company_id() and public.current_tradewise_role() in ('owner','manager'));

create policy "Company managers can read assignments" on public."ManagerTechnicians"
for select to authenticated
using (company_id = public.current_tradewise_company_id() and public.current_tradewise_role() in ('owner','manager'));

create or replace function public.set_company_from_technician()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if new.technician_id is not null then
    select company_id into v_company_id from public."Technicians" where id = new.technician_id;
    if v_company_id is null then raise exception 'Technician company not found'; end if;
    new.company_id := v_company_id;
  end if;
  return new;
end;
$$;

revoke all on function public.set_company_from_technician() from public;

do $$
declare
  t text;
begin
  foreach t in array array['Conversations','Reflections','ManagerFollowUps','ManagerNotes','TechnicianAliases','ai_insights']
  loop
    execute format('drop trigger if exists set_company_from_technician on public.%I', t);
    execute format('create trigger set_company_from_technician before insert or update of technician_id, company_id on public.%I for each row execute function public.set_company_from_technician()', t);
  end loop;
end $$;

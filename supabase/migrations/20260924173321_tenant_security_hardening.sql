create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_tradewise_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select company_id
  from public."UserProfiles"
  where auth_user_id = (select auth.uid())
    and is_active = true
  limit 1
$$;

create or replace function private.current_tradewise_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public."UserProfiles"
  where auth_user_id = (select auth.uid())
    and is_active = true
  limit 1
$$;

revoke all on function private.current_tradewise_company_id() from public;
revoke all on function private.current_tradewise_role() from public;
grant execute on function private.current_tradewise_company_id() to authenticated, service_role;
grant execute on function private.current_tradewise_role() to authenticated, service_role;

drop policy if exists "Company members can read technicians" on public."Technicians";
create policy "Company members can read technicians"
on public."Technicians"
for select to authenticated
using (
  company_id = (select private.current_tradewise_company_id())
  and (
    auth_user_id = (select auth.uid())
    or (select private.current_tradewise_role()) in ('owner','manager')
  )
);

drop policy if exists "Company members can read reflections" on public."Reflections";
create policy "Company members can read reflections"
on public."Reflections"
for select to authenticated
using (
  company_id = (select private.current_tradewise_company_id())
  and (
    (select private.current_tradewise_role()) in ('owner','manager')
    or exists (
      select 1
      from public."Technicians" t
      where t.id = "Reflections".technician_id
        and t.auth_user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Company members can read aliases" on public."TechnicianAliases";
create policy "Company members can read aliases"
on public."TechnicianAliases"
for select to authenticated
using (company_id = (select private.current_tradewise_company_id()));

drop policy if exists "Company managers can read insights" on public.ai_insights;
create policy "Company managers can read insights"
on public.ai_insights
for select to authenticated
using (
  company_id = (select private.current_tradewise_company_id())
  and (select private.current_tradewise_role()) in ('owner','manager')
);

drop policy if exists "Members can read own company" on public."Companies";
create policy "Members can read own company"
on public."Companies"
for select to authenticated
using (id = (select private.current_tradewise_company_id()));

drop policy if exists "Owners can read company profiles" on public."UserProfiles";
create policy "Owners can read company profiles"
on public."UserProfiles"
for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or (
    company_id = (select private.current_tradewise_company_id())
    and (select private.current_tradewise_role()) = 'owner'
  )
);

drop policy if exists "Company managers can read notes" on public."ManagerNotes";
create policy "Company managers can read notes"
on public."ManagerNotes"
for select to authenticated
using (
  company_id = (select private.current_tradewise_company_id())
  and (select private.current_tradewise_role()) in ('owner','manager')
);

drop policy if exists "Company managers can read assignments" on public."ManagerTechnicians";
create policy "Company managers can read assignments"
on public."ManagerTechnicians"
for select to authenticated
using (
  company_id = (select private.current_tradewise_company_id())
  and (select private.current_tradewise_role()) in ('owner','manager')
);

drop function if exists public.current_tradewise_company_id();
drop function if exists public.current_tradewise_role();

alter table public."UserProfiles"
  drop constraint if exists userprofiles_company_id_id_unique;
alter table public."UserProfiles"
  add constraint userprofiles_company_id_id_unique unique (company_id, id);

alter table public."Technicians"
  drop constraint if exists technicians_company_id_id_unique;
alter table public."Technicians"
  add constraint technicians_company_id_id_unique unique (company_id, id);

alter table public."ManagerTechnicians"
  drop constraint if exists managertechnicians_company_manager_fk;
alter table public."ManagerTechnicians"
  add constraint managertechnicians_company_manager_fk
  foreign key (company_id, manager_profile_id)
  references public."UserProfiles" (company_id, id)
  on delete cascade;

alter table public."ManagerTechnicians"
  drop constraint if exists managertechnicians_company_technician_fk;
alter table public."ManagerTechnicians"
  add constraint managertechnicians_company_technician_fk
  foreign key (company_id, technician_id)
  references public."Technicians" (company_id, id)
  on delete cascade;

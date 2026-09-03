alter table public."UserProfiles"
  add column if not exists is_active boolean not null default true;

alter table public."UserProfiles"
  add column if not exists deactivated_at timestamptz;

create index if not exists userprofiles_company_active_role_idx
  on public."UserProfiles" (company_id, is_active, role);

create or replace function public.current_tradewise_company_id()
returns uuid language sql stable security definer set search_path = public
as $$
  select company_id
  from public."UserProfiles"
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.current_tradewise_role()
returns text language sql stable security definer set search_path = public
as $$
  select role
  from public."UserProfiles"
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1
$$;

revoke all on function public.current_tradewise_company_id() from public;
revoke all on function public.current_tradewise_role() from public;
grant execute on function public.current_tradewise_company_id() to authenticated;
grant execute on function public.current_tradewise_role() to authenticated;

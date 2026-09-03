alter table public."UserProfiles"
  add column if not exists technician_id uuid;

alter table public."UserProfiles"
  drop constraint if exists "UserProfiles_technician_id_fkey";

alter table public."UserProfiles"
  add constraint "UserProfiles_technician_id_fkey"
  foreign key (technician_id)
  references public."Technicians"(id)
  on delete set null;

create unique index if not exists userprofiles_technician_id_unique
  on public."UserProfiles" (technician_id)
  where technician_id is not null;

update public."UserProfiles" as profile
set technician_id = technician.id
from public."Technicians" as technician
where profile.technician_id is null
  and profile.auth_user_id = technician.auth_user_id
  and profile.company_id = technician.company_id;

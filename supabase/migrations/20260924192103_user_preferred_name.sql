alter table public."UserProfiles"
  add column if not exists preferred_name text;

alter table public."UserProfiles"
  drop constraint if exists user_profiles_preferred_name_length;

alter table public."UserProfiles"
  add constraint user_profiles_preferred_name_length
  check (
    preferred_name is null
    or (
      length(btrim(preferred_name)) between 1 and 80
      and preferred_name = btrim(preferred_name)
    )
  );

comment on column public."UserProfiles".preferred_name is
  'Optional name the user prefers CraftCompass and coworkers to use. Full/legal identity remains in the authentication account and technician canonical identity.';

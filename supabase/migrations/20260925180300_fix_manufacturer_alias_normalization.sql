alter table public."VerifiedManufacturerAliases"
  drop constraint if exists "VerifiedManufacturerAliases_alias_normalized_canonical_norm_key";

drop index if exists public.verified_manufacturer_alias_lookup;

alter table public."VerifiedManufacturerAliases" drop column if exists alias_normalized;
alter table public."VerifiedManufacturerAliases" drop column if exists canonical_normalized;

alter table public."VerifiedManufacturerAliases"
  add column alias_normalized text
  generated always as (
    regexp_replace(lower(trim(alias)), '[^a-z0-9]+', '', 'g')
  ) stored;

alter table public."VerifiedManufacturerAliases"
  add column canonical_normalized text
  generated always as (
    regexp_replace(lower(trim(canonical_manufacturer)), '[^a-z0-9]+', '', 'g')
  ) stored;

alter table public."VerifiedManufacturerAliases"
  add constraint "VerifiedManufacturerAliases_alias_normalized_canonical_norm_key"
  unique (alias_normalized, canonical_normalized);

create index verified_manufacturer_alias_lookup
  on public."VerifiedManufacturerAliases"(alias_normalized)
  where verification_status = 'verified';

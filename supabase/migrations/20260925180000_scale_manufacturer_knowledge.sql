create extension if not exists pgcrypto;

create table if not exists public."Manufacturers" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  slug text not null,
  website_url text,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  unique (name),
  unique (slug)
);

create table if not exists public."ManufacturerProducts" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  manufacturer_id uuid not null references public."Manufacturers"(id) on delete cascade,
  model text not null,
  product_family text,
  equipment_type text,
  sku text,
  description text,
  status text not null default 'active' check (status in ('active','inactive','superseded')),
  last_verified_at timestamptz,
  unique (manufacturer_id, model)
);

create table if not exists public."ManufacturerProductDocuments" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid not null references public."ManufacturerProducts"(id) on delete cascade,
  manufacturer_document_id uuid not null references public."ManufacturerDocuments"(id) on delete cascade,
  relationship_type text not null default 'supports' check (relationship_type in ('supports','primary','supersedes','parts','service','installation','submittal','performance')),
  status text not null default 'active' check (status in ('active','inactive')),
  unique (product_id, manufacturer_document_id, relationship_type)
);

create table if not exists public."ManufacturerProductFacts" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  product_id uuid not null references public."ManufacturerProducts"(id) on delete cascade,
  fact_key text not null,
  value_text text,
  value_number numeric,
  unit text,
  value_json jsonb,
  source_document_id uuid not null references public."ManufacturerDocuments"(id) on delete restrict,
  source_locator text,
  verification_status text not null default 'verified' check (verification_status in ('verified','needs_review','conflict','superseded')),
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  effective_from date,
  effective_to date,
  last_verified_at timestamptz not null default now(),
  constraint manufacturer_product_facts_has_value check (
    value_text is not null or value_number is not null or value_json is not null
  )
);

create index if not exists manufacturer_products_manufacturer_idx
  on public."ManufacturerProducts"(manufacturer_id, status, model);
create index if not exists manufacturer_products_equipment_idx
  on public."ManufacturerProducts"(equipment_type, product_family);
create index if not exists manufacturer_product_facts_product_idx
  on public."ManufacturerProductFacts"(product_id, verification_status, fact_key);
create index if not exists manufacturer_product_facts_source_idx
  on public."ManufacturerProductFacts"(source_document_id);
create index if not exists manufacturer_product_documents_product_idx
  on public."ManufacturerProductDocuments"(product_id, status);

alter table public."ManufacturerDocuments"
  add column if not exists manufacturer_id uuid references public."Manufacturers"(id) on delete set null;

create index if not exists manufacturer_documents_manufacturer_idx
  on public."ManufacturerDocuments"(manufacturer_id, status);

alter table public."Manufacturers" enable row level security;
alter table public."ManufacturerProducts" enable row level security;
alter table public."ManufacturerProductDocuments" enable row level security;
alter table public."ManufacturerProductFacts" enable row level security;

insert into public."Manufacturers" (name, slug, website_url)
values
  ('State Water Heaters','state-water-heaters','https://www.statewaterheaters.com/'),
  ('Lochinvar','lochinvar','https://www.lochinvar.com/'),
  ('Liberty Pumps','liberty-pumps','https://libertypumps.com/'),
  ('Sloan','sloan','https://www.sloan.com/'),
  ('Gerber Plumbing Fixtures','gerber-plumbing-fixtures','https://www.gerber-us.com/'),
  ('Legend Valve','legend-valve','https://legendvalve.com/'),
  ('Vesta','vesta',null)
on conflict (name) do nothing;

update public."ManufacturerDocuments" d
set manufacturer_id = m.id
from public."Manufacturers" m
where d.manufacturer_id is null
  and lower(trim(d.manufacturer)) = lower(trim(m.name));

create or replace function public.touch_manufacturer_knowledge_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists manufacturers_touch_updated_at on public."Manufacturers";
create trigger manufacturers_touch_updated_at
before update on public."Manufacturers"
for each row execute function public.touch_manufacturer_knowledge_updated_at();

drop trigger if exists manufacturer_products_touch_updated_at on public."ManufacturerProducts";
create trigger manufacturer_products_touch_updated_at
before update on public."ManufacturerProducts"
for each row execute function public.touch_manufacturer_knowledge_updated_at();

drop trigger if exists manufacturer_product_facts_touch_updated_at on public."ManufacturerProductFacts";
create trigger manufacturer_product_facts_touch_updated_at
before update on public."ManufacturerProductFacts"
for each row execute function public.touch_manufacturer_knowledge_updated_at();

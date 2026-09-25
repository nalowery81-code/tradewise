alter table public."ManufacturerProducts"
  add column if not exists model_normalized text
  generated always as (lower(regexp_replace(model, '[^a-zA-Z0-9]', '', 'g'))) stored;

create index if not exists manufacturer_products_model_normalized_idx
  on public."ManufacturerProducts"(manufacturer_id, model_normalized)
  where status = 'active';

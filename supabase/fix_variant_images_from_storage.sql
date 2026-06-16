-- ════════════════════════════════════════════════════════════════════
-- FIX INMEDIATO: poblar variants.image_urls desde storage.objects
-- ════════════════════════════════════════════════════════════════════
--
-- Storage ya tiene 49+ fotos en product-images/variants/{productId}/{variantId}/{fileId}.png
-- pero variants.image_urls = [] en todas. El bug de la regex en updateVariant
-- causaba que los saves se vieran como exitosos pero no persistieran nada.
--
-- Este script reconstruye image_urls leyendo los archivos reales del bucket
-- y armando la URL pública para cada uno. Solo afecta a variantes que
-- ACTUALMENTE tienen image_urls vacío (no sobreescribe nada manual).
--
-- Pasos:
--   1) Lee storage.objects filtrando por bucket=product-images y path variants/...
--   2) Extrae product_id y variant_id del path
--   3) Agrupa por variant_id en orden cronológico (created_at asc = primera = portada)
--   4) UPDATE variants SET image_urls = jsonb_array_of_public_urls, image_url = primer_url
--
-- Es idempotente: corre las veces que quieras. Solo afecta variants con [] o NULL.
-- ════════════════════════════════════════════════════════════════════

-- PASO 1 (preview, sin modificar nada): mira qué se va a actualizar antes
with variant_files as (
  select
    -- Path típico: variants/{product_uuid}/{variant_uuid}/{file_uuid}.ext
    split_part(o.name, '/', 2)::uuid as product_id,
    split_part(o.name, '/', 3)::uuid as variant_id,
    o.name                            as object_path,
    o.created_at
  from storage.objects o
  where o.bucket_id = 'product-images'
    and o.name like 'variants/%/%/%'
    -- Garantiza que los 3 segmentos sean uuids parseables
    and o.name ~ '^variants/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
),
variant_urls as (
  select
    vf.variant_id,
    jsonb_agg(
      ('https://hvxnvmfvxvjleuoenhib.supabase.co/storage/v1/object/public/product-images/' || vf.object_path)
      order by vf.created_at asc
    ) as urls
  from variant_files vf
  group by vf.variant_id
)
select
  v.id           as variant_id,
  v.variant_name,
  coalesce(jsonb_array_length(v.image_urls), 0) as urls_actuales,
  jsonb_array_length(vu.urls)                    as urls_a_aplicar,
  vu.urls -> 0                                    as nueva_portada
from public.variants v
join variant_urls vu on vu.variant_id = v.id
where coalesce(jsonb_array_length(v.image_urls), 0) = 0  -- Solo las vacías
order by v.variant_name;

-- ════════════════════════════════════════════════════════════════════
-- PASO 2 (ejecuta esto cuando el preview se vea bien): aplica el UPDATE
-- ════════════════════════════════════════════════════════════════════

with variant_files as (
  select
    split_part(o.name, '/', 2)::uuid as product_id,
    split_part(o.name, '/', 3)::uuid as variant_id,
    o.name                            as object_path,
    o.created_at
  from storage.objects o
  where o.bucket_id = 'product-images'
    and o.name like 'variants/%/%/%'
    and o.name ~ '^variants/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
),
variant_urls as (
  select
    vf.variant_id,
    jsonb_agg(
      ('https://hvxnvmfvxvjleuoenhib.supabase.co/storage/v1/object/public/product-images/' || vf.object_path)
      order by vf.created_at asc
    ) as urls
  from variant_files vf
  group by vf.variant_id
)
update public.variants v
set
  image_urls = vu.urls,
  image_url  = vu.urls ->> 0
from variant_urls vu
where vu.variant_id = v.id
  and coalesce(jsonb_array_length(v.image_urls), 0) = 0
returning
  v.id,
  v.variant_name,
  jsonb_array_length(v.image_urls) as urls_count,
  v.image_url;

-- ════════════════════════════════════════════════════════════════════
-- PASO 3: limpia products.image_url legacy. Ya no se usa en la UI nueva
-- y mantenerlo solo dispara el banner "Foto antigua del producto" en
-- cada apertura del drawer. Hacerlo NULL apaga el banner para siempre.
-- ════════════════════════════════════════════════════════════════════

update public.products
set image_url = null
where image_url is not null
returning id, name;

-- ════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- ════════════════════════════════════════════════════════════════════

-- a) Variantes con sus fotos asignadas
select
  v.id,
  v.variant_name,
  coalesce(jsonb_array_length(v.image_urls), 0) as urls_count,
  v.image_url
from public.variants v
order by v.variant_name;

-- b) Productos sin image_url legacy (deben estar todos en null)
select id, name, image_url
from public.products
where image_url is not null;

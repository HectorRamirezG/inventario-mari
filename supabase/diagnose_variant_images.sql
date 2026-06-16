-- ════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO COMPLETO: fotos por variante no persisten
-- Corre TODO en el SQL editor de Supabase y pega los resultados.
-- ════════════════════════════════════════════════════════════════════

-- 1) Tipo y default de columna image_urls (debería ser jsonb con default '[]')
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name  = 'variants'
  and column_name in ('image_url', 'image_urls');

-- 2) Estado REAL de cada variante: ¿image_urls tiene contenido o sigue vacío?
--    Si todas tienen exactamente la misma URL (la heredada), confirma que
--    el save manual NO está persistiendo las fotos extra.
select
  v.id,
  v.variant_name,
  v.image_url,
  v.image_urls,
  jsonb_typeof(v.image_urls)              as urls_type,
  coalesce(jsonb_array_length(v.image_urls), 0) as urls_count
from public.variants v
order by v.variant_name;

-- 3) Archivos subidos al bucket product-images en la carpeta de variantes.
--    Si Mari ya subió fotos vía el uploader, deberían aparecer aquí
--    AUNQUE el UPDATE de variants haya fallado (Storage y UPDATE son pasos
--    distintos).
select
  o.name,
  o.bucket_id,
  o.owner,
  o.created_at,
  o.updated_at,
  (o.metadata ->> 'size')::bigint as size_bytes,
  o.metadata ->> 'mimetype'       as mimetype
from storage.objects o
where o.bucket_id = 'product-images'
  and o.name like 'variants/%'
order by o.created_at desc
limit 50;

-- 4) Políticas RLS sobre public.variants — buscamos cuáles permiten UPDATE.
--    Si la política de UPDATE no permite a admin/staff, los saves se ven
--    "ok" pero hacen 0 filas (Postgres no devuelve error con RLS DENY,
--    simplemente no actualiza).
select
  policyname,
  cmd,
  permissive,
  roles,
  qual           as using_clause,
  with_check     as with_check_clause
from pg_policies
where schemaname = 'public'
  and tablename  = 'variants'
order by cmd, policyname;

-- 5) Políticas RLS sobre storage.objects — confirmamos que los uploads
--    al bucket product-images sí están permitidos a usuarios autenticados.
select
  policyname,
  cmd,
  permissive,
  roles,
  qual           as using_clause,
  with_check     as with_check_clause
from pg_policies
where schemaname = 'storage'
  and tablename  = 'objects'
order by cmd, policyname;

-- 6) ¿Quién es el "owner" actual de los archivos subidos? Necesitamos saber
--    si Mari está autenticada o si Supabase los marcó como anónimos
--    (lo que podría romper RLS de UPDATE más adelante).
select
  o.owner,
  count(*) as files
from storage.objects o
where o.bucket_id = 'product-images'
group by o.owner
order by files desc;

-- 7) Cualquier producto que TODAVÍA tenga image_url legacy. Si la migración
--    "Heredar a todas" funcionó, este SELECT debería estar VACÍO (porque
--    al heredar limpiamos product.image_url = null automáticamente).
select
  p.id,
  p.name,
  p.image_url
from public.products p
where p.image_url is not null
order by p.name;

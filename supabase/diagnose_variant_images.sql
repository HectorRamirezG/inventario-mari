select
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'variants'
order by c.ordinal_position;

select
  v.id,
  v.variant_name,
  v.image_url,
  v.image_urls,
  jsonb_typeof(v.image_urls) as urls_type,
  coalesce(jsonb_array_length(v.image_urls), 0) as urls_count
from public.variants v
order by v.variant_name
limit 50;

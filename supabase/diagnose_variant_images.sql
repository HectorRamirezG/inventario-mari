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

select
  p.id,
  p.name,
  p.image_url is not null as has_product_image,
  count(v.id) filter (where v.image_url is not null) as variants_with_main_img,
  count(v.id) filter (where jsonb_array_length(coalesce(v.image_urls,'[]'::jsonb)) > 0) as variants_with_gallery
from public.products p
left join public.variants v on v.product_id = p.id and v.is_active = true
group by p.id, p.name, p.image_url
order by p.name;

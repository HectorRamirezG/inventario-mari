update public.user_profiles set role = 'admin' where email = 'mariamcontreras07@gmail.com';

insert into public.app_settings (key, value) values
  ('bank_account', jsonb_build_object(
    'bank', 'BBVA',
    'holder', 'Maria Contreras',
    'clabe', '012345678901234567',
    'card', '4152 1234 5678 9012',
    'notes', 'Enviar comprobante por WhatsApp despues de transferir.'
  )),
  ('shipping_config', jsonb_build_object(
    'foreign_cost', 250,
    'free_from', 2800,
    'local_cost', 0
  )),
  ('tier_thresholds', jsonb_build_object(
    'umbral_medio', 6,
    'umbral_mayoreo', 12
  )),
  ('store_info', jsonb_build_object(
    'name', 'Mari Boutique',
    'phone', '5215512345678',
    'whatsapp', '5215512345678',
    'address', 'Ciudad de Mexico',
    'instagram', '@mari.boutique'
  ))
on conflict (key) do nothing;

with p1 as (
  insert into public.products (name, category, cost, price, min_stock, is_active)
  values ('Blusa Basica', 'Ropa', 80, 180, 3, true) returning id
)
insert into public.variants (product_id, variant_name, sku, stock, price_menudeo, price_medio, price_mayoreo)
select id, v.variant_name, v.sku, v.stock, 180, 150, 120
from p1, (values
  ('Negro - CH', 'BLU-NG-CH', 10),
  ('Negro - M',  'BLU-NG-M',  12),
  ('Blanco - CH','BLU-BL-CH', 8),
  ('Blanco - M', 'BLU-BL-M',  10)
) as v(variant_name, sku, stock);

with p2 as (
  insert into public.products (name, category, cost, price, min_stock, is_active)
  values ('Pantalon Mezclilla', 'Ropa', 220, 450, 2, true) returning id
)
insert into public.variants (product_id, variant_name, sku, stock, price_menudeo, price_medio, price_mayoreo)
select id, v.variant_name, v.sku, v.stock, 450, 400, 350
from p2, (values
  ('Azul - 28', 'PAN-AZ-28', 6),
  ('Azul - 30', 'PAN-AZ-30', 6),
  ('Azul - 32', 'PAN-AZ-32', 4)
) as v(variant_name, sku, stock);

with p3 as (
  insert into public.products (name, category, cost, price, min_stock, is_active)
  values ('Bolso Mano', 'Accesorios', 150, 350, 2, true) returning id
)
insert into public.variants (product_id, variant_name, sku, stock, price_menudeo, price_medio, price_mayoreo)
select id, v.variant_name, v.sku, v.stock, 350, 300, 250
from p3, (values
  ('Cafe',  'BOL-CF', 5),
  ('Negro', 'BOL-NG', 5)
) as v(variant_name, sku, stock);

notify pgrst, 'reload schema';

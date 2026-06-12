-- =====================================================================
--  MARI INVENTARIO — SEED DEMO
--  Datos de ejemplo para ver la app funcionando: productos cosméticos,
--  variantes con precios por tier, una venta menudeo, un apartado con
--  abonos y una venta de mayoreo.
--
--  IDEMPOTENTE — UUIDs fijos + ON CONFLICT. Puedes correrlo varias
--  veces y SIEMPRE deja la misma demo (sin duplicados).
--
--  REQUIERE: 0001_schema.sql, 0002_functions.sql, 0004_apartados_customer.sql
-- =====================================================================

-- ============== UUIDs FIJOS (para idempotencia) =====================
do $$
declare
  -- products
  p_labial   uuid := '11111111-1111-1111-1111-111111111101';
  p_base     uuid := '11111111-1111-1111-1111-111111111102';
  p_sombra   uuid := '11111111-1111-1111-1111-111111111103';
  p_mascara  uuid := '11111111-1111-1111-1111-111111111104';
  p_brocha   uuid := '11111111-1111-1111-1111-111111111105';
  p_rubor    uuid := '11111111-1111-1111-1111-111111111106';
  p_perfume  uuid := '11111111-1111-1111-1111-111111111107';
  p_serum    uuid := '11111111-1111-1111-1111-111111111108';

  -- variants
  v_lab_rojo   uuid := '22222222-2222-2222-2222-222222222201';
  v_lab_nude   uuid := '22222222-2222-2222-2222-222222222202';
  v_lab_vino   uuid := '22222222-2222-2222-2222-222222222203';

  v_base_01    uuid := '22222222-2222-2222-2222-222222222211';
  v_base_02    uuid := '22222222-2222-2222-2222-222222222212';
  v_base_03    uuid := '22222222-2222-2222-2222-222222222213';

  v_pal_neutra uuid := '22222222-2222-2222-2222-222222222221';
  v_pal_glam   uuid := '22222222-2222-2222-2222-222222222222';

  v_masc_neg   uuid := '22222222-2222-2222-2222-222222222231';
  v_masc_cafe  uuid := '22222222-2222-2222-2222-222222222232';

  v_br_kabuki  uuid := '22222222-2222-2222-2222-222222222241';
  v_br_ojo     uuid := '22222222-2222-2222-2222-222222222242';

  v_rub_coral  uuid := '22222222-2222-2222-2222-222222222251';
  v_rub_rosa   uuid := '22222222-2222-2222-2222-222222222252';

  v_perf_rosa  uuid := '22222222-2222-2222-2222-222222222261';

  v_ser_vitc   uuid := '22222222-2222-2222-2222-222222222271';

  -- sales
  s_menudeo   uuid := '33333333-3333-3333-3333-333333333301';
  s_apartado  uuid := '33333333-3333-3333-3333-333333333302';
  s_mayoreo   uuid := '33333333-3333-3333-3333-333333333303';
  s_apartado2 uuid := '33333333-3333-3333-3333-333333333304';
begin

  -- ============== PRODUCTOS =========================================
  insert into public.products (id, name, category, cost, min_stock, is_active) values
    (p_labial,  'Labial Matte Premium',       'Labios',     35,  5, true),
    (p_base,    'Base Líquida HD 24h',        'Rostro',     85,  3, true),
    (p_sombra,  'Paleta de Sombras',          'Ojos',      120,  2, true),
    (p_mascara, 'Máscara de Pestañas Volume', 'Ojos',       45,  5, true),
    (p_brocha,  'Brocha Profesional',         'Accesorios', 60,  3, true),
    (p_rubor,   'Rubor Compacto Glow',        'Rostro',     55,  4, true),
    (p_perfume, 'Perfume Floral 50ml',        'Fragancias',180,  2, true),
    (p_serum,   'Serum Vitamina C',           'Skincare',  150,  3, true)
  on conflict (id) do update set
    name = excluded.name,
    category = excluded.category,
    cost = excluded.cost,
    min_stock = excluded.min_stock,
    is_active = excluded.is_active;


  -- ============== VARIANTES =========================================
  -- Precios: menudeo (1+) / medio (6+) / mayoreo (12+)
  insert into public.variants
    (id, product_id, variant_name, sku, stock, price, price_menudeo, price_medio, price_mayoreo, is_active)
  values
    -- Labial (cost 35)
    (v_lab_rojo, p_labial, 'Rojo Pasión',  'LAB-001', 25, 60, 60, 55, 50, true),
    (v_lab_nude, p_labial, 'Nude Glam',    'LAB-002', 30, 60, 60, 55, 50, true),
    (v_lab_vino, p_labial, 'Vino Tinto',   'LAB-003', 18, 60, 60, 55, 50, true),

    -- Base (cost 85)
    (v_base_01,  p_base,   'Tono Claro 01', 'BAS-001', 12, 140, 140, 130, 120, true),
    (v_base_02,  p_base,   'Tono Medio 02', 'BAS-002', 15, 140, 140, 130, 120, true),
    (v_base_03,  p_base,   'Tono Canela 03','BAS-003',  8, 140, 140, 130, 120, true),

    -- Paletas (cost 120)
    (v_pal_neutra, p_sombra, 'Paleta Neutra 12 tonos', 'SOM-001', 10, 200, 200, 185, 170, true),
    (v_pal_glam,   p_sombra, 'Paleta Glam Noche',      'SOM-002',  6, 200, 200, 185, 170, true),

    -- Máscara (cost 45)
    (v_masc_neg,   p_mascara, 'Negro Intenso', 'MAS-001', 35, 80, 80, 72, 65, true),
    (v_masc_cafe,  p_mascara, 'Café Natural',  'MAS-002', 20, 80, 80, 72, 65, true),

    -- Brochas (cost 60)
    (v_br_kabuki,  p_brocha, 'Kabuki',     'BRO-001', 14, 110, 110, 100,  90, true),
    (v_br_ojo,     p_brocha, 'Difumina ojo','BRO-002', 22,  90,  90,  82,  75, true),

    -- Rubor (cost 55)
    (v_rub_coral,  p_rubor, 'Coral Vivo', 'RUB-001', 18, 95, 95, 87, 80, true),
    (v_rub_rosa,   p_rubor, 'Rosa Suave', 'RUB-002', 20, 95, 95, 87, 80, true),

    -- Perfume (cost 180)
    (v_perf_rosa,  p_perfume, 'Edición Rosa 50ml', 'PER-001', 7, 320, 320, 300, 280, true),

    -- Serum (cost 150)
    (v_ser_vitc,   p_serum, 'Vit C 30ml', 'SER-001', 11, 240, 240, 220, 200, true)

  on conflict (id) do update set
    variant_name  = excluded.variant_name,
    sku           = excluded.sku,
    stock         = excluded.stock,
    price         = excluded.price,
    price_menudeo = excluded.price_menudeo,
    price_medio   = excluded.price_medio,
    price_mayoreo = excluded.price_mayoreo,
    is_active     = excluded.is_active;


  -- ============== VENTAS DE EJEMPLO =================================
  -- Borramos las demos previas (por sus UUIDs fijos) para no acumular
  -- pagos/items duplicados; los items y pagos se borran en cascada.
  delete from public.sales where id in (s_menudeo, s_apartado, s_mayoreo, s_apartado2);
  delete from public.movements where sale_id in (s_menudeo, s_apartado, s_mayoreo, s_apartado2);

  -- ─── VENTA 1: Menudeo, pagada al contado ───────────────────────
  insert into public.sales
    (id, customer_name, customer_phone, total, paid, balance, status, is_layaway, created_at)
  values
    (s_menudeo, 'Lupita García', '5512345678',
     200, 200, 0, 'paid', false, now() - interval '2 days');

  insert into public.sale_items
    (sale_id, variant_id, product_id, product_name, variant_name, qty, tier, unit_price, cost_snapshot, profit)
  values
    (s_menudeo, v_lab_rojo,  p_labial,  'Labial Matte Premium',       'Rojo Pasión',   2, 'menudeo', 60, 35,  50),
    (s_menudeo, v_masc_neg,  p_mascara, 'Máscara de Pestañas Volume', 'Negro Intenso', 1, 'menudeo', 80, 45,  35);

  insert into public.payments (sale_id, amount, method)
  values (s_menudeo, 200, 'efectivo');


  -- ─── VENTA 2: APARTADO con dirección + GPS + 2 abonos ──────────
  insert into public.sales
    (id, customer_name, customer_phone, customer_address, customer_location, notes,
     total, paid, balance, status, is_layaway, created_at)
  values
    (s_apartado, 'Brenda Martínez', '5598765432',
     'Av. Insurgentes 1234, Col. Roma Norte, CDMX',
     'https://www.google.com/maps?q=19.418056,-99.166944',
     'Entregar viernes después de las 6pm. Tocar 2 veces.',
     760, 300, 460, 'pending', true, now() - interval '5 days');

  insert into public.sale_items
    (sale_id, variant_id, product_id, product_name, variant_name, qty, tier, unit_price, cost_snapshot, profit)
  values
    (s_apartado, v_base_02,     p_base,    'Base Líquida HD 24h',  'Tono Medio 02',          1, 'menudeo', 140, 85, 55),
    (s_apartado, v_pal_neutra,  p_sombra,  'Paleta de Sombras',    'Paleta Neutra 12 tonos', 1, 'menudeo', 200, 120, 80),
    (s_apartado, v_perf_rosa,   p_perfume, 'Perfume Floral 50ml',  'Edición Rosa 50ml',      1, 'menudeo', 320, 180, 140),
    (s_apartado, v_rub_coral,   p_rubor,   'Rubor Compacto Glow',  'Coral Vivo',             1, 'menudeo',  95, 55,  40);

  -- 2 abonos parciales
  insert into public.payments (sale_id, amount, method, created_at)
  values
    (s_apartado, 200, 'efectivo',      now() - interval '5 days'),
    (s_apartado, 100, 'transferencia', now() - interval '2 days');


  -- ─── VENTA 3: MAYOREO (≥12 piezas → tier mayoreo) ──────────────
  -- 6 labiales + 6 máscaras = 12 piezas → mayoreo
  insert into public.sales
    (id, customer_name, customer_phone, total, paid, balance, status, is_layaway, created_at, notes)
  values
    (s_mayoreo, 'Salón Bellísima (Marisol)', '5587654321',
     690, 690, 0, 'paid', false, now() - interval '1 day',
     'Cliente mayorista. Pago a 30 días, este ya cubierto.');

  insert into public.sale_items
    (sale_id, variant_id, product_id, product_name, variant_name, qty, tier, unit_price, cost_snapshot, profit)
  values
    -- 6 labiales mezcla → mayoreo $50 c/u
    (s_mayoreo, v_lab_rojo, p_labial,  'Labial Matte Premium',       'Rojo Pasión',   3, 'mayoreo', 50, 35, 45),
    (s_mayoreo, v_lab_nude, p_labial,  'Labial Matte Premium',       'Nude Glam',     3, 'mayoreo', 50, 35, 45),
    -- 6 máscaras → mayoreo $65 c/u
    (s_mayoreo, v_masc_neg, p_mascara, 'Máscara de Pestañas Volume', 'Negro Intenso', 6, 'mayoreo', 65, 45, 120);

  insert into public.payments (sale_id, amount, method, created_at)
  values (s_mayoreo, 690, 'transferencia', now() - interval '1 day');


  -- ─── VENTA 4: APARTADO atrasado (>7 días, sin abonos) ──────────
  -- Sirve para ver la alerta de "días vencidos" en la lista.
  insert into public.sales
    (id, customer_name, customer_phone, customer_address, notes,
     total, paid, balance, status, is_layaway, created_at)
  values
    (s_apartado2, 'Karen Reyes', '5544332211',
     'Calle 5 de Mayo 88, Tlalpan',
     'Quedó de pasar el sábado, no ha llegado.',
     435, 100, 335, 'pending', true, now() - interval '10 days');

  insert into public.sale_items
    (sale_id, variant_id, product_id, product_name, variant_name, qty, tier, unit_price, cost_snapshot, profit)
  values
    (s_apartado2, v_ser_vitc,  p_serum,  'Serum Vitamina C',     'Vit C 30ml',  1, 'menudeo', 240, 150, 90),
    (s_apartado2, v_br_kabuki, p_brocha, 'Brocha Profesional',   'Kabuki',      1, 'menudeo', 110, 60,  50),
    (s_apartado2, v_rub_rosa,  p_rubor,  'Rubor Compacto Glow',  'Rosa Suave',  1, 'menudeo',  95, 55,  40);

  insert into public.payments (sale_id, amount, method, created_at)
  values (s_apartado2, 100, 'efectivo', now() - interval '10 days');


  -- ─── MOVIMIENTOS de SALIDA (uno por sale_item, para histórico) ─
  insert into public.movements (variant_id, product_id, sale_id, type, quantity, note)
  select si.variant_id, si.product_id, si.sale_id, 'salida', si.qty,
         'Demo seed — venta ' || s.customer_name
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
   where si.sale_id in (s_menudeo, s_apartado, s_mayoreo, s_apartado2)
     and si.variant_id is not null;


  -- ─── CONFIGURACIÓN DE PRECIOS (asegura defaults) ───────────────
  update public.pricing_config
     set margen_menudeo = 30,
         margen_medio   = 20,
         margen_mayoreo = 15,
         umbral_medio   = 6,
         umbral_mayoreo = 12,
         costo_extra    = 0
   where id = 1;

end$$;

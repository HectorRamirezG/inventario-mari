-- ════════════════════════════════════════════════════════════════════
-- LIMPIEZA PARA PRODUCCIÓN — Mari (versión EXHAUSTIVA)
-- ════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE este script (NO deja nada de prueba):
--   ✓ Borra TODOS los productos, variantes, movimientos de stock
--   ✓ Borra TODAS las ventas, items de venta, pagos, comprobantes
--   ✓ Borra TODOS los tickets de soporte
--   ✓ Borra TODAS las notificaciones (cliente y admin)
--   ✓ Borra TODOS los ciclos de inventario, inyecciones, gastos
--   ✓ Borra TODO el bucket de imágenes EXCEPTO los avatars de usuario
--     (carpeta `avatars/`). Esto incluye products/, variants/, new/,
--     gallery/, tmp/ y cualquier otra subcarpeta del bucket.
--   ✓ Resetea pricing_config a defaults razonables
--   ✓ Resetea las secuencias (identidad) de las tablas afectadas
--
-- QUÉ PRESERVA (no se toca):
--   ✗ auth.users         (sesiones, login, contraseñas)
--   ✗ user_profiles      (datos de Mari, admins, clientes registrados)
--   ✗ app_settings       (configuración de la tienda, textos legales, etc.)
--   ✗ bank_accounts      (CLABE / cuentas bancarias copiables)
--   ✗ business_rules     (reglas como min anticipo, alto valor, etc.)
--   ✗ storage avatars/   (fotos de perfil de Mari/admins/clientes)
--
-- CÓMO USARLO:
--   1. Lee TODO el script antes de correrlo.
--   2. Corre PASO 1 (preview) para ver cuántas filas/archivos se afectan.
--   3. Si el preview se ve bien, corre PASO 2 (limpieza atómica).
--   4. Verifica con PASO 3 que todo quedó vacío excepto los usuarios.
--   5. (Opcional) Corre PASO 4 si quieres limpiar también las cuentas
--      de clientes registrados (no admins).
--
-- ⚠️  ESTA OPERACIÓN ES IRREVERSIBLE — toma un backup antes si lo necesitas:
--      Supabase Dashboard → Project Settings → Database → Backups
-- ════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- PASO 1 — PREVIEW (no modifica nada, sólo cuenta lo que se va a ir)
-- ══════════════════════════════════════════════════════════════════
select
  -- Catálogo y operación
  (select count(*) from public.products)             as products,
  (select count(*) from public.variants)             as variants,
  (select count(*) from public.movements)            as movements,
  (select count(*) from public.sale_items)           as sale_items,
  (select count(*) from public.payments)             as payments,
  (select count(*) from public.payment_proofs)       as payment_proofs,
  (select count(*) from public.sales)                as sales,
  (select count(*) from public.support_tickets)      as support_tickets,
  (select count(*) from public.notifications)        as notifications,
  -- Ciclos financieros
  (select count(*) from public.capital_injections)   as capital_injections,
  (select count(*) from public.operating_expenses)   as operating_expenses,
  (select count(*) from public.inventory_cycles)     as inventory_cycles,
  -- Storage: TODO lo que NO sea avatars/
  (select count(*) from storage.objects
     where bucket_id = 'product-images'
       and name not like 'avatars/%'
  )                                                  as storage_files_to_delete,
  -- Cosas que se preservan (deben seguir > 0 después)
  (select count(*) from storage.objects
     where bucket_id = 'product-images'
       and name like 'avatars/%'
  )                                                  as storage_avatars_preserved,
  (select count(*) from public.user_profiles)        as user_profiles_preserved,
  (select count(*) from auth.users)                  as auth_users_preserved;


-- ══════════════════════════════════════════════════════════════════
-- PASO 2 — LIMPIEZA REAL (DESTRUCTIVO Y NO REVERSIBLE)
-- Todo va dentro de una transacción: o se borra TODO, o no se borra
-- nada. Si algún DELETE/TRUNCATE falla, ROLLBACK automático.
-- ══════════════════════════════════════════════════════════════════

begin;

-- ── 2.1 Storage primero: borra TODO el bucket excepto avatars/ ─────
-- (products/, variants/, new/, gallery/, tmp/, cualquier subcarpeta
--  que se haya creado en pruebas — todo se va salvo avatars/).
delete from storage.objects
where bucket_id = 'product-images'
  and name not like 'avatars/%';

-- ── 2.2 Tablas operativas + catálogo + ciclos en UN solo TRUNCATE ──
-- TRUNCATE CASCADE ignora FKs, vacía todo de un golpe y resetea las
-- secuencias (RESTART IDENTITY). Es lo más limpio y atómico posible.
-- Si alguna de estas tablas no existe en tu DB, comenta esa línea
-- antes de correr (Postgres falla si nombras una tabla inexistente).
truncate table
  public.movements,
  public.notifications,
  public.payment_proofs,
  public.payments,
  public.support_tickets,
  public.sale_items,
  public.sales,
  public.variants,
  public.products,
  public.capital_injections,
  public.operating_expenses,
  public.inventory_cycles
restart identity cascade;

-- ── 2.3 Reset de pricing_config a defaults (id=1 es la única fila) ─
-- No la TRUNCATE-amos porque otras partes esperan que exista la fila id=1.
update public.pricing_config
set
  margen_menudeo = 35,
  margen_medio   = 25,
  margen_mayoreo = 15,
  umbral_medio   = 6,
  umbral_mayoreo = 12,
  costo_extra    = 0
where id = 1;

commit;


-- ══════════════════════════════════════════════════════════════════
-- PASO 3 — VERIFICACIÓN POST-LIMPIEZA
-- Lo siguiente DEBE devolver TODOS los counts del catálogo en 0,
-- y >0 en user_profiles / auth_users / avatars.
-- ══════════════════════════════════════════════════════════════════
select
  (select count(*) from public.products)             as products_now,
  (select count(*) from public.variants)             as variants_now,
  (select count(*) from public.movements)            as movements_now,
  (select count(*) from public.sales)                as sales_now,
  (select count(*) from public.sale_items)           as sale_items_now,
  (select count(*) from public.payments)             as payments_now,
  (select count(*) from public.payment_proofs)       as payment_proofs_now,
  (select count(*) from public.support_tickets)      as support_tickets_now,
  (select count(*) from public.notifications)        as notifications_now,
  (select count(*) from public.inventory_cycles)     as inventory_cycles_now,
  (select count(*) from public.capital_injections)   as capital_injections_now,
  (select count(*) from public.operating_expenses)   as operating_expenses_now,
  (select count(*) from storage.objects
     where bucket_id = 'product-images' and name not like 'avatars/%'
  )                                                  as product_files_now,
  -- Estos DEBEN seguir > 0:
  (select count(*) from storage.objects
     where bucket_id = 'product-images' and name like 'avatars/%'
  )                                                  as avatars_preserved,
  (select count(*) from public.user_profiles)        as user_profiles_preserved,
  (select count(*) from auth.users)                  as auth_users_preserved;


-- ══════════════════════════════════════════════════════════════════
-- PASO 4 — OPCIONAL — Limpiar también CLIENTES no admin
-- ══════════════════════════════════════════════════════════════════
-- Por defecto NO se ejecuta. Descomenta SOLO si también quieres
-- vaciar las cuentas de los clientes registrados (deja a admins/staff).
-- ⚠️ Borra avatars de clientes + perfiles + cuentas de auth.users.
-- El cliente tendría que registrarse de nuevo.
--
-- begin;
--
-- -- 4.1 Borra avatars de clientes (carpeta avatars/{user_id}/...)
-- delete from storage.objects o
-- using public.user_profiles p
-- where o.bucket_id = 'product-images'
--   and o.name like 'avatars/' || p.id || '/%'
--   and p.role = 'client';
--
-- -- 4.2 Borra los perfiles client
-- delete from public.user_profiles where role = 'client';
--
-- -- 4.3 Borra de auth.users (cascada elimina sesiones y tokens)
-- delete from auth.users u
-- where not exists (
--   select 1 from public.user_profiles p where p.id = u.id
-- );
--
-- commit;

-- ════════════════════════════════════════════════════════════════════
-- LIMPIEZA PARA PRODUCCIÓN — Mari
-- ════════════════════════════════════════════════════════════════════
--
-- QUÉ HACE este script:
--   ✓ Borra TODOS los productos, variantes, movimientos
--   ✓ Borra TODAS las ventas, items, pagos, comprobantes, tickets de soporte
--   ✓ Borra TODAS las notificaciones
--   ✓ Borra TODOS los ciclos, inyecciones de capital, gastos
--   ✓ Borra TODAS las fotos de productos/variantes del bucket storage
--   ✓ Resetea pricing_config a defaults
--
-- QUÉ PRESERVA:
--   ✗ NO toca auth.users (sesiones de los usuarios)
--   ✗ NO toca user_profiles (Mari, admins, clientes registrados)
--   ✗ NO toca app_settings (configuración de la tienda)
--   ✗ NO toca avatars de usuario (carpeta avatars/ en storage)
--
-- CÓMO USARLO:
--   1. Lee TODO el script antes de correrlo.
--   2. Corre PASO 1 (preview) para ver cuántas filas/archivos se afectan.
--   3. Si el preview se ve bien, corre PASO 2 (cleanup) — DESTRUCTIVO.
--   4. Verifica con PASO 3 que todo quedó vacío excepto los usuarios.
--
-- ⚠️  ESTA OPERACIÓN ES IRREVERSIBLE — toma un backup antes si lo necesitas:
--      Supabase Dashboard → Project Settings → Database → Backups
-- ════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- PASO 1 — PREVIEW (no modifica nada, sólo cuenta)
-- ══════════════════════════════════════════════════════════════
select
  (select count(*) from public.products)             as products,
  (select count(*) from public.variants)             as variants,
  (select count(*) from public.movements)            as movements,
  (select count(*) from public.sale_items)           as sale_items,
  (select count(*) from public.payments)             as payments,
  (select count(*) from public.payment_proofs)       as payment_proofs,
  (select count(*) from public.sales)                as sales,
  (select count(*) from public.support_tickets)      as support_tickets,
  (select count(*) from public.notifications)        as notifications,
  (select count(*) from public.capital_injections)   as capital_injections,
  (select count(*) from public.operating_expenses)   as operating_expenses,
  (select count(*) from public.inventory_cycles)     as inventory_cycles,
  (select count(*) from storage.objects
     where bucket_id = 'product-images'
       and (name like 'products/%' or name like 'variants/%' or name like 'new/%')
  )                                                  as storage_files_to_delete,
  (select count(*) from storage.objects
     where bucket_id = 'product-images'
       and name like 'avatars/%'
  )                                                  as storage_avatars_preserved,
  (select count(*) from public.user_profiles)        as user_profiles_preserved,
  (select count(*) from auth.users)                  as auth_users_preserved;


-- ══════════════════════════════════════════════════════════════
-- PASO 2 — LIMPIEZA REAL (destructivo, no reversible)
-- ══════════════════════════════════════════════════════════════
-- Lo envolvemos en una transacción para que sea atómico: o todo borra,
-- o nada borra. Si algún DELETE falla, ROLLBACK automático.

begin;

-- ── Storage primero (archivos físicos) ─────────────────────────
-- Borra fotos de productos y variantes. Preserva avatars/.
-- Las RLS de storage.objects normalmente piden ser owner; si esto falla
-- por permisos, descomenta el bloque alternativo de abajo y córrelo
-- como SECURITY DEFINER vía función o directamente desde el Dashboard.
delete from storage.objects
where bucket_id = 'product-images'
  and (
    name like 'products/%'
    or name like 'variants/%'
    or name like 'new/%'
  );

-- ── Movimientos y datos operativos (referencias a variants) ────
-- Si los DELETE de abajo fallan por FK, descomenta TRUNCATE CASCADE al final.
delete from public.movements;
delete from public.notifications;
delete from public.payment_proofs;
delete from public.payments;
delete from public.support_tickets;
delete from public.sale_items;
delete from public.sales;

-- ── Catálogo ───────────────────────────────────────────────────
delete from public.variants;
delete from public.products;

-- ── Ciclos financieros ─────────────────────────────────────────
delete from public.capital_injections;
delete from public.operating_expenses;
delete from public.inventory_cycles;

-- ── Reset de pricing_config a defaults (id=1 es la única fila) ─
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


-- ══════════════════════════════════════════════════════════════
-- PASO 2 ALTERNATIVO — si hay errores de FK con los DELETE de arriba
-- ══════════════════════════════════════════════════════════════
-- Descomenta el bloque siguiente y correlo en lugar del PASO 2.
-- TRUNCATE ... CASCADE ignora FKs y resetea identidades.
-- NO toca tablas no listadas (user_profiles, auth.users, app_settings).

-- begin;
-- truncate table
--   public.movements,
--   public.notifications,
--   public.payment_proofs,
--   public.payments,
--   public.support_tickets,
--   public.sale_items,
--   public.sales,
--   public.variants,
--   public.products,
--   public.capital_injections,
--   public.operating_expenses,
--   public.inventory_cycles
-- restart identity cascade;
-- commit;


-- ══════════════════════════════════════════════════════════════
-- PASO 3 — VERIFICACIÓN POST-LIMPIEZA (deben estar todos en 0)
-- ══════════════════════════════════════════════════════════════
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
     where bucket_id = 'product-images'
       and (name like 'products/%' or name like 'variants/%' or name like 'new/%')
  )                                                  as product_files_now,
  -- Estos DEBEN seguir > 0:
  (select count(*) from storage.objects
     where bucket_id = 'product-images' and name like 'avatars/%'
  )                                                  as avatars_preserved,
  (select count(*) from public.user_profiles)        as user_profiles_preserved,
  (select count(*) from auth.users)                  as auth_users_preserved;


-- ══════════════════════════════════════════════════════════════
-- LIMPIEZA OPCIONAL — borrar también CLIENTES no admin
-- ══════════════════════════════════════════════════════════════
-- Por defecto, esto NO se ejecuta. Si quieres también limpiar las cuentas
-- de los clientes registrados (dejando solo a admins/staff), descomenta
-- el bloque siguiente. Ojo: borrar de auth.users elimina la sesión y la
-- cuenta para siempre; el cliente tendría que registrarse de nuevo.
--
-- begin;
--
-- -- 1) Borra avatars de clientes (carpeta avatars/{user_id}/...)
-- delete from storage.objects o
-- using public.user_profiles p
-- where o.bucket_id = 'product-images'
--   and o.name like 'avatars/' || p.id || '/%'
--   and p.role = 'client';
--
-- -- 2) Borra los perfiles client
-- delete from public.user_profiles where role = 'client';
--
-- -- 3) Borra de auth.users (cascada elimina sesiones)
-- delete from auth.users u
-- where not exists (
--   select 1 from public.user_profiles p where p.id = u.id
-- );
--
-- commit;

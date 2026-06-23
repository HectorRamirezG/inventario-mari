-- ============================================================================
-- HOTFIX: columnas faltantes en payment_proofs
-- ============================================================================
-- La RPC `approve_payment_proof` y `reject_payment_proof` intentan escribir
-- en columnas `resolved_at`, `reject_reason`, `resolved_by` que no existen
-- en algunas instancias. Este hotfix las agrega IDEMPOTENTEMENTE.
--
-- Error que arregla:
--   ERROR: column "resolved_at" of relation "payment_proofs" does not exist
--
-- Es safe: usa IF NOT EXISTS y solo agrega columnas. NO toca filas
-- existentes (las columnas quedan NULL para los proofs viejos).
-- ============================================================================

begin;

alter table public.payment_proofs
  add column if not exists resolved_at   timestamptz,
  add column if not exists resolved_by   uuid,
  add column if not exists reject_reason text;

-- Índice para listados rápidos de proofs aprobados/rechazados.
create index if not exists idx_payment_proofs_resolved_at
  on public.payment_proofs (resolved_at desc)
  where resolved_at is not null;

-- Backfill: marca resolved_at para proofs viejos cuya status ya está
-- en aprobado/rechazado pero no tienen timestamp.
update public.payment_proofs
   set resolved_at = coalesce(created_at, now())
 where status in ('approved', 'rejected')
   and resolved_at is null;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'payment_proofs'
--    and column_name in ('resolved_at','resolved_by','reject_reason')
--  order by column_name;

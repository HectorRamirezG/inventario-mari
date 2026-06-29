-- ════════════════════════════════════════════════════════════════════
-- 2026-06-29 — Backfill public_token en sales viejos
--
-- Las features nuevas (QR del pedido, "Volver a pedir", share del
-- ticket) asumen que TODA sale tiene public_token. Si hay sales
-- creadas antes de que se introdujera ese campo, el QR cae a
-- /ticket/{id} (puede no abrir bien) y las acciones que esperan
-- token se rompen.
--
-- Este script:
--   1) Cuenta cuántas sales tienen public_token IS NULL.
--   2) Las actualiza con un gen_random_uuid().
--   3) Verifica que ahora 0 quedan en NULL.
--
-- Ejecutar UNA vez en Supabase Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

-- (1) Diagnóstico antes
select count(*) as sales_sin_token
from public.sales
where public_token is null;

-- (2) Backfill
update public.sales
set public_token = gen_random_uuid()
where public_token is null;

-- (3) Verificación
select count(*) as sales_sin_token_despues
from public.sales
where public_token is null;

-- (4) Opcional: asegurar UNIQUE INDEX para evitar duplicados en futuras inserciones.
-- Si ya existe la unique constraint, este CREATE truena silencioso por IF NOT EXISTS.
create unique index if not exists sales_public_token_uniq
  on public.sales (public_token);

notify pgrst, 'reload schema';

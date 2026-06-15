-- =====================================================================
-- 0024: Migración consolidada y defensiva
-- =====================================================================
-- Asegura el estado final correcto sin importar lo que haya pasado antes.
-- Idempotente: se puede correr 1 o 100 veces, mismo resultado.
--
-- Arregla:
--  - sales: columnas shipping_amount, is_foreign_shipping, adjustment_*
--  - payment_proofs.image_url: DROP NOT NULL (para permitir efectivo)
--  - support_ticket RPCs: drop duplicados + recreate con firma única
--  - Fuerza reload del schema cache de PostgREST
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) sales: columnas que el frontend espera
-- ---------------------------------------------------------------------
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shipping_amount     numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_foreign_shipping boolean DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS adjustment_amount   numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS adjustment_reason   text;

UPDATE public.sales SET shipping_amount     = 0     WHERE shipping_amount     IS NULL;
UPDATE public.sales SET is_foreign_shipping = false WHERE is_foreign_shipping IS NULL;
UPDATE public.sales SET adjustment_amount   = 0     WHERE adjustment_amount   IS NULL;

ALTER TABLE public.sales ALTER COLUMN shipping_amount     SET DEFAULT 0;
ALTER TABLE public.sales ALTER COLUMN is_foreign_shipping SET DEFAULT false;
ALTER TABLE public.sales ALTER COLUMN adjustment_amount   SET DEFAULT 0;

-- ---------------------------------------------------------------------
-- 2) payment_proofs: image_url debe ser nullable (caso efectivo)
-- ---------------------------------------------------------------------
ALTER TABLE public.payment_proofs ALTER COLUMN image_url DROP NOT NULL;

-- ---------------------------------------------------------------------
-- 3) support_tickets RPCs: eliminar TODOS los overloads y recrear
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_support_ticket(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.create_support_ticket(text, text, text, uuid);
DROP FUNCTION IF EXISTS public.update_support_ticket_status(uuid, text);
DROP FUNCTION IF EXISTS public.update_support_ticket_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category    text,
  p_description text,
  p_image_url   text DEFAULT NULL,
  p_sale_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.support_tickets (
    sale_id, category, description, image_url, status, created_at
  )
  VALUES (
    p_sale_id, p_category, p_description, p_image_url, 'open', now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'ticket_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, uuid)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_support_ticket_status(
  p_ticket_id      uuid,
  p_status         text,
  p_admin_response text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET status      = p_status,
         resolved_at = CASE WHEN p_status IN ('resolved','closed') THEN now() ELSE resolved_at END
   WHERE id = p_ticket_id;

  -- p_admin_response es ignorado porque la tabla real no tiene esa columna
  PERFORM p_admin_response;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_support_ticket_status(uuid, text, text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Forzar reload del cache de PostgREST
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN (correr aparte, fuera del BEGIN/COMMIT, para confirmar)
-- ---------------------------------------------------------------------
-- 1) Confirmar columnas de sales:
--    SELECT column_name, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='sales'
--      AND column_name IN ('shipping_amount','is_foreign_shipping','adjustment_amount','adjustment_reason');
--
-- 2) Confirmar que image_url es nullable:
--    SELECT column_name, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='payment_proofs' AND column_name='image_url';
--
-- 3) Confirmar que hay UNA sola version de cada RPC:
--    SELECT proname, pg_get_function_identity_arguments(oid) AS args
--    FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('create_support_ticket','update_support_ticket_status');

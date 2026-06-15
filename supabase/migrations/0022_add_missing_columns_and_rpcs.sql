-- =====================================================================
-- 0022: Agregar columnas y RPCs que el frontend espera pero no existen
-- =====================================================================
-- Los errores en consola confirman que faltan:
--   - sales.shipping_amount
--   - sales.is_foreign_shipping
--   - sales.adjustment_amount, sales.adjustment_reason (por si acaso)
--   - public.create_support_ticket(...)
--   - public.update_support_ticket_status(...)
--   - tabla support_tickets (por si tampoco existe)
--
-- Todo es idempotente: usa IF NOT EXISTS / CREATE OR REPLACE.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Columnas en sales
-- ---------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS shipping_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_foreign_shipping boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS adjustment_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS adjustment_reason text;

-- Backfill nulos por si la columna ya existía como nullable
UPDATE public.sales SET shipping_amount     = 0     WHERE shipping_amount     IS NULL;
UPDATE public.sales SET is_foreign_shipping = false WHERE is_foreign_shipping IS NULL;
UPDATE public.sales SET adjustment_amount   = 0     WHERE adjustment_amount   IS NULL;

-- ---------------------------------------------------------------------
-- 2) Tabla support_tickets (si no existe)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  user_id         uuid,
  user_email      text,
  user_name       text,
  category        text NOT NULL,
  description     text NOT NULL,
  image_url       text,
  status          text NOT NULL DEFAULT 'open',
  admin_response  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_sale_id ON public.support_tickets(sale_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON public.support_tickets(created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_all ON public.support_tickets;
CREATE POLICY anon_all ON public.support_tickets
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.support_tickets TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) RPC create_support_ticket
--    Firma esperada por el frontend:
--    (p_category text, p_description text, p_image_url text, p_sale_id uuid)
-- ---------------------------------------------------------------------
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
    sale_id, category, description, image_url, status, created_at, updated_at
  )
  VALUES (
    p_sale_id, p_category, p_description, p_image_url, 'open', now(), now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'ticket_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, uuid)
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) RPC update_support_ticket_status
-- ---------------------------------------------------------------------
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
     SET status         = p_status,
         admin_response = COALESCE(p_admin_response, admin_response),
         updated_at     = now()
   WHERE id = p_ticket_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_support_ticket_status(uuid, text, text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Recargar cache de PostgREST
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

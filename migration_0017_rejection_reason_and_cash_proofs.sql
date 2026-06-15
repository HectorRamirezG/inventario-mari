-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION 0017 — rejection_reason en proofs + soporte sin foto +
--                   stock estricto (re-aplica idempotente la 0016 por si
--                   alguien olvidó correrla)
-- ════════════════════════════════════════════════════════════════════════
-- Cómo correrla:
--   1) Abre Supabase Dashboard → SQL Editor → New Query
--   2) Pega TODO este archivo y dale "Run"
--   3) Borra este archivo del repo cuando confirmes que funcionó
--
-- Contenido:
--   [A] Columna `rejection_reason` en payment_proofs + propagar a aprobador
--   [B] Permitir `image_url` NULL en payment_proofs (pagos en efectivo)
--   [C] Self-heal de support_tickets si la 0016 no se corrió
--   [D] Self-heal de triggers de stock estricto (idempotente)
--   [E] NOTIFY pgrst, 'reload schema' al final (refresca caché de Supabase)
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- [A] rejection_reason en payment_proofs
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.payment_proofs
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Actualizamos la RPC reject para guardar la razón en la propia fila
-- (además de la notificación) para que cliente + admin la vean siempre.
CREATE OR REPLACE FUNCTION public.reject_payment_proof(
  p_proof_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_customer_email text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role IN ('admin','staff')
  ) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  UPDATE public.payment_proofs
     SET status = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         rejection_reason = NULLIF(trim(coalesce(p_reason, '')), '')
   WHERE id = p_proof_id
   RETURNING sale_id, customer_email INTO v_sale_id, v_customer_email;

  -- Notificación al cliente (si tabla de notificaciones existe)
  BEGIN
    IF v_customer_email IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_email, recipient_role, type, title, body, link, metadata
      ) VALUES (
        v_customer_email,
        'client',
        'proof_rejected',
        'Comprobante no aprobado',
        coalesce(p_reason, 'Mari revisará tu comprobante. Por favor verifica el monto y el método.'),
        '/ticket/' || coalesce(
          (SELECT public_token::text FROM public.sales WHERE id = v_sale_id),
          v_sale_id::text
        ),
        jsonb_build_object('proof_id', p_proof_id, 'sale_id', v_sale_id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- silencio: si la tabla notifications no existe, no rompemos el rechazo
    NULL;
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.reject_payment_proof(uuid, text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- [B] Permitir image_url NULL en payment_proofs (pagos en efectivo)
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.payment_proofs
  ALTER COLUMN image_url DROP NOT NULL;


-- ════════════════════════════════════════════════════════════════════════
-- [C] support_tickets — self-heal por si la 0016 no se corrió
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  customer_phone text,
  category      text NOT NULL CHECK (category IN ('damaged','shipping','comment')),
  description   text,
  image_url     text,
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','resolved')),
  resolved_at   timestamptz,
  resolved_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON public.support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sale
  ON public.support_tickets(sale_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_insert_anyone ON public.support_tickets;
CREATE POLICY support_tickets_insert_anyone
  ON public.support_tickets
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS support_tickets_select_staff ON public.support_tickets;
CREATE POLICY support_tickets_select_staff
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin','staff')
    )
  );

DROP POLICY IF EXISTS support_tickets_update_staff ON public.support_tickets;
CREATE POLICY support_tickets_update_staff
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin','staff')
    )
  )
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_sale_id      uuid,
  p_category     text,
  p_description  text,
  p_image_url    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_name    text;
  v_email   text;
  v_phone   text;
BEGIN
  IF p_category NOT IN ('damaged','shipping','comment') THEN
    RAISE EXCEPTION 'Categoría inválida';
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) < 3 THEN
    RAISE EXCEPTION 'Describe brevemente tu problema';
  END IF;

  IF p_sale_id IS NOT NULL THEN
    SELECT s.customer_name, s.customer_email, s.customer_phone
      INTO v_name, v_email, v_phone
    FROM public.sales s
    WHERE s.id = p_sale_id;
  END IF;

  INSERT INTO public.support_tickets (
    sale_id, customer_name, customer_email, customer_phone,
    category, description, image_url, status
  ) VALUES (
    p_sale_id, v_name, v_email, v_phone,
    p_category, p_description, p_image_url, 'open'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_support_ticket(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid,text,text,text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_support_ticket_status(
  p_ticket_id uuid,
  p_status    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('open','in_progress','resolved') THEN
    RAISE EXCEPTION 'Estatus inválido';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.role IN ('admin','staff')
  ) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  UPDATE public.support_tickets
     SET status      = p_status,
         resolved_at = CASE WHEN p_status = 'resolved' THEN now() ELSE NULL END,
         resolved_by = CASE WHEN p_status = 'resolved' THEN auth.uid() ELSE NULL END
   WHERE id = p_ticket_id;
END $$;

GRANT EXECUTE ON FUNCTION public.update_support_ticket_status(uuid,text) TO authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- [D] Triggers de stock estricto (self-heal idempotente)
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decrement_stock_on_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.sales WHERE id = NEW.sale_id;
  IF v_status = 'cancelled' THEN RETURN NEW; END IF;
  UPDATE public.variants
     SET stock = GREATEST(0, COALESCE(stock,0) - COALESCE(NEW.qty,0))
   WHERE id = NEW.variant_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_decrement_stock_on_sale_item ON public.sale_items;
CREATE TRIGGER trg_decrement_stock_on_sale_item
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_stock_on_sale_item();

CREATE OR REPLACE FUNCTION public.restock_on_sale_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND COALESCE(OLD.status,'') <> 'cancelled' THEN
    UPDATE public.variants v
       SET stock = COALESCE(v.stock,0) + si.qty
      FROM public.sale_items si
     WHERE si.sale_id = NEW.id AND si.variant_id = v.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restock_on_sale_cancelled ON public.sales;
CREATE TRIGGER trg_restock_on_sale_cancelled
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.restock_on_sale_cancelled();

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- [E] Refresca cache de PostgREST (CRÍTICO tras un ALTER TABLE)
-- ════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

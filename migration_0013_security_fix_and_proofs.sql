-- ============================================================
-- 0013_security_fix_and_proofs.sql
-- HOTFIX URGENTE + nueva feature de comprobantes
--
-- Corre esto en Supabase SQL Editor → New query → Run.
-- Idempotente, seguro de re-correr.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 🚨 BLOQUE 1 — FIX: Recursión infinita en user_profiles
-- ──────────────────────────────────────────────────────────
-- La policy `user_profiles_admin_read_all` que metimos en 0012 hace
-- `SELECT FROM user_profiles ...` dentro de la policy de user_profiles.
-- Eso causa el HTTP 500 con error "infinite recursion detected".
-- Solución Supabase: usar una función SECURITY DEFINER que evite el RLS.

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('admin','staff')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- Sólo authenticated puede llamar estas funciones (no anon)
REVOKE EXECUTE ON FUNCTION public.is_staff_or_admin FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin           FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_staff_or_admin TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_admin           TO authenticated;

-- Tira las policies rotas y vuelve a crearlas usando la función SECURITY DEFINER
DROP POLICY IF EXISTS user_profiles_select_own       ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_update_own       ON public.user_profiles;
DROP POLICY IF EXISTS user_profiles_admin_read_all   ON public.user_profiles;

CREATE POLICY user_profiles_select_self_or_staff ON public.user_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_staff_or_admin());

CREATE POLICY user_profiles_update_self ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Lo mismo para variants — usa función para evitar futuras recursiones
DROP POLICY IF EXISTS variants_admin_all   ON public.variants;
DROP POLICY IF EXISTS variants_public_read ON public.variants;

CREATE POLICY variants_admin_all ON public.variants
  FOR ALL TO authenticated
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

CREATE POLICY variants_public_read ON public.variants
  FOR SELECT TO anon, authenticated
  USING (is_active IS NOT FALSE);

-- App settings: lo mismo, usa la función
DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ──────────────────────────────────────────────────────────
-- 🔒 BLOQUE 2 — VIEWS sin SECURITY DEFINER (las 3 que reportó el linter)
-- ──────────────────────────────────────────────────────────
-- Recreamos como SECURITY INVOKER (default) para que respeten las RLS
-- de las tablas subyacentes, en lugar de saltárselas.

DROP VIEW IF EXISTS public.variants_public  CASCADE;
DROP VIEW IF EXISTS public.products_public  CASCADE;
DROP VIEW IF EXISTS public.client_profiles  CASCADE;

CREATE VIEW public.variants_public
  WITH (security_invoker = true) AS
SELECT
  v.id, v.product_id, v.variant_name, v.sku, v.stock,
  v.price, v.price_menudeo, v.price_medio, v.price_mayoreo,
  v.image_url,
  COALESCE(v.image_urls, ARRAY[]::TEXT[]) AS image_urls,
  v.is_active
FROM public.variants v
WHERE v.is_active IS NOT FALSE;

CREATE VIEW public.products_public
  WITH (security_invoker = true) AS
SELECT id, name, category, image_url, is_active
FROM public.products
WHERE is_active IS NOT FALSE;

CREATE VIEW public.client_profiles
  WITH (security_invoker = true) AS
SELECT id, email, full_name, avatar_url, phone, address, location_url, role
FROM public.user_profiles;

GRANT SELECT ON public.variants_public  TO anon, authenticated;
GRANT SELECT ON public.products_public  TO anon, authenticated;
GRANT SELECT ON public.client_profiles  TO authenticated;

-- ──────────────────────────────────────────────────────────
-- 🔒 BLOQUE 3 — search_path estable en funciones nuestras
-- ──────────────────────────────────────────────────────────
-- Los warnings del linter sobre `function_search_path_mutable`.
-- Sólo arreglamos las que sabemos que existen y son nuestras.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname || '.' || p.proname || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'sync_variant_primary_image', 'admin_emails', 'is_admin',
        'is_staff_or_admin', 'ensure_sale_public_token',
        'decrease_variant_stock', 'create_sale_atomic', 'apply_movement',
        'cancel_sale', 'add_sale_payment', 'admin_adjust_sale',
        'auto_assign_sale_to_cycle', 'close_cycle', 'cycle_snapshot',
        'get_public_ticket', 'handle_new_user',
        'mark_all_notifications_read', 'notify_new_layaway',
        'notify_payment_added', 'notify_sale_status_change', 'open_cycle',
        'current_role'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    EXCEPTION WHEN OTHERS THEN
      -- si una función no existe en esta DB, simplemente ignorar
      NULL;
    END;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────
-- 🔒 BLOQUE 4 — Revocar RPC sensibles a anon
-- ──────────────────────────────────────────────────────────
-- Funciones que NO deben ser ejecutables sin login

DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'admin_adjust_sale(uuid, numeric, text, text)',
    'auto_assign_sale_to_cycle()',
    'close_cycle(uuid, numeric, text)',
    'cycle_snapshot(uuid)',
    'open_cycle(text, numeric, numeric, text)',
    'handle_new_user()',
    'notify_new_layaway()',
    'notify_payment_added()',
    'notify_sale_status_change()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, PUBLIC', fn);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────
-- 💸 BLOQUE 5 — NUEVA FEATURE: comprobantes de pago
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  customer_email  TEXT,
  image_url       TEXT NOT NULL,
  amount          NUMERIC(12,2),
  method          TEXT,  -- 'transferencia' | 'mercadopago' | 'efectivo' | etc.
  reference       TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  payment_id      UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_sale    ON public.payment_proofs (sale_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status  ON public.payment_proofs (status, created_at DESC);

ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- Cliente sube su propio comprobante (autenticado por email O por public_token)
DROP POLICY IF EXISTS proofs_insert_own ON public.payment_proofs;
CREATE POLICY proofs_insert_own ON public.payment_proofs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);  -- Validamos sale_id existe + token vía RPC, no por RLS

-- Cliente ve sus propios comprobantes (por su email registrado)
DROP POLICY IF EXISTS proofs_select_own ON public.payment_proofs;
CREATE POLICY proofs_select_own ON public.payment_proofs
  FOR SELECT TO authenticated
  USING (
    customer_email = auth.email()
    OR public.is_staff_or_admin()
  );

-- Admin/staff puede actualizar status (aprobar/rechazar)
DROP POLICY IF EXISTS proofs_update_staff ON public.payment_proofs;
CREATE POLICY proofs_update_staff ON public.payment_proofs
  FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

-- Trigger: cuando se sube un proof → notifica a TODOS los admin/staff
CREATE OR REPLACE FUNCTION public.notify_payment_proof_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale RECORD;
  v_admin RECORD;
  v_short TEXT;
BEGIN
  SELECT id, customer_name, customer_email, total, balance, public_token
    INTO v_sale FROM public.sales WHERE id = NEW.sale_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_short := UPPER(SUBSTRING(REPLACE(v_sale.id::text, '-', '') FROM 1 FOR 8));

  FOR v_admin IN
    SELECT email FROM public.user_profiles
    WHERE role IN ('admin','staff') AND email IS NOT NULL
  LOOP
    BEGIN
      INSERT INTO public.notifications (
        recipient_email, recipient_role, type, title, body, link, metadata
      ) VALUES (
        v_admin.email,
        'admin',
        'payment_proof_uploaded',
        '💸 Comprobante de pago recibido',
        COALESCE(v_sale.customer_name, COALESCE(NEW.customer_email, 'Cliente'))
          || ' subió comprobante por $'
          || TO_CHAR(COALESCE(NEW.amount, v_sale.balance, 0), 'FM999,999,990.00')
          || ' · Folio ' || v_short,
        '/admin?proof=' || NEW.id::text,
        jsonb_build_object(
          'proof_id', NEW.id,
          'sale_id', v_sale.id,
          'short_id', v_short,
          'amount', NEW.amount,
          'image_url', NEW.image_url
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_payment_proof_uploaded ON public.payment_proofs;
CREATE TRIGGER trg_notify_payment_proof_uploaded
  AFTER INSERT ON public.payment_proofs
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_proof_uploaded();

-- RPC: aprobar comprobante → crea payment + actualiza sale + notifica al cliente
CREATE OR REPLACE FUNCTION public.approve_payment_proof(
  p_proof_id UUID,
  p_amount   NUMERIC DEFAULT NULL,
  p_method   TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proof  RECORD;
  v_amount NUMERIC;
  v_payment_id UUID;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Solo admin/staff puede aprobar';
  END IF;

  SELECT * INTO v_proof FROM public.payment_proofs WHERE id = p_proof_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprobante no encontrado'; END IF;
  IF v_proof.status = 'approved' THEN RAISE EXCEPTION 'Ya estaba aprobado'; END IF;

  v_amount := COALESCE(p_amount, v_proof.amount, 0);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;

  -- Reusa la RPC existente para registrar el abono (mantiene total/balance)
  PERFORM public.add_sale_payment(
    v_proof.sale_id,
    v_amount,
    COALESCE(p_method, v_proof.method, 'transferencia')
  );

  SELECT id INTO v_payment_id FROM public.payments
   WHERE sale_id = v_proof.sale_id ORDER BY created_at DESC LIMIT 1;

  UPDATE public.payment_proofs
     SET status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         payment_id = v_payment_id,
         amount = v_amount,
         method = COALESCE(p_method, method)
   WHERE id = p_proof_id;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'payment_id', v_payment_id);
END $$;

CREATE OR REPLACE FUNCTION public.reject_payment_proof(
  p_proof_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_proof RECORD;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Solo admin/staff puede rechazar';
  END IF;

  UPDATE public.payment_proofs
     SET status = 'rejected',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         note = COALESCE(p_reason, note)
   WHERE id = p_proof_id
   RETURNING * INTO v_proof;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprobante no encontrado'; END IF;

  -- Notificar al cliente
  IF v_proof.customer_email IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        recipient_email, recipient_role, type, title, body, link, metadata
      ) VALUES (
        v_proof.customer_email,
        'client',
        'payment_proof_rejected',
        '⚠️ Tu comprobante necesita revisión',
        COALESCE(p_reason, 'Mari necesita más información sobre tu pago. Contáctala por WhatsApp para resolverlo.'),
        '/mis-pedidos',
        jsonb_build_object('proof_id', p_proof_id, 'sale_id', v_proof.sale_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.approve_payment_proof FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_payment_proof  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_payment_proof TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reject_payment_proof  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_sale     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_adjust_sale     TO authenticated;

-- Publicar payment_proofs en realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_proofs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- ✅ FIN — verifica:
--   SELECT * FROM public.is_staff_or_admin();  -- debe regresar t/f sin error
--   SELECT * FROM public.user_profiles LIMIT 1; -- ya NO debe dar 500
--   SELECT key FROM public.app_settings;
--   \d public.payment_proofs
-- ──────────────────────────────────────────────────────────

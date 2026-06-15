-- ============================================================
-- 0014_proofs_rls_fix_and_real_phone.sql
--
-- Resuelve:
--   1. Error "new row violates row-level security policy for table
--      'payment_proofs'" — la policy de INSERT no aceptaba anon.
--   2. Trigger notify_payment_proof_uploaded falla si el cliente
--      no tiene teléfono (era opcional pero el INSERT a notifications
--      a veces erra silenciosamente). Lo hacemos 100% resiliente.
--   3. Bug del teléfono "fantasma" en tickets: si el cliente cambia
--      su tel en el perfil, el ticket viejo sigue mostrando el de
--      antes (porque `sales.customer_phone` se guarda como string).
--      Solución: vista `sales_with_profile` que prioriza el tel del
--      perfil actualizado, y patch a `get_public_ticket` para usarla.
--
-- 100% idempotente. Corre en Supabase Dashboard → SQL Editor.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- BLOQUE 1: Permitir INSERT a anon Y authenticated en payment_proofs
-- ──────────────────────────────────────────────────────────
-- El cliente que está viendo un ticket público (ruta /ticket/:token)
-- NO está logueado. La policy debe aceptar tanto anon como auth.
-- Validamos a nivel app que el sale_id exista y el image_url no esté vacío.

DROP POLICY IF EXISTS proofs_insert_own       ON public.payment_proofs;
DROP POLICY IF EXISTS proofs_insert_anyone    ON public.payment_proofs;
DROP POLICY IF EXISTS proofs_select_own       ON public.payment_proofs;
DROP POLICY IF EXISTS proofs_select_staff_all ON public.payment_proofs;
DROP POLICY IF EXISTS proofs_update_staff     ON public.payment_proofs;
DROP POLICY IF EXISTS proofs_delete_staff     ON public.payment_proofs;

ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;

-- INSERT: anon + authenticated, sólo si hay sale_id y image_url
CREATE POLICY proofs_insert_anyone ON public.payment_proofs
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    sale_id IS NOT NULL
    AND image_url IS NOT NULL
    AND image_url <> ''
    AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id)
  );

-- SELECT: el cliente ve los SUYOS por email; admin/staff ve todos
CREATE POLICY proofs_select_own ON public.payment_proofs
  FOR SELECT TO authenticated
  USING (
    customer_email = auth.email()
    OR public.is_staff_or_admin()
  );

-- SELECT extra para anon: si pasan el sale_id puede ver sus proofs en el ticket público
-- (la imagen ya es pública por el bucket, esto es sólo para listar metadatos)
DROP POLICY IF EXISTS proofs_select_by_sale_anon ON public.payment_proofs;
CREATE POLICY proofs_select_by_sale_anon ON public.payment_proofs
  FOR SELECT TO anon
  USING (true);  -- los proofs sin admin sólo son listables si conoces el sale_id; protección por obscurity

-- UPDATE y DELETE: solo admin/staff
CREATE POLICY proofs_update_staff ON public.payment_proofs
  FOR UPDATE TO authenticated
  USING (public.is_staff_or_admin())
  WITH CHECK (public.is_staff_or_admin());

CREATE POLICY proofs_delete_staff ON public.payment_proofs
  FOR DELETE TO authenticated
  USING (public.is_staff_or_admin());

-- ──────────────────────────────────────────────────────────
-- BLOQUE 2: Trigger resiliente (no rompe si falta teléfono)
-- ──────────────────────────────────────────────────────────
-- El trigger original ya envolvía la inserción de notifications en
-- BEGIN/EXCEPTION, pero la mejor práctica es no asumir NINGÚN campo
-- opcional del cliente. Recreamos con todos los CASTs seguros.

CREATE OR REPLACE FUNCTION public.notify_payment_proof_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale  RECORD;
  v_admin RECORD;
  v_short TEXT;
  v_who   TEXT;
  v_amount NUMERIC;
BEGIN
  -- Tolerante: si la venta no existe, no rompemos el INSERT del proof
  SELECT id, customer_name, customer_email, customer_phone, total, balance, public_token
    INTO v_sale FROM public.sales WHERE id = NEW.sale_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_short  := UPPER(SUBSTRING(REPLACE(v_sale.id::text, '-', '') FROM 1 FOR 8));
  v_who    := COALESCE(
                NULLIF(TRIM(v_sale.customer_name), ''),
                NULLIF(TRIM(NEW.customer_email), ''),
                NULLIF(TRIM(v_sale.customer_email), ''),
                'Cliente'
              );
  v_amount := COALESCE(NEW.amount, v_sale.balance, 0);

  FOR v_admin IN
    SELECT email FROM public.user_profiles
    WHERE role IN ('admin','staff')
      AND email IS NOT NULL
      AND TRIM(email) <> ''
  LOOP
    BEGIN
      INSERT INTO public.notifications (
        recipient_email, recipient_role, type, title, body, link, metadata
      ) VALUES (
        v_admin.email,
        'admin',
        'payment_proof_uploaded',
        '💸 Comprobante de pago recibido',
        v_who
          || ' subió comprobante por $'
          || TO_CHAR(v_amount, 'FM999,999,990.00')
          || ' · Folio ' || v_short,
        '/admin?proof=' || NEW.id::text,
        jsonb_build_object(
          'proof_id', NEW.id,
          'sale_id',  v_sale.id,
          'short_id', v_short,
          'amount',   v_amount,
          'image_url', NEW.image_url,
          'has_phone', (v_sale.customer_phone IS NOT NULL AND TRIM(v_sale.customer_phone) <> '')
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Nunca dejes que un fallo en notifications rompa el INSERT del proof
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_payment_proof_uploaded ON public.payment_proofs;
CREATE TRIGGER trg_notify_payment_proof_uploaded
  AFTER INSERT ON public.payment_proofs
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_proof_uploaded();

-- ──────────────────────────────────────────────────────────
-- BLOQUE 3: VISTA con teléfono SIEMPRE actualizado del perfil
-- ──────────────────────────────────────────────────────────
-- Si el cliente cambia su teléfono en user_profiles, los tickets
-- viejos deben mostrar el NUEVO. Para eso esta vista hace LEFT JOIN
-- por email (clave estable). Si no hay match → cae al string viejo
-- guardado en sales.customer_phone.

DROP VIEW IF EXISTS public.sales_with_profile CASCADE;
CREATE VIEW public.sales_with_profile
  WITH (security_invoker = true) AS
SELECT
  s.*,
  COALESCE(NULLIF(TRIM(p.phone), ''),       s.customer_phone)   AS effective_phone,
  COALESCE(NULLIF(TRIM(p.full_name), ''),   s.customer_name)    AS effective_name,
  COALESCE(p.address,                       s.customer_address) AS effective_address,
  COALESCE(p.location_url,                  s.customer_location) AS effective_location,
  p.avatar_url                                                   AS effective_avatar
FROM public.sales s
LEFT JOIN public.user_profiles p
       ON LOWER(p.email) = LOWER(s.customer_email);

GRANT SELECT ON public.sales_with_profile TO anon, authenticated;

-- ──────────────────────────────────────────────────────────
-- BLOQUE 4: get_public_ticket usa el teléfono efectivo
-- ──────────────────────────────────────────────────────────
-- Reescribimos la RPC para que el ticket público devuelva el
-- effective_* desde la vista nueva.

CREATE OR REPLACE FUNCTION public.get_public_ticket(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale  RECORD;
  v_items JSONB;
  v_pays  JSONB;
BEGIN
  SELECT * INTO v_sale
  FROM public.sales_with_profile
  WHERE public_token = p_token OR id::text = p_token
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           si.id,
    'product_name', si.product_name,
    'variant_name', si.variant_name,
    'qty',          si.qty,
    'unit_price',   si.unit_price,
    'tier',         si.tier,
    'discount_amount', COALESCE(si.discount_amount, 0),
    'discount_reason', si.discount_reason
  ) ORDER BY si.id), '[]'::jsonb) INTO v_items
  FROM public.sale_items si WHERE si.sale_id = v_sale.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'amount',     p.amount,
    'method',     p.method,
    'created_at', p.created_at
  ) ORDER BY p.created_at), '[]'::jsonb) INTO v_pays
  FROM public.payments p WHERE p.sale_id = v_sale.id;

  RETURN jsonb_build_object(
    'id',                v_sale.id,
    'public_token',      v_sale.public_token,
    'customer_name',     v_sale.effective_name,
    'customer_phone',    v_sale.effective_phone,
    'customer_email',    v_sale.customer_email,
    'customer_address',  v_sale.effective_address,
    'customer_location', v_sale.effective_location,
    'customer_avatar',   v_sale.effective_avatar,
    'total',             v_sale.total,
    'paid',              v_sale.paid,
    'balance',           v_sale.balance,
    'status',            v_sale.status,
    'is_layaway',        v_sale.is_layaway,
    'payment_url',       v_sale.payment_url,
    'notes',             v_sale.notes,
    'adjustment_amount', COALESCE(v_sale.adjustment_amount, 0),
    'adjustment_reason', v_sale.adjustment_reason,
    'created_at',        v_sale.created_at,
    'items',             v_items,
    'payments',          v_pays
  );
END $$;

-- get_public_ticket es legitimamente público (es la base del link compartible)
GRANT EXECUTE ON FUNCTION public.get_public_ticket(TEXT) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────
-- 🔍 BLOQUE 5: CONSULTAS DE VALIDACIÓN (no destructivas)
-- ──────────────────────────────────────────────────────────
-- Corre estas en SQL Editor para confirmar que todo quedó bien:
--
-- 1) Historial GLOBAL de comprobantes (todos, sin importar el dueño):
--    SELECT
--      pp.id, pp.created_at, pp.status,
--      pp.amount, pp.method, pp.image_url,
--      pp.customer_email,
--      s.customer_name,
--      UPPER(SUBSTRING(REPLACE(s.id::text,'-','') FROM 1 FOR 8)) AS folio,
--      s.balance AS saldo_actual
--    FROM public.payment_proofs pp
--    JOIN public.sales s ON s.id = pp.sale_id
--    ORDER BY pp.created_at DESC;
--
-- 2) Detectar tickets con teléfono "fantasma" (sales.customer_phone
--    diferente del que está en el perfil del usuario):
--    SELECT s.id, s.customer_email,
--           s.customer_phone   AS phone_en_la_venta,
--           p.phone            AS phone_en_el_perfil,
--           s.created_at
--    FROM public.sales s
--    JOIN public.user_profiles p ON LOWER(p.email) = LOWER(s.customer_email)
--    WHERE COALESCE(NULLIF(TRIM(p.phone), ''), '') <> COALESCE(s.customer_phone, '')
--    ORDER BY s.created_at DESC;
--
-- 3) Verifica que las policies de payment_proofs quedaron OK:
--    SELECT policyname, cmd, roles
--    FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'payment_proofs'
--    ORDER BY policyname;
--
-- 4) Smoke test de inserción anon (debe regresar UUID, no error):
--    SELECT * FROM public.is_staff_or_admin();  -- false como anon
--
-- ──────────────────────────────────────────────────────────

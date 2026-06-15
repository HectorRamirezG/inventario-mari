-- ============================================================
-- 0015_shipping_and_signed_adjustments.sql
--
-- - Agrega shipping_amount + is_foreign_shipping a sales
-- - admin_adjust_sale acepta valores NEGATIVOS (cargos extra)
-- - Defaults nuevos en app_settings: shipping + datos bancarios
--
-- Idempotente. Corre en Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS shipping_amount     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_foreign_shipping BOOLEAN       DEFAULT FALSE;

-- Defaults de envío y cuenta bancaria (modificables desde Settings)
INSERT INTO public.app_settings (key, value)
VALUES (
  'shipping_config',
  '{"foreign_cost": 250, "free_from": 2800, "local_cost": 0}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES (
  'bank_account',
  '{"bank": "", "holder": "", "clabe": "", "card": "", "notes": ""}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- admin_adjust_sale: ahora acepta NEGATIVOS (cargos)
-- - p_adjustment > 0  → descuento (resta del total)
-- - p_adjustment < 0  → cargo extra (suma al total)
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_adjust_sale(
  p_sale_id    UUID,
  p_adjustment NUMERIC,          -- + = descuento, - = cargo extra
  p_reason     TEXT,
  p_force_tier TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale       RECORD;
  v_old_total  NUMERIC;
  v_new_total  NUMERIC;
  v_subtotal   NUMERIC;
  v_shipping   NUMERIC;
  v_savings    NUMERIC;
BEGIN
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'Solo admin o staff puede ajustar tickets';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;

  v_old_total := COALESCE(v_sale.total, 0);

  -- Si fuerzan tier, recalcula precios unitarios desde variants
  IF p_force_tier IS NOT NULL AND p_force_tier IN ('menudeo','medio','mayoreo') THEN
    UPDATE public.sale_items si
    SET unit_price = COALESCE(
          CASE p_force_tier
            WHEN 'menudeo' THEN v.price_menudeo
            WHEN 'medio'   THEN v.price_medio
            WHEN 'mayoreo' THEN v.price_mayoreo
          END,
          si.unit_price
        ),
        tier = p_force_tier
    FROM public.variants v
    WHERE si.sale_id = p_sale_id AND si.variant_id = v.id;
  END IF;

  -- Guarda el ajuste tal cual (positivo = descuento, negativo = cargo)
  UPDATE public.sales
  SET adjustment_amount = COALESCE(p_adjustment, 0),
      adjustment_reason = NULLIF(TRIM(COALESCE(p_reason, '')), '')
  WHERE id = p_sale_id;

  -- Subtotal de items (sin descuento ni envío)
  SELECT COALESCE(SUM(si.qty * si.unit_price - COALESCE(si.discount_amount, 0)), 0)
    INTO v_subtotal
  FROM public.sale_items si WHERE si.sale_id = p_sale_id;

  v_shipping := COALESCE(v_sale.shipping_amount, 0);

  -- TOTAL = subtotal + envío - ajuste (ajuste + descuenta, - cobra)
  v_new_total := GREATEST(0, v_subtotal + v_shipping - COALESCE(p_adjustment, 0));

  UPDATE public.sales
  SET total   = v_new_total,
      balance = GREATEST(0, v_new_total - COALESCE(paid, 0))
  WHERE id = p_sale_id;

  v_savings := v_old_total - v_new_total;  -- positivo = el cliente ahorra

  -- Notificación al cliente (sólo si tiene email)
  IF v_sale.customer_email IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        recipient_email, recipient_role, type, title, body, link, metadata
      ) VALUES (
        v_sale.customer_email,
        'client',
        'price_adjusted',
        CASE WHEN v_savings >= 0
             THEN '💖 ¡Ajuste en tu pedido!'
             ELSE '📦 Cargo adicional en tu pedido' END,
        COALESCE(NULLIF(TRIM(p_reason), ''),
                 CASE WHEN v_savings >= 0 THEN 'Descuento aplicado'
                                          ELSE 'Cargo extra agregado' END) ||
          ' · Total ahora: $' || TO_CHAR(v_new_total, 'FM999,999,990.00') ||
          ' (antes $' || TO_CHAR(v_old_total, 'FM999,999,990.00') || ')',
        '/mis-pedidos',
        jsonb_build_object(
          'sale_id',   p_sale_id,
          'old_total', v_old_total,
          'new_total', v_new_total,
          'savings',   v_savings
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'sale_id',   p_sale_id,
    'old_total', v_old_total,
    'new_total', v_new_total,
    'savings',   v_savings
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_sale FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_adjust_sale TO authenticated;

-- ──────────────────────────────────────────────────────────
-- get_public_ticket ahora expone shipping_amount + is_foreign_shipping
-- ──────────────────────────────────────────────────────────

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
    'id',              si.id,
    'product_name',    si.product_name,
    'variant_name',    si.variant_name,
    'qty',             si.qty,
    'unit_price',      si.unit_price,
    'tier',            si.tier,
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
    'id',                  v_sale.id,
    'public_token',        v_sale.public_token,
    'customer_name',       v_sale.effective_name,
    'customer_phone',      v_sale.effective_phone,
    'customer_email',      v_sale.customer_email,
    'customer_address',    v_sale.effective_address,
    'customer_location',   v_sale.effective_location,
    'customer_avatar',     v_sale.effective_avatar,
    'total',               v_sale.total,
    'paid',                v_sale.paid,
    'balance',             v_sale.balance,
    'status',              v_sale.status,
    'is_layaway',          v_sale.is_layaway,
    'payment_url',         v_sale.payment_url,
    'notes',               v_sale.notes,
    'adjustment_amount',   COALESCE(v_sale.adjustment_amount, 0),
    'adjustment_reason',   v_sale.adjustment_reason,
    'shipping_amount',     COALESCE(v_sale.shipping_amount, 0),
    'is_foreign_shipping', COALESCE(v_sale.is_foreign_shipping, FALSE),
    'created_at',          v_sale.created_at,
    'items',               v_items,
    'payments',            v_pays
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_public_ticket(TEXT) TO anon, authenticated;

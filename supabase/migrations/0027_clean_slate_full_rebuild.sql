-- =====================================================================
-- 0027: RECONSTRUCCION TOTAL DEL ESQUEMA PUBLIC (CLEAN SLATE)
-- =====================================================================
-- ⚠️  ADVERTENCIA: ESTE SCRIPT BORRA TODO EL ESQUEMA `public` Y LO RECREA.
-- ⚠️  TODAS LAS FILAS DE TODAS LAS TABLAS SE PIERDEN.
-- ⚠️  Las tablas de auth.* y storage.* NO se tocan.
-- ⚠️  Los archivos subidos al bucket `product-images` NO se borran.
--
-- DESPUÉS DE EJECUTAR:
--   1. Dashboard → Project Settings → General → "Restart project"
--   2. Hard refresh del navegador (Ctrl+Shift+R)
--
-- Diseño:
--   - 18 tablas + 1 vista (sales_with_profile)
--   - RLS habilitado en todas, política `anon_all` permisiva
--   - 12 RPCs sin overloads (firma única cada una)
--   - 3 triggers: stock decrement, restock on cancel, handle_new_user
--   - Storage bucket `product-images` público
--   - Seed mínimo: 1 fila en pricing_config con defaults
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Eliminar trigger en auth.users que depende de public.handle_new_user
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ---------------------------------------------------------------------
-- 1) DROP TOTAL + RECREATE schema public
-- ---------------------------------------------------------------------
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT ALL    ON SCHEMA public TO postgres;
GRANT USAGE  ON SCHEMA public TO anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO postgres, service_role;

-- ---------------------------------------------------------------------
-- 2) Extensiones (pgcrypto para gen_random_uuid)
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 3) TABLAS (orden de dependencias)
-- ---------------------------------------------------------------------

-- 3.1 user_profiles (1:1 con auth.users)
CREATE TABLE public.user_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text,
  full_name     text,
  role          text NOT NULL DEFAULT 'client',
  avatar_url    text,
  phone         text,
  address       text,
  location_url  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_role  ON public.user_profiles(role);

-- 3.2 products
CREATE TABLE public.products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  category    text,
  cost        numeric DEFAULT 0,
  min_stock   integer DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_active ON public.products(is_active);
CREATE INDEX idx_products_name   ON public.products(name);

-- 3.3 variants
CREATE TABLE public.variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_name    text NOT NULL,
  sku             text,
  stock           integer NOT NULL DEFAULT 0,
  cost_override   numeric,
  price           numeric NOT NULL DEFAULT 0,
  price_menudeo   numeric NOT NULL DEFAULT 0,
  price_medio     numeric NOT NULL DEFAULT 0,
  price_mayoreo   numeric NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product_id ON public.variants(product_id);
CREATE INDEX idx_variants_active     ON public.variants(is_active);
CREATE INDEX idx_variants_sku        ON public.variants(sku);

-- 3.4 bundles
CREATE TABLE public.bundles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  description         text,
  price               numeric NOT NULL DEFAULT 0,
  counts_as_wholesale boolean NOT NULL DEFAULT true,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 3.5 bundle_items
CREATE TABLE public.bundle_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id   uuid NOT NULL REFERENCES public.bundles(id)  ON DELETE CASCADE,
  variant_id  uuid NOT NULL REFERENCES public.variants(id) ON DELETE RESTRICT,
  qty         integer NOT NULL DEFAULT 1
);
CREATE INDEX idx_bundle_items_bundle_id  ON public.bundle_items(bundle_id);
CREATE INDEX idx_bundle_items_variant_id ON public.bundle_items(variant_id);

-- 3.6 sales (NOTA: sin apartado_due_date — se usa is_layaway)
CREATE TABLE public.sales (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name         text,
  customer_email        text,
  customer_phone        text,
  customer_address      text,
  customer_location     text,
  public_token          text UNIQUE,
  payment_url           text,
  notes                 text,
  total                 numeric NOT NULL DEFAULT 0,
  paid                  numeric NOT NULL DEFAULT 0,
  balance               numeric NOT NULL DEFAULT 0,
  status                text    NOT NULL DEFAULT 'paid',
  is_layaway            boolean          DEFAULT false,
  adjustment_amount     numeric          DEFAULT 0,
  adjustment_reason     text,
  shipping_amount       numeric          DEFAULT 0,
  is_foreign_shipping   boolean          DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_status         ON public.sales(status);
CREATE INDEX idx_sales_is_layaway     ON public.sales(is_layaway);
CREATE INDEX idx_sales_customer_email ON public.sales(customer_email);
CREATE INDEX idx_sales_created_at     ON public.sales(created_at DESC);
CREATE INDEX idx_sales_balance        ON public.sales(balance);

-- 3.7 sale_items
CREATE TABLE public.sale_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid NOT NULL REFERENCES public.sales(id)    ON DELETE CASCADE,
  variant_id      uuid          REFERENCES public.variants(id) ON DELETE SET NULL,
  product_id      uuid          REFERENCES public.products(id) ON DELETE SET NULL,
  bundle_id       uuid          REFERENCES public.bundles(id)  ON DELETE SET NULL,
  product_name    text,
  variant_name    text,
  qty             integer NOT NULL,
  tier            text    NOT NULL DEFAULT 'menudeo',
  unit_price      numeric NOT NULL,
  cost_snapshot   numeric NOT NULL DEFAULT 0,
  profit          numeric NOT NULL DEFAULT 0,
  is_bundle       boolean NOT NULL DEFAULT false,
  discount_amount numeric          DEFAULT 0,
  discount_reason text
);
CREATE INDEX idx_sale_items_sale_id    ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_variant_id ON public.sale_items(variant_id);

-- 3.8 payments
CREATE TABLE public.payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount      numeric NOT NULL,
  method      text DEFAULT 'efectivo',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_sale_id    ON public.payments(sale_id);
CREATE INDEX idx_payments_created_at ON public.payments(created_at DESC);

-- 3.9 payment_proofs (image_url NULLABLE: el caso "efectivo" no manda imagen)
CREATE TABLE public.payment_proofs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  customer_email    text,
  image_url         text,                                  -- nullable a propósito
  amount            numeric,
  method            text,
  reference         text,
  note              text,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  rejection_reason  text,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  payment_id        uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_proofs_sale_id ON public.payment_proofs(sale_id);
CREATE INDEX idx_payment_proofs_status  ON public.payment_proofs(status);

-- 3.10 movements
CREATE TABLE public.movements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id  uuid REFERENCES public.variants(id) ON DELETE SET NULL,
  product_id  uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sale_id     uuid REFERENCES public.sales(id)    ON DELETE SET NULL,
  type        text NOT NULL,
  quantity    integer NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_variant_id ON public.movements(variant_id);
CREATE INDEX idx_movements_created_at ON public.movements(created_at DESC);

-- 3.11 notifications
CREATE TABLE public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_role  text,
  type            text NOT NULL,
  title           text NOT NULL,
  body            text,
  link            text,
  metadata        jsonb DEFAULT '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_email);
CREATE INDEX idx_notifications_unread    ON public.notifications(recipient_email) WHERE read_at IS NULL;

-- 3.12 app_settings (key/value config global)
CREATE TABLE public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.13 pricing_config (singleton id=1)
CREATE TABLE public.pricing_config (
  id              integer PRIMARY KEY DEFAULT 1,
  margen_menudeo  numeric NOT NULL DEFAULT 30,
  margen_medio    numeric NOT NULL DEFAULT 25,
  margen_mayoreo  numeric NOT NULL DEFAULT 20,
  umbral_medio    integer NOT NULL DEFAULT 6,
  umbral_mayoreo  integer NOT NULL DEFAULT 12,
  costo_extra     numeric NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

-- 3.14 pricing_operations (historial de operaciones de pricing)
CREATE TABLE public.pricing_operations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id              uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id              uuid REFERENCES public.variants(id) ON DELETE SET NULL,
  product_name_snapshot   text,
  variant_name_snapshot   text,
  quantity                integer NOT NULL DEFAULT 0,
  extra_cost              numeric NOT NULL DEFAULT 0,
  cost_unit               numeric NOT NULL DEFAULT 0,
  cost_final              numeric NOT NULL DEFAULT 0,
  price_menudeo           numeric NOT NULL DEFAULT 0,
  price_medio             numeric NOT NULL DEFAULT 0,
  price_mayoreo           numeric NOT NULL DEFAULT 0,
  price_applied           numeric NOT NULL DEFAULT 0,
  margin_percent          numeric NOT NULL DEFAULT 0,
  tier                    text    NOT NULL DEFAULT 'menudeo',
  total                   numeric NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pricing_operations_created_at ON public.pricing_operations(created_at DESC);
CREATE INDEX idx_pricing_operations_product_id ON public.pricing_operations(product_id);

-- 3.15 support_tickets
CREATE TABLE public.support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_name   text,
  customer_email  text,
  customer_phone  text,
  category        text NOT NULL,
  description     text,
  image_url       text,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','closed')),
  resolved_at     timestamptz,
  resolved_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_tickets_status     ON public.support_tickets(status);
CREATE INDEX idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

-- 3.16 inventory_cycles
CREATE TABLE public.inventory_cycles (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  status                  text NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','closed')),
  started_at              timestamptz NOT NULL DEFAULT now(),
  closed_at               timestamptz,
  opening_inventory_cost  numeric NOT NULL DEFAULT 0,
  new_lot_cost            numeric NOT NULL DEFAULT 0,
  closing_inventory_cost  numeric,
  total_revenue           numeric,
  total_cogs              numeric,
  total_expenses          numeric,
  break_even_at           timestamptz,
  net_profit              numeric,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
-- Solo puede haber UN ciclo abierto a la vez
CREATE UNIQUE INDEX uniq_one_open_cycle ON public.inventory_cycles(status) WHERE status = 'open';

-- 3.17 capital_injections
CREATE TABLE public.capital_injections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id    uuid NOT NULL REFERENCES public.inventory_cycles(id) ON DELETE CASCADE,
  amount      numeric NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_capital_injections_cycle ON public.capital_injections(cycle_id);

-- 3.18 operating_expenses
CREATE TABLE public.operating_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id    uuid NOT NULL REFERENCES public.inventory_cycles(id) ON DELETE CASCADE,
  category    text NOT NULL,
  amount      numeric NOT NULL,
  description text,
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_operating_expenses_cycle ON public.operating_expenses(cycle_id, occurred_on DESC);

-- ---------------------------------------------------------------------
-- 4) VISTA sales_with_profile
--    Une sales con user_profiles por email (LEFT JOIN para no perder ventas).
--    Expone TODAS las columnas de sales (incluye is_foreign_shipping).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.sales_with_profile AS
SELECT
  s.*,
  COALESCE(up.phone,        s.customer_phone)    AS effective_phone,
  COALESCE(up.full_name,    s.customer_name)     AS effective_name,
  COALESCE(up.address,      s.customer_address)  AS effective_address,
  COALESCE(up.location_url, s.customer_location) AS effective_location,
  up.avatar_url                                  AS effective_avatar
FROM public.sales s
LEFT JOIN public.user_profiles up ON up.email = s.customer_email;

-- ---------------------------------------------------------------------
-- 5) HELPER FUNCTIONS (sin overloads)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('admin','staff')
  );
$$;

-- ---------------------------------------------------------------------
-- 6) TRIGGER FUNCTIONS
-- ---------------------------------------------------------------------

-- 6.1 handle_new_user: crea user_profiles cuando se registra un user en auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      NEW.email
    ),
    'client'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 6.2 decrement_stock_on_sale_item: descuenta stock al insertar sale_item
CREATE OR REPLACE FUNCTION public.decrement_stock_on_sale_item()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL AND NEW.qty > 0 THEN
    UPDATE public.variants
       SET stock = stock - NEW.qty
     WHERE id = NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 6.3 restock_on_sale_cancelled: regresa stock al cancelar venta
CREATE OR REPLACE FUNCTION public.restock_on_sale_cancelled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.variants v
       SET stock = v.stock + si.qty
      FROM public.sale_items si
     WHERE si.sale_id = NEW.id
       AND si.variant_id IS NOT NULL
       AND v.id = si.variant_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 6.4 notify_payment_proof_uploaded: avisa a admins cuando hay nuevo comprobante
CREATE OR REPLACE FUNCTION public.notify_payment_proof_uploaded()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    recipient_email, recipient_role, type, title, body, link, metadata
  )
  SELECT up.email, 'admin', 'proof_uploaded',
         'Nuevo comprobante de pago',
         'Venta ' || COALESCE(NEW.sale_id::text, ''),
         '/admin/apartados',
         jsonb_build_object('proof_id', NEW.id, 'sale_id', NEW.sale_id)
    FROM public.user_profiles up
   WHERE up.role IN ('admin','staff')
     AND up.email IS NOT NULL;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 7) TRIGGERS
-- ---------------------------------------------------------------------

-- En auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- En sale_items: descuenta stock
CREATE TRIGGER trg_decrement_stock_on_sale_item
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_stock_on_sale_item();

-- En sales: restock al cancelar
CREATE TRIGGER trg_restock_on_sale_cancelled
  AFTER UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.restock_on_sale_cancelled();

-- En payment_proofs: notifica admins
CREATE TRIGGER trg_notify_payment_proof_uploaded
  AFTER INSERT ON public.payment_proofs
  FOR EACH ROW EXECUTE FUNCTION public.notify_payment_proof_uploaded();

-- ---------------------------------------------------------------------
-- 8) RPCs (firma ÚNICA cada una, sin overloads)
-- ---------------------------------------------------------------------

-- 8.1 get_public_ticket: devuelve venta + items + payments por token público
CREATE OR REPLACE FUNCTION public.get_public_ticket(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale     public.sales%ROWTYPE;
  v_items    jsonb;
  v_payments jsonb;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE public_token = p_token;
  IF v_sale.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'product_name', product_name, 'variant_name', variant_name,
           'qty', qty, 'unit_price', unit_price, 'tier', tier, 'is_bundle', is_bundle
         )), '[]'::jsonb)
    INTO v_items
    FROM public.sale_items
   WHERE sale_id = v_sale.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'amount', amount, 'method', method, 'created_at', created_at
         ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_payments
    FROM public.payments
   WHERE sale_id = v_sale.id;

  RETURN jsonb_build_object(
    'ok',       true,
    'sale',     to_jsonb(v_sale),
    'items',    v_items,
    'payments', v_payments
  );
END;
$$;

-- 8.2 mark_all_notifications_read: marca todas las del usuario actual como leídas
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text;
  v_count integer;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_email');
  END IF;

  UPDATE public.notifications
     SET read_at = now()
   WHERE recipient_email = v_email AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

-- 8.3 admin_adjust_sale
CREATE OR REPLACE FUNCTION public.admin_adjust_sale(
  p_sale_id    uuid,
  p_adjustment numeric,
  p_reason     text,
  p_force_tier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total       numeric;
  v_paid        numeric;
  v_new_balance numeric;
  v_new_status  text;
BEGIN
  SELECT total, paid INTO v_total, v_paid
    FROM public.sales WHERE id = p_sale_id;
  IF v_total IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sale_not_found');
  END IF;

  v_new_balance := (v_total + COALESCE(p_adjustment, 0)) - v_paid;
  v_new_status  := CASE
                     WHEN v_new_balance <= 0 THEN 'paid'
                     WHEN v_paid > 0          THEN 'partial'
                     ELSE 'pending'
                   END;

  UPDATE public.sales
     SET adjustment_amount = COALESCE(p_adjustment, 0),
         adjustment_reason = p_reason,
         balance           = v_new_balance,
         status            = v_new_status
   WHERE id = p_sale_id;

  IF p_force_tier IS NOT NULL THEN
    UPDATE public.sale_items SET tier = p_force_tier WHERE sale_id = p_sale_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',          true,
    'sale_id',     p_sale_id,
    'new_balance', v_new_balance,
    'new_status',  v_new_status
  );
END;
$$;

-- 8.4 approve_payment_proof (inline INSERT payments + UPDATE sales)
CREATE OR REPLACE FUNCTION public.approve_payment_proof(
  p_proof_id uuid,
  p_amount   numeric,
  p_method   text DEFAULT 'transferencia'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id     uuid;
  v_payment_id  uuid;
  v_total       numeric;
  v_paid        numeric;
  v_new_paid    numeric;
  v_new_balance numeric;
  v_new_status  text;
BEGIN
  SELECT sale_id INTO v_sale_id FROM public.payment_proofs WHERE id = p_proof_id;
  IF v_sale_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'proof_not_found');
  END IF;

  INSERT INTO public.payments (sale_id, amount, method)
  VALUES (v_sale_id, p_amount, p_method)
  RETURNING id INTO v_payment_id;

  SELECT total, paid INTO v_total, v_paid
    FROM public.sales WHERE id = v_sale_id;

  v_new_paid    := COALESCE(v_paid, 0) + p_amount;
  v_new_balance := COALESCE(v_total, 0) - v_new_paid;
  v_new_status  := CASE
                     WHEN v_new_balance <= 0 THEN 'paid'
                     WHEN v_new_paid > 0      THEN 'partial'
                     ELSE 'pending'
                   END;

  UPDATE public.sales
     SET paid    = v_new_paid,
         balance = v_new_balance,
         status  = v_new_status
   WHERE id = v_sale_id;

  UPDATE public.payment_proofs
     SET status      = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         payment_id  = v_payment_id
   WHERE id = p_proof_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'payment_id',  v_payment_id,
    'sale_id',     v_sale_id,
    'amount',      p_amount,
    'new_balance', v_new_balance,
    'new_status',  v_new_status
  );
END;
$$;

-- 8.5 reject_payment_proof
CREATE OR REPLACE FUNCTION public.reject_payment_proof(
  p_proof_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.payment_proofs
     SET status           = 'rejected',
         rejection_reason = p_reason,
         reviewed_by      = auth.uid(),
         reviewed_at      = now()
   WHERE id = p_proof_id;
END;
$$;

-- 8.6 apply_movement
CREATE OR REPLACE FUNCTION public.apply_movement(
  p_variant_id uuid,
  p_type       text,
  p_qty        integer
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delta      integer;
  v_product_id uuid;
  v_new_stock  integer;
BEGIN
  v_delta := CASE p_type
               WHEN 'entrada' THEN  p_qty
               WHEN 'salida'  THEN -p_qty
               WHEN 'ajuste'  THEN  p_qty
               ELSE 0
             END;

  SELECT product_id INTO v_product_id FROM public.variants WHERE id = p_variant_id;

  UPDATE public.variants
     SET stock = stock + v_delta
   WHERE id = p_variant_id
   RETURNING stock INTO v_new_stock;

  INSERT INTO public.movements (variant_id, product_id, type, quantity)
  VALUES (p_variant_id, v_product_id, p_type, p_qty);

  RETURN v_new_stock;
END;
$$;

-- 8.7 decrease_variant_stock
CREATE OR REPLACE FUNCTION public.decrease_variant_stock(
  p_variant_id uuid,
  p_qty        integer
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_stock integer;
BEGIN
  UPDATE public.variants
     SET stock = stock - p_qty
   WHERE id = p_variant_id
   RETURNING stock INTO v_new_stock;
  RETURN v_new_stock;
END;
$$;

-- 8.8 create_support_ticket (firma ÚNICA según especificación del usuario)
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_sale_id     uuid,
  p_category    text,
  p_description text,
  p_image_url   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_email text;
  v_name  text;
  v_phone text;
BEGIN
  v_email := auth.jwt() ->> 'email';
  SELECT full_name, phone INTO v_name, v_phone
    FROM public.user_profiles WHERE id = auth.uid();

  INSERT INTO public.support_tickets (
    sale_id, customer_email, customer_name, customer_phone,
    category, description, image_url, status
  )
  VALUES (
    p_sale_id, v_email, v_name, v_phone,
    p_category, p_description, p_image_url, 'open'
  )
  RETURNING id INTO v_id;

  -- Notificar a los admins
  INSERT INTO public.notifications (recipient_email, recipient_role, type, title, body, link, metadata)
  SELECT up.email, 'admin', 'support_ticket',
         'Nuevo ticket: ' || p_category,
         LEFT(COALESCE(p_description,''), 140),
         '/admin/support',
         jsonb_build_object('ticket_id', v_id, 'sale_id', p_sale_id)
    FROM public.user_profiles up
   WHERE up.role IN ('admin','staff') AND up.email IS NOT NULL;

  RETURN v_id;
END;
$$;

-- 8.9 update_support_ticket_status (firma ÚNICA)
CREATE OR REPLACE FUNCTION public.update_support_ticket_status(
  p_ticket_id uuid,
  p_status    text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET status      = p_status,
         resolved_at = CASE WHEN p_status IN ('resolved','closed') THEN now() ELSE resolved_at END,
         resolved_by = CASE WHEN p_status IN ('resolved','closed') THEN auth.uid() ELSE resolved_by END
   WHERE id = p_ticket_id;
END;
$$;

-- 8.10 open_cycle
CREATE OR REPLACE FUNCTION public.open_cycle(
  p_name                   text,
  p_new_lot_cost           numeric DEFAULT 0,
  p_opening_inventory_cost numeric DEFAULT NULL,
  p_notes                  text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_opening numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventory_cycles WHERE status = 'open') THEN
    RAISE EXCEPTION 'Ya existe un ciclo abierto. Ciérralo antes de abrir otro.';
  END IF;

  IF p_opening_inventory_cost IS NULL THEN
    SELECT COALESCE(SUM(v.stock * COALESCE(v.cost_override, p.cost, 0)), 0)
      INTO v_opening
      FROM public.variants v
      JOIN public.products p ON p.id = v.product_id
     WHERE v.is_active = true;
  ELSE
    v_opening := p_opening_inventory_cost;
  END IF;

  INSERT INTO public.inventory_cycles (
    name, new_lot_cost, opening_inventory_cost, notes, status, started_at
  )
  VALUES (
    p_name, COALESCE(p_new_lot_cost, 0), v_opening, p_notes, 'open', now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 8.11 cycle_snapshot
CREATE OR REPLACE FUNCTION public.cycle_snapshot(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cycle          public.inventory_cycles%ROWTYPE;
  v_revenue        numeric := 0;
  v_cogs           numeric := 0;
  v_expenses       numeric := 0;
  v_injections     numeric := 0;
  v_inventory_cost numeric;
  v_total_invested numeric;
  v_break_even_pct numeric;
  v_break_even_at  timestamptz;
BEGIN
  SELECT * INTO v_cycle FROM public.inventory_cycles WHERE id = p_cycle_id;
  IF v_cycle.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cycle_not_found');
  END IF;

  SELECT
    COALESCE(SUM(si.unit_price * si.qty), 0),
    COALESCE(SUM(si.cost_snapshot * si.qty), 0)
  INTO v_revenue, v_cogs
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  WHERE s.created_at >= v_cycle.started_at
    AND (v_cycle.closed_at IS NULL OR s.created_at <= v_cycle.closed_at)
    AND s.status <> 'cancelled';

  SELECT COALESCE(SUM(amount), 0) INTO v_expenses
    FROM public.operating_expenses WHERE cycle_id = p_cycle_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_injections
    FROM public.capital_injections WHERE cycle_id = p_cycle_id;

  SELECT COALESCE(SUM(v.stock * COALESCE(v.cost_override, p.cost, 0)), 0)
    INTO v_inventory_cost
    FROM public.variants v
    JOIN public.products p ON p.id = v.product_id
   WHERE v.is_active = true;

  v_total_invested := v_cycle.opening_inventory_cost + v_cycle.new_lot_cost + v_expenses;
  v_break_even_pct := CASE WHEN v_total_invested > 0
                        THEN (v_revenue / v_total_invested) * 100
                        ELSE 0
                      END;

  SELECT MIN(t.created_at) INTO v_break_even_at
    FROM (
      SELECT s.created_at,
             SUM(si.unit_price * si.qty) OVER (ORDER BY s.created_at) AS acum
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
       WHERE s.created_at >= v_cycle.started_at
         AND (v_cycle.closed_at IS NULL OR s.created_at <= v_cycle.closed_at)
         AND s.status <> 'cancelled'
    ) t
   WHERE t.acum >= v_total_invested;

  RETURN jsonb_build_object(
    'ok',             true,
    'cycle_id',       p_cycle_id,
    'revenue',        v_revenue,
    'cogs',           v_cogs,
    'expenses',       v_expenses,
    'injections',     v_injections,
    'inventory_cost', v_inventory_cost,
    'total_invested', v_total_invested,
    'break_even_pct', v_break_even_pct,
    'break_even_at',  v_break_even_at,
    'net_profit',     v_revenue - v_cogs - v_expenses
  );
END;
$$;

-- 8.12 close_cycle
CREATE OR REPLACE FUNCTION public.close_cycle(
  p_cycle_id               uuid,
  p_closing_inventory_cost numeric DEFAULT NULL,
  p_open_next              text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_closing  numeric;
  v_next_id  uuid;
BEGIN
  v_snapshot := public.cycle_snapshot(p_cycle_id);
  IF (v_snapshot ->> 'ok')::boolean <> true THEN
    RETURN v_snapshot;
  END IF;

  IF p_closing_inventory_cost IS NULL THEN
    v_closing := (v_snapshot ->> 'inventory_cost')::numeric;
  ELSE
    v_closing := p_closing_inventory_cost;
  END IF;

  UPDATE public.inventory_cycles
     SET status                 = 'closed',
         closed_at              = now(),
         closing_inventory_cost = v_closing,
         total_revenue          = (v_snapshot ->> 'revenue')::numeric,
         total_cogs             = (v_snapshot ->> 'cogs')::numeric,
         total_expenses         = (v_snapshot ->> 'expenses')::numeric,
         break_even_at          = NULLIF(v_snapshot ->> 'break_even_at', '')::timestamptz,
         net_profit             = (v_snapshot ->> 'net_profit')::numeric
   WHERE id = p_cycle_id;

  IF p_open_next IS NOT NULL AND length(trim(p_open_next)) > 0 THEN
    INSERT INTO public.inventory_cycles (name, opening_inventory_cost, status, started_at)
    VALUES (p_open_next, v_closing, 'open', now())
    RETURNING id INTO v_next_id;
  END IF;

  RETURN v_snapshot
    || jsonb_build_object('next_cycle_id', v_next_id, 'closing_inventory_cost', v_closing);
END;
$$;

-- ---------------------------------------------------------------------
-- 9) RLS: enable + policy `anon_all` permisiva en todas las tablas
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'user_profiles','products','variants','bundles','bundle_items',
    'sales','sale_items','payments','payment_proofs','movements',
    'notifications','app_settings','pricing_config','pricing_operations',
    'support_tickets','inventory_cycles','capital_injections','operating_expenses'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS anon_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY anon_all ON public.%I FOR ALL USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 10) GRANTS amplios
-- ---------------------------------------------------------------------
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL     ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 11) STORAGE: bucket product-images + policies
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_anon_write"  ON storage.objects;
DROP POLICY IF EXISTS "product_images_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_anon_delete" ON storage.objects;

CREATE POLICY "product_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_anon_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "product_images_anon_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images')
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "product_images_anon_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images');

-- ---------------------------------------------------------------------
-- 12) SEED MÍNIMO
-- ---------------------------------------------------------------------
-- Singleton de pricing_config con valores por defecto
INSERT INTO public.pricing_config (id, margen_menudeo, margen_medio, margen_mayoreo, umbral_medio, umbral_mayoreo, costo_extra)
VALUES (1, 30, 25, 20, 6, 12, 0);

-- ---------------------------------------------------------------------
-- 13) Forzar reload del cache de PostgREST
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;

-- =====================================================================
-- VERIFICACIÓN POST-EJECUCIÓN (correr aparte)
-- =====================================================================
-- 1) Tablas creadas:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' ORDER BY table_name;
--
-- 2) RPCs únicas (sin overloads):
--    SELECT proname, count(*) FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--    GROUP BY proname HAVING count(*) > 1;
--    -- Debe devolver 0 filas
--
-- 3) Columnas críticas de sales:
--    SELECT column_name, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='sales'
--      AND column_name IN ('is_foreign_shipping','shipping_amount','is_layaway')
--    ORDER BY column_name;
--
-- 4) payment_proofs.image_url nullable:
--    SELECT column_name, is_nullable
--    FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='payment_proofs' AND column_name='image_url';

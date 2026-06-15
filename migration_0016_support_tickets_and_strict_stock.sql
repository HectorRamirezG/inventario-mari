-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION 0016 — Soporte (Incidencias) + Stock estricto + Categorías
-- ════════════════════════════════════════════════════════════════════════
-- Cómo correrla:
--   1) Abre Supabase Dashboard → SQL Editor → New Query
--   2) Pega TODO este archivo y dale "Run"
--   3) Borra este archivo del repo cuando confirmes que funcionó
--
-- Contenido:
--   [A] Tabla `support_tickets` + RLS + storage policy + RPC
--   [B] Trigger estricto de stock: solo descuenta en venta confirmada
--   [C] Reversión automática al cancelar (cancel_sale)
--   [D] Asegurar que `products.category` admite los valores estándar
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- [A] MÓDULO DE SOPORTE / INCIDENCIAS
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  customer_phone text,
  -- categorías cerradas (UI fija):
  --   'damaged'   → Producto dañado / incorrecto
  --   'shipping'  → Duda con envío foráneo
  --   'comment'   → Comentario o sugerencia
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

-- Cualquiera (anon o autenticado) puede crear un ticket de soporte vinculado
-- a la venta (la UI siempre pasa sale_id y datos del cliente). No exponemos
-- listado público; solo staff/admin ve la bandeja.
DROP POLICY IF EXISTS support_tickets_insert_anyone ON public.support_tickets;
CREATE POLICY support_tickets_insert_anyone
  ON public.support_tickets
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Solo staff/admin lee y actualiza (usa los helpers SECURITY DEFINER ya
-- definidos en 0014). Si tu deployment no los tiene, usa auth.uid() IS NOT NULL.
DROP POLICY IF EXISTS support_tickets_select_staff ON public.support_tickets;
CREATE POLICY support_tickets_select_staff
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin','staff')
    )
  );

DROP POLICY IF EXISTS support_tickets_update_staff ON public.support_tickets;
CREATE POLICY support_tickets_update_staff
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('admin','staff')
    )
  )
  WITH CHECK (true);

-- Storage: reutilizamos el bucket `product-images` (ya tiene policies abiertas
-- para subir imágenes desde cliente anónimo en la subcarpeta proofs/). Para
-- soporte usaremos la subcarpeta support/. No necesita policy adicional si
-- product-images ya tiene policy "INSERT para anon en cualquier subcarpeta".

-- RPC para crear ticket desde cliente público (anónimo). Recibe los datos
-- mínimos y devuelve el id creado.
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

  -- Si hay venta asociada, intentamos sacar nombre / email / phone reales
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

REVOKE ALL ON FUNCTION public.create_support_ticket(uuid,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid,text,text,text)
  TO anon, authenticated;

-- RPC para que staff cambie el estatus del ticket
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

GRANT EXECUTE ON FUNCTION public.update_support_ticket_status(uuid,text)
  TO authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- [B] STOCK ESTRICTO
-- ════════════════════════════════════════════════════════════════════════
-- Regla: el stock SOLO baja cuando un sale_item se INSERTA junto a una venta
-- que ya quedó persistida (status pendiente o pagada). Si la venta llega como
-- 'cancelled', no se toca el stock. Esto cubre los dos escenarios pedidos:
--   Escenario A: Admin cierra venta en Caja → INSERT sale_items con status='paid' → baja stock
--   Escenario B: Cliente confirma apartado  → INSERT sale_items con status='pending' → baja stock

CREATE OR REPLACE FUNCTION public.decrement_stock_on_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  -- Lee el status real de la venta
  SELECT status INTO v_status FROM public.sales WHERE id = NEW.sale_id;

  -- Si la venta está cancelada al momento del INSERT, no descontamos
  IF v_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Descontar stock con clamp en 0 para no quedar negativo
  UPDATE public.variants
     SET stock = GREATEST(0, COALESCE(stock,0) - COALESCE(NEW.qty,0))
   WHERE id = NEW.variant_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_decrement_stock_on_sale_item ON public.sale_items;
CREATE TRIGGER trg_decrement_stock_on_sale_item
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_stock_on_sale_item();


-- ════════════════════════════════════════════════════════════════════════
-- [C] REVERSIÓN AL CANCELAR LA VENTA
-- ════════════════════════════════════════════════════════════════════════
-- Cuando la venta pasa a 'cancelled' (manualmente o por vencimiento),
-- regresamos el stock de todos sus items al inventario.

CREATE OR REPLACE FUNCTION public.restock_on_sale_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo actuamos en la transición a 'cancelled' desde otro estado
  IF NEW.status = 'cancelled' AND COALESCE(OLD.status,'') <> 'cancelled' THEN
    UPDATE public.variants v
       SET stock = COALESCE(v.stock,0) + si.qty
      FROM public.sale_items si
     WHERE si.sale_id = NEW.id
       AND si.variant_id = v.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restock_on_sale_cancelled ON public.sales;
CREATE TRIGGER trg_restock_on_sale_cancelled
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.restock_on_sale_cancelled();


-- ════════════════════════════════════════════════════════════════════════
-- [D] Asegurar columna `category` en products (no hace falta enum porque
--     la UI cierra el set vía Combobox).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_products_category
  ON public.products(category);

COMMIT;

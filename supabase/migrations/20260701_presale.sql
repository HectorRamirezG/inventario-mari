-- ─────────────────────────────────────────────────────────────
-- Preventa por PRODUCTO con precio ajustable + fecha límite auto.
--
-- Nueva mecánica:
--   • El admin marca un producto como "en preventa" (toggle manual).
--   • Define un precio de preventa como DESCUENTO % o como PRECIO FIJO
--     (los dos campos existen; el service usa el que esté lleno).
--   • Opcionalmente, define una fecha límite (`presale_ends_at`).
--     Cuando llega, el service devuelve el precio normal
--     automáticamente en la próxima lectura — sin cron ni jobs.
--   • Las ventas históricas conservan el precio con el que se cobraron
--     (ya se hace: `sale_items.unit_price` es un snapshot).
--
-- Notas de diseño:
--   • Se aplica a nivel PRODUCTO (todas las variantes heredan). Si en
--     el futuro necesitamos override por variante, agregamos las mismas
--     columnas a `variants` y ajustamos el service.
--   • La preventa "vieja" (block_oversell=off + preorder_discount_percent
--     global) SIGUE funcionando como red de seguridad para stock=0.
--     Este mecanismo NUEVO es explícito, por producto, y no requiere
--     que la variante esté agotada.
--   • Cuando ambos precios (%) y (fijo) están, gana el PRECIO FIJO.
--     El UI del editor solo permite uno a la vez.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS presale_active        BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presale_price         NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS presale_discount_pct  NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS presale_ends_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS presale_note          TEXT;

-- Chequeos de sanidad para evitar valores basura desde el admin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_presale_pct_range'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_presale_pct_range
      CHECK (presale_discount_pct IS NULL OR (presale_discount_pct >= 0 AND presale_discount_pct <= 90));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_presale_price_positive'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_presale_price_positive
      CHECK (presale_price IS NULL OR presale_price >= 0);
  END IF;
END $$;

-- Index parcial: solo indexar los que están activos (mayoría estará off).
CREATE INDEX IF NOT EXISTS idx_products_presale_active
  ON public.products (presale_ends_at)
  WHERE presale_active = true;

COMMENT ON COLUMN public.products.presale_active       IS 'Toggle manual del admin: producto en preventa con precio especial.';
COMMENT ON COLUMN public.products.presale_price        IS 'Precio fijo durante preventa. Mut. exclusivo con presale_discount_pct (gana este si ambos están).';
COMMENT ON COLUMN public.products.presale_discount_pct IS 'Descuento % durante preventa (0-90). Se aplica sobre price_menudeo.';
COMMENT ON COLUMN public.products.presale_ends_at      IS 'Cuándo termina la preventa automáticamente. NULL = sin fecha límite (solo termina si el admin apaga presale_active).';
COMMENT ON COLUMN public.products.presale_note         IS 'Mensaje opcional para el cliente (ej: "Entrega estimada 15 jul").';

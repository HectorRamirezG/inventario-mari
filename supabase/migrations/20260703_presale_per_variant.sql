-- ─────────────────────────────────────────────────────────────
-- Preventa POR VARIANTE (rework).
--
-- Motivación:
--   Antes la preventa era por PRODUCTO — todas sus variantes heredaban
--   la misma configuración. Mari necesita poder marcar SÓLO ciertos
--   tonos en preventa (ej: los que aún no llegan del proveedor)
--   dejando el resto de las variantes vendiéndose normal.
--
-- Estrategia de migración:
--   1) Agregar las mismas columnas de preventa a `variants`.
--   2) Copiar los datos existentes de `products.presale_*` a TODAS
--      las variantes activas del producto (así ninguna preventa
--      preexistente se pierde).
--   3) Dejar las columnas de `products.presale_*` en DB pero ya no
--      leerlas desde la app (marcadas como deprecadas en el comentario).
--      No se borran para conservar historial y no romper otras queries.
--
-- Lógica NUEVA en la app:
--   • Preventa SOLO se activa cuando el admin marca explícitamente
--     `variants.presale_active = true`.
--   • Ya no existe la "preventa automática" cuando stock=0 y
--     block_oversell=off. Si `block_oversell=off` permite vender sin
--     stock pero a precio NORMAL (sin descuento automático).
--   • Si el admin quiere descuento en preventa, activa la preventa
--     de esa variante desde el editor.
-- ─────────────────────────────────────────────────────────────

-- 1) Nuevas columnas en variants (mismos nombres que en products).
ALTER TABLE public.variants
  ADD COLUMN IF NOT EXISTS presale_active        BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presale_price         NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS presale_discount_pct  NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS presale_ends_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS presale_note          TEXT;

-- 2) Constraints de sanidad (mismos que en products).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'variants_presale_pct_range'
  ) THEN
    ALTER TABLE public.variants
      ADD CONSTRAINT variants_presale_pct_range
      CHECK (presale_discount_pct IS NULL OR (presale_discount_pct >= 0 AND presale_discount_pct <= 90));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'variants_presale_price_positive'
  ) THEN
    ALTER TABLE public.variants
      ADD CONSTRAINT variants_presale_price_positive
      CHECK (presale_price IS NULL OR presale_price >= 0);
  END IF;
END $$;

-- 3) Index parcial: solo indexar variantes activas (mayoría estará off).
CREATE INDEX IF NOT EXISTS idx_variants_presale_active
  ON public.variants (presale_ends_at)
  WHERE presale_active = true;

-- 4) Migrar datos existentes: si un producto tenía preventa activa,
--    la copiamos a TODAS sus variantes activas. Solo aplica cuando la
--    variante NO tiene ya su propia preventa (evita sobrescribir
--    configuraciones parciales que el admin haya podido meter).
UPDATE public.variants v
SET
  presale_active       = COALESCE(v.presale_active,       p.presale_active),
  presale_price        = COALESCE(v.presale_price,        p.presale_price),
  presale_discount_pct = COALESCE(v.presale_discount_pct, p.presale_discount_pct),
  presale_ends_at      = COALESCE(v.presale_ends_at,      p.presale_ends_at),
  presale_note         = COALESCE(v.presale_note,         p.presale_note)
FROM public.products p
WHERE v.product_id = p.id
  AND COALESCE(p.presale_active, false) = true
  AND v.is_active IS DISTINCT FROM false
  AND COALESCE(v.presale_active, false) = false;

COMMENT ON COLUMN public.variants.presale_active       IS 'Toggle manual del admin (por variante): variante en preventa con precio especial.';
COMMENT ON COLUMN public.variants.presale_price        IS 'Precio fijo durante preventa. Mut. exclusivo con presale_discount_pct (gana este si ambos están).';
COMMENT ON COLUMN public.variants.presale_discount_pct IS 'Descuento % durante preventa (0-90). Se aplica sobre price_menudeo de la variante.';
COMMENT ON COLUMN public.variants.presale_ends_at      IS 'Cuándo termina la preventa automáticamente. NULL = sin fecha límite (solo termina si el admin apaga presale_active).';
COMMENT ON COLUMN public.variants.presale_note         IS 'Mensaje opcional para el cliente (ej: "Entrega estimada 15 jul").';

-- 5) DEPRECAR columnas de products.presale_*:
--    NO se borran (podrían ser leídas por queries externas o backups
--    antiguos). Solo se marcan como deprecated en el comentario.
COMMENT ON COLUMN public.products.presale_active       IS '[DEPRECATED 2026-07-01] La preventa se maneja por variante. Este campo ya no se lee desde la app.';
COMMENT ON COLUMN public.products.presale_price        IS '[DEPRECATED 2026-07-01] La preventa se maneja por variante.';
COMMENT ON COLUMN public.products.presale_discount_pct IS '[DEPRECATED 2026-07-01] La preventa se maneja por variante.';
COMMENT ON COLUMN public.products.presale_ends_at      IS '[DEPRECATED 2026-07-01] La preventa se maneja por variante.';
COMMENT ON COLUMN public.products.presale_note         IS '[DEPRECATED 2026-07-01] La preventa se maneja por variante.';

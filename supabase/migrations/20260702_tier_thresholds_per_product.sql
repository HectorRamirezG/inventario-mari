-- ─────────────────────────────────────────────────────────────
-- Umbrales de tier (menudeo / medio / mayoreo) POR PRODUCTO y
-- POR VARIANTE, con cascada:
--   variante > producto > global (app_settings.tier_thresholds)
--
-- Motivación:
--   Hoy los umbrales son un valor global único para toda la tienda.
--   Mari necesita que ciertos productos "baratos" activen mayoreo
--   con menos piezas (ej: 1/3/6) sin cambiar los umbrales para el
--   resto del catálogo (por defecto 1/6/12 o el que esté configurado
--   en app_settings.tier_thresholds).
--
-- Comportamiento cross-cart:
--   El "tier del carrito" YA NO es único. Se calcula POR LÍNEA:
--     tier(línea) = detectTier(TOTAL_PIEZAS_DEL_CARRITO, umbrales_de_la_línea)
--   Así el mayoreo cruzado se conserva pero cada producto avanza a su
--   ritmo. Ejemplo: 6 pz en el carrito:
--     - Producto A con umbrales globales (6/12) → tier "medio"
--     - Producto B con umbrales propios (3/6)   → tier "mayoreo"
--
-- Semántica de NULL:
--   NULL en variants.tier_umbral_* → hereda de products
--   NULL en products.tier_umbral_* → hereda del global
--   NUNCA se hace fallback a 0 (evita división por cero / tiers rotos).
--
-- Unificación de globales:
--   Hoy conviven DOS fuentes de umbrales globales:
--     - app_settings.tier_thresholds (JSONB) → usada por la tienda cliente
--     - pricing_config.umbral_medio / umbral_mayoreo → usada por la caja admin
--   Migramos a UNA sola fuente: app_settings.tier_thresholds.
--   pricing_config.umbral_* queda como campo legacy (no lo borramos para
--   no romper migraciones antiguas o queries externas). La app deja de
--   leerlos en el flujo de "tier del carrito".
-- ─────────────────────────────────────────────────────────────

-- 1) Columnas de override por producto
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tier_umbral_medio    INT,
  ADD COLUMN IF NOT EXISTS tier_umbral_mayoreo  INT;

-- 2) Columnas de override por variante
ALTER TABLE public.variants
  ADD COLUMN IF NOT EXISTS tier_umbral_medio    INT,
  ADD COLUMN IF NOT EXISTS tier_umbral_mayoreo  INT;

-- 3) Chequeos: si existen deben ser >=2 y mayoreo > medio.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_tier_range'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_tier_range
      CHECK (
        (tier_umbral_medio IS NULL OR tier_umbral_medio >= 2)
        AND (tier_umbral_mayoreo IS NULL OR tier_umbral_mayoreo >= 2)
        AND (
          tier_umbral_medio IS NULL
          OR tier_umbral_mayoreo IS NULL
          OR tier_umbral_mayoreo > tier_umbral_medio
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'variants_tier_range'
  ) THEN
    ALTER TABLE public.variants
      ADD CONSTRAINT variants_tier_range
      CHECK (
        (tier_umbral_medio IS NULL OR tier_umbral_medio >= 2)
        AND (tier_umbral_mayoreo IS NULL OR tier_umbral_mayoreo >= 2)
        AND (
          tier_umbral_medio IS NULL
          OR tier_umbral_mayoreo IS NULL
          OR tier_umbral_mayoreo > tier_umbral_medio
        )
      );
  END IF;
END $$;

-- 4) Migrar pricing_config.umbral_* → app_settings.tier_thresholds si
--    aún no existe (mantiene la fuente única). No sobrescribe si ya
--    hay valor en app_settings.
INSERT INTO public.app_settings (key, value, updated_at)
SELECT
  'tier_thresholds',
  jsonb_build_object(
    'medio_min_qty',   COALESCE(umbral_medio,   3),
    'mayoreo_min_qty', COALESCE(umbral_mayoreo, 6)
  ),
  NOW()
FROM public.pricing_config
WHERE id = 1
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.products.tier_umbral_medio     IS 'Override por producto: piezas mínimas para tier medio. NULL = usa el global.';
COMMENT ON COLUMN public.products.tier_umbral_mayoreo   IS 'Override por producto: piezas mínimas para tier mayoreo. NULL = usa el global.';
COMMENT ON COLUMN public.variants.tier_umbral_medio     IS 'Override por variante (gana sobre producto). NULL = hereda producto o global.';
COMMENT ON COLUMN public.variants.tier_umbral_mayoreo   IS 'Override por variante (gana sobre producto). NULL = hereda producto o global.';

-- =====================================================================
-- 0028: Agregar columnas de imagen que el frontend usa
-- =====================================================================
-- El frontend manda en INSERT/UPDATE:
--   products.image_url
--   variants.image_url
--   variants.image_urls (array de URLs)
--
-- Migración idempotente. Se puede correr múltiples veces sin problema.
-- =====================================================================

BEGIN;

-- products: una imagen principal
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text;

-- variants: imagen principal + galería
ALTER TABLE public.variants
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.variants
  ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT ARRAY[]::text[];

-- Backfill: convierte NULLs a array vacío
UPDATE public.variants SET image_urls = ARRAY[]::text[] WHERE image_urls IS NULL;

-- Forzar reload del cache de PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;

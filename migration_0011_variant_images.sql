-- ============================================================
-- 0011_variant_images.sql
-- Múltiples fotos por variante (para el carrusel Pro)
--
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Después de correr, puedes borrar este archivo del repo.
-- ============================================================

-- 1) Nueva columna: array de URLs públicas
ALTER TABLE public.variants
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2) Migrar la foto antigua (image_url) al array, solo si está vacío
UPDATE public.variants
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- 3) Reconstruir la vista pública con image_urls expuesta
DROP VIEW IF EXISTS public.variants_public CASCADE;

CREATE VIEW public.variants_public AS
SELECT
  v.id,
  v.product_id,
  v.variant_name,
  v.sku,
  v.stock,
  v.price,
  v.price_menudeo,
  v.price_medio,
  v.price_mayoreo,
  v.image_url,
  COALESCE(v.image_urls, ARRAY[]::TEXT[]) AS image_urls,
  v.is_active
FROM public.variants v
WHERE v.is_active IS NOT FALSE;

-- Permisos (la vista debe ser legible por anon + autenticados)
GRANT SELECT ON public.variants_public TO anon, authenticated;

-- 4) Trigger: mantener image_url sincronizada con image_urls[1]
--    (compatibilidad hacia atrás con código que aún lee image_url)
CREATE OR REPLACE FUNCTION public.sync_variant_primary_image()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.image_urls IS NOT NULL AND array_length(NEW.image_urls, 1) >= 1 THEN
    NEW.image_url := NEW.image_urls[1];
  ELSIF (NEW.image_urls IS NULL OR array_length(NEW.image_urls, 1) IS NULL)
        AND NEW.image_url IS NOT NULL AND NEW.image_url <> '' THEN
    NEW.image_urls := ARRAY[NEW.image_url];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_variant_primary_image ON public.variants;
CREATE TRIGGER trg_sync_variant_primary_image
  BEFORE INSERT OR UPDATE OF image_url, image_urls
  ON public.variants
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_variant_primary_image();

-- 5) Listo. Verifica:
--    SELECT id, variant_name, image_url, image_urls
--      FROM public.variants
--      LIMIT 5;

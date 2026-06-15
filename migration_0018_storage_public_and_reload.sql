-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION 0018 — Bucket público de product-images + reload schema
-- ════════════════════════════════════════════════════════════════════════
-- Cómo correrla:
--   1) Abre Supabase Dashboard → SQL Editor → New Query
--   2) Pega TODO este archivo y dale "Run"
--   3) Borra este archivo del repo cuando confirmes que funcionó
--
-- Contenido:
--   [A] Marca el bucket `product-images` como PUBLIC (si no lo está)
--   [B] Crea policies de SELECT abiertas para anon + authenticated
--   [C] Permite INSERT desde cliente (para que cliente pueda subir
--       comprobantes de pago y fotos de soporte sin login)
--   [D] NOTIFY pgrst, 'reload schema' (CRÍTICO: refresca caché de PostgREST)
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- [A] Bucket público
-- ────────────────────────────────────────────────────────────────
-- Si el bucket ya existe, lo marcamos como público; si no existe, lo
-- creamos público. Esto NO borra archivos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- ────────────────────────────────────────────────────────────────
-- [B] Policies de SELECT abiertas (cualquiera puede ver fotos)
-- ────────────────────────────────────────────────────────────────
-- Borramos versiones viejas (si existían) y recreamos limpias.
DROP POLICY IF EXISTS "Public read for product-images" ON storage.objects;
CREATE POLICY "Public read for product-images"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

-- ────────────────────────────────────────────────────────────────
-- [C] Policies de INSERT/UPDATE para subir comprobantes y fotos
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can upload to product-images" ON storage.objects;
CREATE POLICY "Anyone can upload to product-images"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Staff can update product-images" ON storage.objects;
CREATE POLICY "Staff can update product-images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin','staff')
    )
  )
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Staff can delete product-images" ON storage.objects;
CREATE POLICY "Staff can delete product-images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin','staff')
    )
  );

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- [D] Refresca caché de PostgREST (CRÍTICO)
-- ────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

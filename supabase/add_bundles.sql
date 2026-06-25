-- =====================================================================
-- add_bundles.sql
-- Sistema de paquetes/kits: admin define un paquete con N "slots".
-- Cada slot acepta variantes elegibles (ej. "Labial" → cualquier color
-- de la categoría labiales). El cliente abre el paquete, elige UNA
-- variante por slot, y al final tiene un set armado con descuento opcional.
--
-- Idempotente. Corre una vez en SQL editor de Supabase.
-- =====================================================================

-- 1) Tabla principal
CREATE TABLE IF NOT EXISTS public.bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description TEXT,
  image_url TEXT,
  /**
   * Slots del paquete. Estructura:
   *   [
   *     {
   *       "label": "Labial",
   *       "qty": 1,
   *       "eligible_variant_ids": ["uuid1", "uuid2", ...]
   *     },
   *     ...
   *   ]
   * - label: nombre humano del slot (ej. "Labial", "Sombra grande").
   * - qty: cantidad pedida por el slot (default 1).
   * - eligible_variant_ids: lista de variantes que el cliente puede
   *   elegir para llenar el slot. Si está vacía, el slot es libre
   *   (acepta cualquier variante activa).
   */
  slots JSONB NOT NULL DEFAULT '[]'::jsonb,
  /** Descuento (%) aplicado sobre la suma de variantes elegidas. */
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  /** Activo = visible al cliente. Inactivo = solo admin lo ve para editar. */
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Trigger para actualizar updated_at en cada UPDATE
CREATE OR REPLACE FUNCTION public.set_bundles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bundles_updated_at_trg ON public.bundles;
CREATE TRIGGER bundles_updated_at_trg
  BEFORE UPDATE ON public.bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_bundles_updated_at();

-- 3) Índice por active para que listar paquetes públicos sea rápido
CREATE INDEX IF NOT EXISTS bundles_active_idx
  ON public.bundles(active)
  WHERE active = true;

-- 4) RLS: clientes ven solo activos; admin/staff ven todo y pueden editar
ALTER TABLE public.bundles ENABLE ROW LEVEL SECURITY;

-- Lectura pública: solo bundles activos
DROP POLICY IF EXISTS "bundles_read_active" ON public.bundles;
CREATE POLICY "bundles_read_active"
  ON public.bundles
  FOR SELECT
  USING (active = true);

-- Lectura admin/staff: todo
DROP POLICY IF EXISTS "bundles_read_admin" ON public.bundles;
CREATE POLICY "bundles_read_admin"
  ON public.bundles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'staff')
    )
  );

-- Escritura admin/staff
DROP POLICY IF EXISTS "bundles_write_admin" ON public.bundles;
CREATE POLICY "bundles_write_admin"
  ON public.bundles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'staff')
    )
  );

COMMENT ON TABLE public.bundles IS
  'Paquetes/kits que el admin define. Cada paquete tiene N slots; el cliente elige una variante por slot para armar su set. Descuento opcional sobre el total.';

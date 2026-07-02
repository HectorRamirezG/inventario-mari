-- ─────────────────────────────────────────────────────────────
-- sale_items: agregar flag `is_preorder` para preservar en el
-- historial si una línea fue vendida en preventa.
--
-- Motivación:
--   El precio de preventa ya se preserva vía `sale_items.unit_price`
--   (snapshot). Pero al mostrar el ticket / apartado no había forma
--   de saber "esta línea fue preventa" — el `tier` sigue siendo
--   menudeo/medio/mayoreo (no incluye preventa como tier propio).
--
-- Semántica:
--   • is_preorder = TRUE  → esta línea se vendió con precio de
--     preventa (mecánica explícita por variante). El descuento vive
--     congelado en unit_price. Aunque la preventa se apague después,
--     esta venta CONSERVA su precio.
--   • is_preorder = FALSE (default) → venta normal.
--
-- La app usa este flag únicamente para RENDERIZAR el badge "Preventa"
-- en TicketView / ApartadosPage. NO afecta cálculos.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sale_items.is_preorder IS
  'TRUE si esta línea se vendió con precio de preventa (variants.presale_active al momento). El precio queda congelado en unit_price.';

-- Index parcial: solo las líneas de preventa (minoría). Útil para
-- reportes tipo "cuántas piezas se han vendido en preventa este mes".
CREATE INDEX IF NOT EXISTS idx_sale_items_is_preorder
  ON public.sale_items (sale_id)
  WHERE is_preorder = true;

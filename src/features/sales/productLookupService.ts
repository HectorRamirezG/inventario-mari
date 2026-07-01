import { supabase } from "../../lib/supabase";
import { debug } from "../../lib/debug";

// IMPORTANTE: la tabla `variants` no tiene columna `cost`. El costo base
// vive en `products.cost`; cada variante puede sobreescribirlo con
// `cost_override`. El costo efectivo = cost_override ?? products.cost.
export interface ProductVariantLookup {
  id: string;
  variant_name: string;
  sku: string | null;
  stock: number;
  price: number | null;
  price_menudeo: number | null;
  price_medio: number | null;
  price_mayoreo: number | null;
  cost_override: number | null;
  product_id: string;
  // Overrides de umbrales de tier — se aplican en cascada (variante > producto > global)
  // vía resolveThresholds() en tierResolver.ts.
  tier_umbral_medio?: number | null;
  tier_umbral_mayoreo?: number | null;
  // Preventa POR VARIANTE (rework 2026-07-01). Antes vivía en products.
  presale_active?: boolean | null;
  presale_price?: number | null;
  presale_discount_pct?: number | null;
  presale_ends_at?: string | null;
  presale_note?: string | null;
  products: {
    id: string;
    name: string;
    cost: number | null;
    // Umbrales de tier del producto (override sobre global).
    tier_umbral_medio?: number | null;
    tier_umbral_mayoreo?: number | null;
  } | null;
}

const VARIANT_SELECT = `
  id,
  variant_name,
  sku,
  stock,
  price,
  price_menudeo,
  price_medio,
  price_mayoreo,
  cost_override,
  product_id,
  tier_umbral_medio,
  tier_umbral_mayoreo,
  presale_active,
  presale_price,
  presale_discount_pct,
  presale_ends_at,
  presale_note,
  products (
    id,
    name,
    cost,
    tier_umbral_medio,
    tier_umbral_mayoreo
  )
`;

export const searchVariants = async (term: string): Promise<ProductVariantLookup[]> => {
  if (!term || term.trim().length < 2) return [];

  const cleanTerm = term.trim();

  // PRIMER INTENTO: Por nombre de variante o SKU
  const { data, error } = await supabase
    .from("variants")
    .select(VARIANT_SELECT)
    .or(`variant_name.ilike.%${cleanTerm}%,sku.ilike.%${cleanTerm}%`)
    .limit(10);

  if (error) {
    debug.error("Error en búsqueda:", error.message);
    return [];
  }

  // SEGUNDO INTENTO: Si el primero no trajo nada, buscamos por nombre de producto
  if (!data || data.length === 0) {
    const { data: secondTry, error: secondError } = await supabase
      .from("variants")
      .select(VARIANT_SELECT.replace("products (", "products!inner ("))
      .ilike("products.name", `%${cleanTerm}%`)
      .limit(10);

    if (secondError) {
      debug.error("Error en búsqueda secundaria:", secondError.message);
      return [];
    }

    return (secondTry as unknown as ProductVariantLookup[]) || [];
  }

  return (data as unknown as ProductVariantLookup[]) || [];
};

export const getAllVariants = async (): Promise<ProductVariantLookup[]> => {
  const { data, error } = await supabase
    .from("variants")
    .select(VARIANT_SELECT)
    .eq("is_active", true)
    .order("variant_name", { ascending: true });

  if (error) {
    debug.error("Error cargando catálogo:", error.message);
    return [];
  }

  return (data as unknown as ProductVariantLookup[]) || [];
};
import { supabase } from "../../lib/supabase";
import type { PricingTier } from "./pricingTypes";

export async function getPricingHistory(params: {
  fromISO: string;
  type?: PricingTier | "all";
}) {
  let query = supabase
    .from("pricing_operations")
    .select(`
      *,
      products ( name ),
      variants:variant_id ( 
        price_menudeo, 
        price_medio, 
        price_mayoreo 
      )
    `) // <-- IMPORTANTE: Traer los precios de la variante
    .gte("created_at", params.fromISO)
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.type && params.type !== "all") {
    query = query.eq("tier", params.type);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error SQL:", error);
    return [];
  }

  return (data || []).map(x => ({
    ...x,
    product_name: x.product_name_snapshot || (x.products?.name) || "Producto no encontrado",
    variant_name: x.variant_name_snapshot || "Sin variante",
    
    // Mapeamos los precios de la variante para que lleguen al componente
    price_menudeo: x.variants?.price_menudeo || x.price_applied || 0,
    price_medio: x.variants?.price_medio || 0,
    price_mayoreo: x.variants?.price_mayoreo || 0,

    total: Number(x.total || 0),
    margin_percent: Number(x.margin_percent || 0),
    price_applied: Number(x.price_applied || 0),
    cost_unit: Number(x.cost_unit || 0)
  }));
}
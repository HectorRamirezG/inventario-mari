import type { PricingConfig, PricingTier } from "../pricing/pricingTypes";

/**
 * Item del carrito con todos los precios por nivel cargados desde la DB.
 * Si un nivel no tiene precio guardado, hace fallback al inmediato inferior.
 */
export interface CartItem {
  variant_id: string;
  product_id: string | null;
  name: string;
  variant_name: string;
  qty: number;
  cost: number;
  stock: number;

  // Precios disponibles por nivel
  price_menudeo: number;
  price_medio: number;
  price_mayoreo: number;

  // Precio efectivo aplicado en este momento (depende del tier global del carrito)
  price: number;
  tier: PricingTier;
}

/**
 * Devuelve el precio del nivel solicitado, con fallback hacia el nivel
 * inmediatamente inferior si el negocio no capturó ese nivel.
 *
 * Esto evita que el carrito se vaya a $0 cuando una variante sólo tiene
 * `price_menudeo` cargado.
 */
export function priceForTier(
  prices: Pick<CartItem, "price_menudeo" | "price_medio" | "price_mayoreo">,
  tier: PricingTier
): number {
  const menudeo = Number(prices.price_menudeo) || 0;
  const medio = Number(prices.price_medio) || 0;
  const mayoreo = Number(prices.price_mayoreo) || 0;

  if (tier === "mayoreo") return mayoreo || medio || menudeo;
  if (tier === "medio") return medio || menudeo;
  return menudeo;
}

/**
 * Determina el tier global del carrito en base a la SUMA TOTAL de piezas,
 * independientemente del producto. Esta es la regla de "mayoreo cruzado":
 * 7 piezas de producto A + 6 de producto B = 13 piezas → mayoreo (si umbral=12).
 */
export function detectCartTier(
  totalQty: number,
  config: Pick<PricingConfig, "umbral_medio" | "umbral_mayoreo">
): PricingTier {
  const q = Number(totalQty) || 0;
  const uMayoreo = Number(config.umbral_mayoreo) || 12;
  const uMedio = Number(config.umbral_medio) || 6;

  if (q >= uMayoreo) return "mayoreo";
  if (q >= uMedio) return "medio";
  return "menudeo";
}

/**
 * Etiqueta humana del tier (para mostrar en UI).
 */
export const TIER_LABEL: Record<PricingTier, string> = {
  menudeo: "Menudeo",
  medio: "Medio mayoreo",
  mayoreo: "Mayoreo",
};

/**
 * Cantidad faltante para alcanzar el siguiente nivel (o `null` si ya está en mayoreo).
 */
export function piecesToNextTier(
  totalQty: number,
  config: Pick<PricingConfig, "umbral_medio" | "umbral_mayoreo">
): { tier: PricingTier; missing: number } | null {
  const q = Number(totalQty) || 0;
  const uMedio = Number(config.umbral_medio) || 6;
  const uMayoreo = Number(config.umbral_mayoreo) || 12;

  if (q < uMedio) return { tier: "medio", missing: uMedio - q };
  if (q < uMayoreo) return { tier: "mayoreo", missing: uMayoreo - q };
  return null;
}

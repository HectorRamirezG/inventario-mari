// Definimos los tipos para que la configuración sea predecible
export interface PricingConfig {
  umbral_mayoreo: number;
  umbral_medio: number;
  margen_menudeo: number;
  margen_medio: number;
  margen_mayoreo: number;
}

export type PricingTier = "menudeo" | "medio" | "mayoreo";

/**
 * Determina el nivel de precio basado en la cantidad de piezas
 */
export function detectTier(qty: number, config: PricingConfig): PricingTier {
  // Aseguramos que comparamos números reales
  const q = Number(qty);
  const uMayoreo = Number(config.umbral_mayoreo);
  const uMedio = Number(config.umbral_medio);

  if (q >= uMayoreo) return "mayoreo";
  if (q >= uMedio) return "medio";
  
  return "menudeo";
}

/**
 * Calcula el precio unitario basado en el costo y el margen del Tier
 */
export function priceByTier(cost: number, tier: PricingTier, config: PricingConfig): number {
  const baseCost = Number(cost);
  
  // Mapeo de márgenes para evitar múltiples IFs
  const margins: Record<PricingTier, number> = {
    mayoreo: Number(config.margen_mayoreo),
    medio: Number(config.margen_medio),
    menudeo: Number(config.margen_menudeo)
  };

  const marginPercentage = margins[tier] || margins.menudeo;
  
  // Cálculo: Costo + Margen
  const finalPrice = baseCost * (1 + marginPercentage / 100);

  // Redondeamos al entero más cercano para facilitar el cobro en efectivo de Mari
  return Math.round(finalPrice);
}
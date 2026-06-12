import type { PricingConfig } from "./pricingTypes";

export function suggestedPrices(cost: number, cfg: PricingConfig) {
  const men = cost * (1 + cfg.margen_menudeo / 100);
  const med = cost * (1 + cfg.margen_medio / 100);
  const may = cost * (1 + cfg.margen_mayoreo / 100);
  return { men, med, may };
}

export function money(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export {};
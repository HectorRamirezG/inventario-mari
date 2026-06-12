export type PricingTier = "menudeo" | "medio" | "mayoreo";

export interface PricingConfig {
  id: 1;
  margen_menudeo: number;     // entero ej. 30
  margen_medio: number;       // entero ej. 25
  margen_mayoreo: number;     // entero ej. 20
  umbral_medio: number;       // ej. 6
  umbral_mayoreo: number;     // ej. 12
  costo_extra: number;        // MXN globales por análisis (gasto fijo)
}

export interface PricingRowDraft {
  key: string;
  productId: string | "";
  quantity: number | "";
  extraCost: number | ""; // si está vacío, usamos default config
}

export {};
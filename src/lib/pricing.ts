import type { PricingConfig, Tier } from "../types/database"

export interface PriceSet {
  menudeo: number
  medio: number
  mayoreo: number
}

/**
 * Calculadora de precios y tiers.
 * Una sola fuente de verdad para toda la app (Sales, Pricing, Bundles).
 *
 * Convenciones:
 *  - "margen" = % sobre PRECIO DE VENTA (markup sobre venta), por eso
 *     precio = costo / (1 - margen/100).  ← coherente con usePricingPage actual
 */
export class PriceCalculator {
  constructor(private readonly cfg: PricingConfig) {}

  /** Tier según cantidad TOTAL de piezas */
  tierFor(totalQty: number): Tier {
    const q = Number(totalQty) || 0
    if (q >= this.cfg.umbral_mayoreo) return "mayoreo"
    if (q >= this.cfg.umbral_medio)   return "medio"
    return "menudeo"
  }

  marginOf(tier: Tier): number {
    switch (tier) {
      case "mayoreo": return Number(this.cfg.margen_mayoreo) / 100
      case "medio":   return Number(this.cfg.margen_medio)   / 100
      case "menudeo": return Number(this.cfg.margen_menudeo) / 100
    }
  }

  /** Precio sugerido para un costo dado en un tier */
  priceFor(cost: number, tier: Tier): number {
    const m = this.marginOf(tier)
    if (m >= 1) return cost
    return Math.round(cost / (1 - m))
  }

  /** Devuelve los tres precios sugeridos */
  suggestAll(cost: number): PriceSet {
    return {
      menudeo: this.priceFor(cost, "menudeo"),
      medio:   this.priceFor(cost, "medio"),
      mayoreo: this.priceFor(cost, "mayoreo"),
    }
  }

  /** ¿Cuántas piezas faltan para subir de tier? null si ya está en mayoreo */
  nextTierGap(totalQty: number): { nextTier: Tier; missing: number } | null {
    const q = Number(totalQty) || 0
    if (q < this.cfg.umbral_medio)
      return { nextTier: "medio", missing: this.cfg.umbral_medio - q }
    if (q < this.cfg.umbral_mayoreo)
      return { nextTier: "mayoreo", missing: this.cfg.umbral_mayoreo - q }
    return null
  }
}

export const defaultPricingConfig: PricingConfig = {
  id: 1,
  margen_menudeo: 30,
  margen_medio:   25,
  margen_mayoreo: 20,
  umbral_medio:    6,
  umbral_mayoreo: 12,
  costo_extra:     0,
}

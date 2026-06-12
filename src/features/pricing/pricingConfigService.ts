import { supabase } from "../../lib/supabase"
import { defaultPricingConfig } from "../../lib/pricing"
import type { PricingConfig } from "../../types/database"

/**
 * Servicio de configuración global de precios (singleton id=1).
 * Cae a defaults seguros si no existe.
 */
export class PricingConfigService {
  async get(): Promise<PricingConfig> {
    try {
      const { data, error } = await supabase
        .from("pricing_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle()

      if (error) throw error
      const c = data ?? defaultPricingConfig

      return {
        id: 1,
        margen_menudeo: Number(c.margen_menudeo),
        margen_medio:   Number(c.margen_medio),
        margen_mayoreo: Number(c.margen_mayoreo),
        umbral_medio:   Number(c.umbral_medio),
        umbral_mayoreo: Number(c.umbral_mayoreo),
        costo_extra:    Number(c.costo_extra),
      }
    } catch (e) {
      console.error("[pricing_config] get:", e)
      return defaultPricingConfig
    }
  }

  async save(cfg: PricingConfig): Promise<void> {
    const payload = {
      id: 1,
      margen_menudeo: Number(cfg.margen_menudeo),
      margen_medio:   Number(cfg.margen_medio),
      margen_mayoreo: Number(cfg.margen_mayoreo),
      umbral_medio:   Number(cfg.umbral_medio),
      umbral_mayoreo: Number(cfg.umbral_mayoreo),
      costo_extra:    Number(cfg.costo_extra),
    }
    const { error } = await supabase
      .from("pricing_config")
      .upsert(payload, { onConflict: "id" })
    if (error) throw error
  }
}

export const pricingConfigService = new PricingConfigService()

export const getPricingConfig  = () => pricingConfigService.get()
export const savePricingConfig = (c: PricingConfig) => pricingConfigService.save(c)

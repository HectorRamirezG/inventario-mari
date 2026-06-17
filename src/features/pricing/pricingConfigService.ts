import { supabase } from "../../lib/supabase";
import type { PricingConfig } from "./pricingTypes";
import { debug } from "../../lib/debug";

/**
 * Obtiene la configuración global. 
 * Si no existe en la DB, devuelve valores por defecto para no romper el flujo.
 */
export async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const { data, error } = await supabase
      .from("pricing_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;

    // Valores por defecto si la tabla está vacía
    const config = data ?? {
      id: 1,
      margen_menudeo: 30,
      margen_medio: 25,
      margen_mayoreo: 20,
      umbral_medio: 6,
      umbral_mayoreo: 12,
      costo_extra: 0
    };

    // Forzamos Number() en todo para evitar que strings de la DB arruinen las sumas
    return {
      id: Number(config.id),
      margen_menudeo: Number(config.margen_menudeo),
      margen_medio: Number(config.margen_medio),
      margen_mayoreo: Number(config.margen_mayoreo),
      umbral_medio: Number(config.umbral_medio),
      umbral_mayoreo: Number(config.umbral_mayoreo),
      costo_extra: Number(config.costo_extra), // <-- Vital para sumarlo al costo real
    };

  } catch (e) {
    debug.error("Error crítico al cargar configuración:", e);
    // Fallback de emergencia
    return {
      id: 1,
      margen_menudeo: 30,
      margen_medio: 25,
      margen_mayoreo: 20,
      umbral_medio: 6,
      umbral_mayoreo: 12,
      costo_extra: 0
    };
  }
}

/**
 * Guarda o actualiza la configuración.
 */
export async function savePricingConfig(cfg: PricingConfig) {
  // Limpiamos el payload: aseguramos números y quitamos campos extras como created_at
  const payload = {
    id: 1, // Siempre forzamos el ID 1 para que sea una configuración única global
    margen_menudeo: Number(cfg.margen_menudeo),
    margen_medio: Number(cfg.margen_medio),
    margen_mayoreo: Number(cfg.margen_mayoreo),
    umbral_medio: Number(cfg.umbral_medio),
    umbral_mayoreo: Number(cfg.umbral_mayoreo),
    costo_extra: Number(cfg.costo_extra)
  };

  const { error } = await supabase
    .from("pricing_config")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    debug.error("Error al guardar en Supabase:", error.message);
    throw error;
  }
}
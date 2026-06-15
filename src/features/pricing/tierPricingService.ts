import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

export interface TierThresholds {
  medio_min_qty: number
  mayoreo_min_qty: number
}

export const DEFAULT_THRESHOLDS: TierThresholds = {
  medio_min_qty: 3,
  mayoreo_min_qty: 6,
}

let cache: TierThresholds | null = null
const listeners = new Set<(t: TierThresholds) => void>()

async function load(): Promise<TierThresholds> {
  if (cache) return cache
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "tier_thresholds")
      .maybeSingle()
    if (data?.value) {
      const v = data.value as any
      cache = {
        medio_min_qty: Number(v.medio_min_qty ?? DEFAULT_THRESHOLDS.medio_min_qty),
        mayoreo_min_qty: Number(
          v.mayoreo_min_qty ?? DEFAULT_THRESHOLDS.mayoreo_min_qty
        ),
      }
    } else {
      cache = { ...DEFAULT_THRESHOLDS }
    }
  } catch {
    cache = { ...DEFAULT_THRESHOLDS }
  }
  listeners.forEach((l) => l(cache!))
  return cache!
}

export async function saveTierThresholds(t: TierThresholds): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "tier_thresholds", value: t, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  if (error) throw error
  cache = { ...t }
  listeners.forEach((l) => l(cache!))
}

/** Hook reactivo a la configuración. Carga una vez y comparte caché. */
export function useTierThresholds(): TierThresholds {
  const [val, setVal] = useState<TierThresholds>(cache ?? DEFAULT_THRESHOLDS)

  useEffect(() => {
    let alive = true
    if (!cache) {
      load().then((t) => alive && setVal(t))
    } else {
      setVal(cache)
    }
    const l = (t: TierThresholds) => alive && setVal(t)
    listeners.add(l)
    return () => {
      alive = false
      listeners.delete(l)
    }
  }, [])

  return val
}

/** Calcula el tier que aplica para una cantidad total de piezas. */
export function tierForQty(
  totalQty: number,
  thresholds: TierThresholds
): "menudeo" | "medio" | "mayoreo" {
  if (totalQty >= thresholds.mayoreo_min_qty) return "mayoreo"
  if (totalQty >= thresholds.medio_min_qty) return "medio"
  return "menudeo"
}

/** Selecciona el precio adecuado de una variante para el tier dado. */
export function priceForTier(
  variant: {
    price?: number | null
    price_menudeo?: number | null
    price_medio?: number | null
    price_mayoreo?: number | null
  },
  tier: "menudeo" | "medio" | "mayoreo"
): number {
  const direct =
    tier === "mayoreo"
      ? variant.price_mayoreo
      : tier === "medio"
      ? variant.price_medio
      : variant.price_menudeo
  // Fallbacks en cascada: si no hay precio_X, usa el de menor tier disponible
  return Number(
    direct ?? variant.price_medio ?? variant.price_menudeo ?? variant.price ?? 0
  )
}

/** Mensaje motivacional: "Lleva X más y bajas a $Y c/u". */
export function nextTierHint(
  currentQty: number,
  thresholds: TierThresholds,
  variant: {
    price?: number | null
    price_menudeo?: number | null
    price_medio?: number | null
    price_mayoreo?: number | null
  }
): { missing: number; nextTier: "medio" | "mayoreo"; price: number } | null {
  if (currentQty < thresholds.medio_min_qty) {
    const p = priceForTier(variant, "medio")
    const baseP = priceForTier(variant, "menudeo")
    if (p > 0 && p < baseP) {
      return {
        missing: thresholds.medio_min_qty - currentQty,
        nextTier: "medio",
        price: p,
      }
    }
  }
  if (currentQty < thresholds.mayoreo_min_qty) {
    const p = priceForTier(variant, "mayoreo")
    const baseP = priceForTier(variant, currentQty >= thresholds.medio_min_qty ? "medio" : "menudeo")
    if (p > 0 && p < baseP) {
      return {
        missing: thresholds.mayoreo_min_qty - currentQty,
        nextTier: "mayoreo",
        price: p,
      }
    }
  }
  return null
}

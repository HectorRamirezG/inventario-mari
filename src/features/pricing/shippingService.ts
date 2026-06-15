import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

/* ──────────────────────────────────────────────────────────
 * SHIPPING CONFIG (modificable por admin desde Settings)
 * ────────────────────────────────────────────────────────── */

export interface ShippingConfig {
  foreign_cost: number  // costo si es foráneo y no califica para gratis
  free_from: number     // si subtotal >= esto → envío foráneo gratis
  local_cost: number    // costo de envío local (0 = gratis local)
}

export const DEFAULT_SHIPPING: ShippingConfig = {
  foreign_cost: 250,
  free_from: 2800,
  local_cost: 0,
}

let cache: ShippingConfig | null = null
const listeners = new Set<(c: ShippingConfig) => void>()

async function load(): Promise<ShippingConfig> {
  if (cache) return cache
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "shipping_config")
      .maybeSingle()
    const v = (data?.value as any) ?? {}
    cache = {
      foreign_cost: Number(v.foreign_cost ?? DEFAULT_SHIPPING.foreign_cost),
      free_from:    Number(v.free_from    ?? DEFAULT_SHIPPING.free_from),
      local_cost:   Number(v.local_cost   ?? DEFAULT_SHIPPING.local_cost),
    }
  } catch {
    cache = { ...DEFAULT_SHIPPING }
  }
  listeners.forEach((l) => l(cache!))
  return cache!
}

export async function saveShippingConfig(c: ShippingConfig): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "shipping_config", value: c, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  if (error) throw error
  cache = { ...c }
  listeners.forEach((l) => l(cache!))
}

export function useShippingConfig(): ShippingConfig {
  const [val, setVal] = useState<ShippingConfig>(cache ?? DEFAULT_SHIPPING)
  useEffect(() => {
    let alive = true
    if (!cache) load().then((c) => alive && setVal(c))
    else setVal(cache)
    const l = (c: ShippingConfig) => alive && setVal(c)
    listeners.add(l)
    return () => {
      alive = false
      listeners.delete(l)
    }
  }, [])
  return val
}

/* ──────────────────────────────────────────────────────────
 * CÁLCULO ÚNICO de envío (cliente, admin, ticket)
 * ────────────────────────────────────────────────────────── */

export function calcShipping(
  subtotal: number,
  isForeign: boolean,
  config: ShippingConfig
): { amount: number; free: boolean } {
  if (!isForeign) {
    return { amount: config.local_cost || 0, free: (config.local_cost || 0) === 0 }
  }
  // Foráneo: gratis si supera el umbral
  if (subtotal >= config.free_from) {
    return { amount: 0, free: true }
  }
  return { amount: config.foreign_cost, free: false }
}

/* ──────────────────────────────────────────────────────────
 * CÁLCULO ÚNICO de TOTAL
 *   total = subtotal + envío - ajuste
 *   (ajuste > 0 = descuento, ajuste < 0 = cargo extra)
 * ────────────────────────────────────────────────────────── */

export interface SaleTotals {
  subtotal: number
  shipping: number
  adjustment: number  // signed: + descuenta, - cobra
  total: number
}

export function calcSaleTotals(input: {
  subtotal: number
  shipping?: number
  adjustment?: number
}): SaleTotals {
  const subtotal   = Math.max(0, Number(input.subtotal) || 0)
  const shipping   = Math.max(0, Number(input.shipping) || 0)
  const adjustment = Number(input.adjustment) || 0
  const total      = Math.max(0, subtotal + shipping - adjustment)
  return { subtotal, shipping, adjustment, total }
}

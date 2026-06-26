import { supabase } from "../../lib/supabase"

/**
 * Estimador de envío por código postal.
 *
 * Mari define zonas de envío como filas en `app_settings.value`
 * bajo la clave `shipping_zones`. Cada zona es:
 *   { id, label, postal_codes: string[], cost, eta_days, instructions? }
 *
 * El cliente captura su CP en el checkout (o en BuySheet) y le mostramos
 * UNA estimación clara: "Te llega en 2 días por $80" o "Recolección
 * local mañana entre 4-6PM". Esto reduce dramáticamente la pregunta
 * #1 que mata ventas: ¿cuánto cuesta y cuándo llega?
 *
 * Si NO hay zonas configuradas o el CP no encuentra match, devuelve la
 * zona "default" (la primera con `is_default: true`). Si tampoco existe
 * default, devuelve un fallback genérico (Mari te contactará para
 * coordinar).
 */

export interface ShippingZone {
  id: string
  label: string
  postal_codes: string[]
  cost: number
  eta_days: number
  /** Texto adicional opcional (ej: "Recolección de 4-6PM en Plaza X"). */
  instructions?: string
  /** Marca esta zona como "default" cuando ningún CP coincide. */
  is_default?: boolean
  /** Si está apagada, no se evalúa (útil para guardar zonas archivadas). */
  enabled?: boolean
}

export interface ShippingEstimate {
  zone: ShippingZone | null
  cost: number
  eta_days: number
  label: string
  instructions?: string
  /** True si NO encontramos zona específica y caímos en default/fallback. */
  is_fallback: boolean
}

const KEY = "shipping_zones"
const FALLBACK: ShippingEstimate = {
  zone: null,
  cost: 0,
  eta_days: 0,
  label: "Coordinamos por mensaje",
  instructions:
    "Manda tu dirección por WhatsApp para confirmar el costo y la fecha.",
  is_fallback: true,
}

/** Cache simple — las zonas casi nunca cambian. */
let cache: { data: ShippingZone[]; loadedAt: number } | null = null
const CACHE_TTL_MS = 60_000

export async function listShippingZones(
  force = false,
): Promise<ShippingZone[]> {
  const now = Date.now()
  if (!force && cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.data
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle()
  if (error || !data) {
    cache = { data: [], loadedAt: now }
    return []
  }
  const arr = (data.value as any)?.zones
  const zones = Array.isArray(arr) ? (arr as ShippingZone[]) : []
  // Sanitización ligera
  const cleaned = zones
    .filter((z) => z && typeof z === "object" && z.id && z.label)
    .map((z) => ({
      id: String(z.id),
      label: String(z.label),
      postal_codes: Array.isArray(z.postal_codes)
        ? z.postal_codes.map((p) => String(p).trim()).filter(Boolean)
        : [],
      cost: Number(z.cost ?? 0),
      eta_days: Number(z.eta_days ?? 0),
      instructions: z.instructions ? String(z.instructions) : undefined,
      is_default: !!z.is_default,
      enabled: z.enabled !== false,
    }))
  cache = { data: cleaned, loadedAt: now }
  return cleaned
}

export async function saveShippingZones(zones: ShippingZone[]): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({
    key: KEY,
    value: { zones },
  })
  if (error) throw error
  cache = null
}

/**
 * Resuelve UN CP a la mejor zona aplicable.
 *
 * 1. Si zone.enabled === false → skip
 * 2. Si zone.postal_codes incluye el CP exacto → match
 * 3. Si zone.postal_codes incluye un prefijo seguido de "*" (ej "446*") →
 *    match por startsWith del prefijo (longitud min 2 para evitar todo-match)
 * 4. Si nadie matcheó, devuelve la zona is_default (si existe)
 * 5. Si tampoco hay default, devuelve FALLBACK
 */
export function estimateShipping(
  cp: string,
  zones: ShippingZone[],
): ShippingEstimate {
  const clean = (cp ?? "").trim()
  if (!clean) return FALLBACK
  const active = zones.filter((z) => z.enabled !== false)
  if (active.length === 0) return FALLBACK

  for (const z of active) {
    for (const pattern of z.postal_codes) {
      const p = pattern.trim()
      if (!p) continue
      if (p === clean) {
        return zoneToEstimate(z, false)
      }
      if (p.endsWith("*") && p.length > 2) {
        const prefix = p.slice(0, -1)
        if (clean.startsWith(prefix)) {
          return zoneToEstimate(z, false)
        }
      }
    }
  }

  const def = active.find((z) => z.is_default)
  if (def) return zoneToEstimate(def, true)
  return FALLBACK
}

function zoneToEstimate(z: ShippingZone, isFallback: boolean): ShippingEstimate {
  return {
    zone: z,
    cost: z.cost,
    eta_days: z.eta_days,
    label: z.label,
    instructions: z.instructions,
    is_fallback: isFallback,
  }
}

/** Para el form admin: nuevo registro vacío. */
export function emptyZone(): ShippingZone {
  return {
    id: `zone_${Date.now().toString(36)}`,
    label: "",
    postal_codes: [],
    cost: 0,
    eta_days: 1,
    enabled: true,
  }
}

/* ─────────── Helpers para localStorage del cliente ─────────── */

const LAST_CP_KEY = "mari:last-cp:v1"

export function rememberPostalCode(cp: string): void {
  try {
    if (cp && cp.length >= 4) localStorage.setItem(LAST_CP_KEY, cp)
  } catch {
    // ignore quota
  }
}

export function recallPostalCode(): string {
  try {
    return localStorage.getItem(LAST_CP_KEY) ?? ""
  } catch {
    return ""
  }
}

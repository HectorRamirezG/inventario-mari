import type { PricingTier } from "./pricingTypes"
import type { TierThresholds } from "./tierPricingService"
import { DEFAULT_THRESHOLDS } from "./tierPricingService"

/**
 * Resolver de umbrales de tier con CASCADA de 3 niveles:
 *   variante (override específico)
 *     ↓ si NULL/undefined en variante
 *   producto (override del producto padre)
 *     ↓ si NULL/undefined en producto
 *   global (app_settings.tier_thresholds)
 *
 * Semántica CLAVE:
 *   • Los campos NULL en la BD significan "no configurado, hereda del
 *     siguiente nivel". NUNCA se interpretan como 0.
 *   • Si ambos umbrales de un nivel están definidos, ambos se usan
 *     juntos (no se mezcla el "medio" de un nivel con el "mayoreo"
 *     de otro). Esto evita configuraciones inconsistentes tipo
 *     "medio=3 pero mayoreo=null" que fallarían silenciosamente.
 *
 * Comportamiento del carrito (POR LÍNEA):
 *   El tier de UNA línea se calcula usando:
 *     tier = detectTier(TOTAL_PIEZAS_DEL_CARRITO, umbrales_de_la_línea)
 *   Es decir, el conteo de piezas es cross-product (mayoreo cruzado),
 *   pero cada línea evalúa su tier con SUS propios umbrales. Ejemplo
 *   con 6 pz totales:
 *     • Producto A (umbrales 6/12) → tier "medio"
 *     • Producto B (umbrales 3/6)  → tier "mayoreo"
 */

// ─── Shape mínimo que consume el resolver ───
// Cualquier objeto con estas dos columnas sirve (producto, variante o
// snapshot desde el catálogo del cliente).
export interface TierOverrides {
  tier_umbral_medio?: number | null
  tier_umbral_mayoreo?: number | null
}

/**
 * Aplica la cascada variante > producto > global.
 * Devuelve SIEMPRE thresholds válidos (nunca null).
 */
export function resolveThresholds(
  variant: TierOverrides | null | undefined,
  product: TierOverrides | null | undefined,
  global: TierThresholds = DEFAULT_THRESHOLDS,
): TierThresholds {
  // Cada campo se resuelve INDEPENDIENTEMENTE por nivel — así el admin
  // puede fijar solo "mayoreo desde 6" y dejar "medio" heredado.
  const vMedio = numOrNull(variant?.tier_umbral_medio)
  const pMedio = numOrNull(product?.tier_umbral_medio)
  const medio =
    vMedio ?? pMedio ?? global.medio_min_qty ?? DEFAULT_THRESHOLDS.medio_min_qty

  const vMayoreo = numOrNull(variant?.tier_umbral_mayoreo)
  const pMayoreo = numOrNull(product?.tier_umbral_mayoreo)
  const mayoreo =
    vMayoreo ?? pMayoreo ?? global.mayoreo_min_qty ?? DEFAULT_THRESHOLDS.mayoreo_min_qty

  // Defensa: si por corrupción quedaran valores inconsistentes
  // (medio >= mayoreo), colapsamos a los defaults para no romper el
  // cálculo de tier. Un check en la DB lo evita, pero front debe ser
  // idempotente.
  if (medio >= mayoreo) {
    return { ...DEFAULT_THRESHOLDS }
  }

  return { medio_min_qty: medio, mayoreo_min_qty: mayoreo }
}

/**
 * Determina el tier de UNA línea a partir del total del carrito y
 * los umbrales resueltos para esa línea.
 */
export function tierForLine(
  totalCartQty: number,
  thresholds: TierThresholds,
): PricingTier {
  const q = Number(totalCartQty) || 0
  if (q >= thresholds.mayoreo_min_qty) return "mayoreo"
  if (q >= thresholds.medio_min_qty) return "medio"
  return "menudeo"
}

/**
 * "¿Cuántas piezas faltan a esta LÍNEA para subir al siguiente tier?"
 * Devuelve null si ya está en mayoreo o si los umbrales son inválidos.
 */
export function piecesToNextTierForLine(
  totalCartQty: number,
  thresholds: TierThresholds,
): { tier: PricingTier; missing: number } | null {
  const q = Number(totalCartQty) || 0
  if (q < thresholds.medio_min_qty) {
    return { tier: "medio", missing: thresholds.medio_min_qty - q }
  }
  if (q < thresholds.mayoreo_min_qty) {
    return { tier: "mayoreo", missing: thresholds.mayoreo_min_qty - q }
  }
  return null
}

/**
 * ¿Este objeto (producto o variante) tiene override configurado?
 * Útil para pintar chip "personalizado" o botón "resetear a global".
 */
export function hasTierOverride(
  overrides: TierOverrides | null | undefined,
): boolean {
  return (
    overrides != null &&
    (numOrNull(overrides.tier_umbral_medio) != null ||
      numOrNull(overrides.tier_umbral_mayoreo) != null)
  )
}

// ─── Utilidades ───

/** Normaliza a number > 0 o null. Rechaza NaN, negativos, 0 y "". */
function numOrNull(v: number | null | undefined | string): number | null {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

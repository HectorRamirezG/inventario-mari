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
 * Comportamiento del carrito (POR VARIANTE):
 *   El tier de UNA línea se calcula usando SÓLO la cantidad de piezas
 *   de esa MISMA variante en el carrito:
 *     tier = detectTier(QTY_DE_LA_VARIANTE, umbrales_de_la_línea)
 *   Ya NO hay "mayoreo cruzado": cada variante avanza a su ritmo con
 *   su propia cantidad. Ejemplo con carrito de 8 piezas:
 *     • Variante A: 3 pz (umbrales 3/6) → tier "medio"
 *     • Variante B: 5 pz (umbrales 3/6) → tier "medio"
 *   Cada una se cobra a su precio de tier según SUS piezas.
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
 * Determina el tier de UNA variante a partir de sus piezas EN EL CARRITO
 * (solo las de esa variante — no cross-cart) y los umbrales resueltos.
 *
 * Después del rework 2026-07-01: cada variante avanza a su propio tier
 * usando SUS piezas. Ya no se combinan piezas de variantes distintas
 * para llegar a mayoreo.
 */
export function tierForLine(
  variantQty: number,
  thresholds: TierThresholds,
): PricingTier {
  const q = Number(variantQty) || 0
  if (q >= thresholds.mayoreo_min_qty) return "mayoreo"
  if (q >= thresholds.medio_min_qty) return "medio"
  return "menudeo"
}

/**
 * "¿Cuántas piezas faltan a esta VARIANTE para subir al siguiente tier?"
 * Devuelve null si ya está en mayoreo o si los umbrales son inválidos.
 */
export function piecesToNextTierForLine(
  variantQty: number,
  thresholds: TierThresholds,
): { tier: PricingTier; missing: number } | null {
  const q = Number(variantQty) || 0
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

import type { Sale, SaleItem } from "../../types/database"
import type { PricingTier } from "../pricing/pricingTypes"
import { priceForTier } from "../sales/salesTier"
import {
  resolveThresholds,
  tierForLine,
} from "../pricing/tierResolver"
import type { TierThresholds } from "../pricing/tierPricingService"
import { DEFAULT_THRESHOLDS } from "../pricing/tierPricingService"

export interface CascadeLine {
  id: string
  variant_id: string | null
  product_id: string | null
  product_name: string | null
  variant_name: string | null
  qty: number
  tier: PricingTier
  unit_price: number
  cost_snapshot: number
  // precios disponibles para reprice
  price_menudeo: number | null
  price_medio: number | null
  price_mayoreo: number | null
  // Overrides de umbrales — cascada variante > producto > global.
  variant_tier_umbral_medio?: number | null
  variant_tier_umbral_mayoreo?: number | null
  product_tier_umbral_medio?: number | null
  product_tier_umbral_mayoreo?: number | null
  // metadata interna
  _removed?: boolean
}

export interface CascadePreview {
  /** Líneas activas (no removidas) ya reprecificadas al tier resultante */
  lines: CascadeLine[]
  /** Líneas marcadas como removidas (devolverán stock al guardar) */
  removed: CascadeLine[]
  /** Tier global resultante (usando umbrales globales — informativo) */
  newTier: PricingTier
  /** Tier antes del cambio (para mostrar el "bajó de mayoreo → medio") */
  oldTier: PricingTier
  /** Nuevo subtotal y total considerando el ajuste y envío de la venta */
  newSubtotal: number
  newTotal: number
  newBalance: number
  /** Cantidad de stock a devolver por variante */
  stockToReturn: Record<string, number>
}

/**
 * Calcula el efecto en cascada de eliminar / modificar líneas de un ticket.
 *
 * Regla maestra:
 *   • El total de piezas del carrito se sigue calculando cross-product
 *     (mayoreo cruzado se conserva).
 *   • Cada LÍNEA calcula su tier con SUS umbrales resueltos (cascada
 *     variante > producto > global) y el total del carrito.
 *   • El precio de cada línea se recalcula con SU tier específico.
 *
 * `oldTier` y `newTier` en el preview se calculan con umbrales GLOBALES
 * solamente — sirven para el mensaje resumen "bajó de mayoreo a medio".
 * Cada línea individual reporta su tier real en `line.tier`.
 *
 * No toca la BD — devuelve una vista previa. La capa de servicio que
 * lo invoque se encarga del UPDATE de sale_items, sales y movements.
 */
export function previewCascade(
  sale: Pick<Sale, "adjustment_amount" | "shipping_amount" | "paid">,
  original: CascadeLine[],
  modified: CascadeLine[],
  globalThresholds: TierThresholds = DEFAULT_THRESHOLDS,
): CascadePreview {
  const removed = modified.filter((l) => l._removed)
  const active = modified.filter((l) => !l._removed)

  // Tier antes / después (con umbrales GLOBALES — informativo).
  const oldTotalQty = original.reduce((a, l) => a + Number(l.qty || 0), 0)
  const oldTier = tierForLine(oldTotalQty, globalThresholds)

  const newTotalQty = active.reduce((a, l) => a + Number(l.qty || 0), 0)
  const newTier = tierForLine(newTotalQty, globalThresholds)

  // Reprice POR LÍNEA con sus umbrales resueltos.
  const repriced: CascadeLine[] = active.map((l) => {
    const thresholds = resolveThresholds(
      {
        tier_umbral_medio: l.variant_tier_umbral_medio,
        tier_umbral_mayoreo: l.variant_tier_umbral_mayoreo,
      },
      {
        tier_umbral_medio: l.product_tier_umbral_medio,
        tier_umbral_mayoreo: l.product_tier_umbral_mayoreo,
      },
      globalThresholds,
    )
    const lineTier = tierForLine(newTotalQty, thresholds)
    const newPrice = priceForTier(
      {
        price_menudeo: l.price_menudeo ?? 0,
        price_medio: l.price_medio ?? 0,
        price_mayoreo: l.price_mayoreo ?? 0,
      },
      lineTier,
    )
    // Si el item no tiene precio en el nuevo tier, conserva el actual
    // (puede pasar si la variante nunca tuvo precio_menudeo capturado).
    const fallback = newPrice > 0 ? newPrice : l.unit_price
    return { ...l, tier: lineTier, unit_price: fallback }
  })

  const newSubtotal = repriced.reduce(
    (a, l) => a + Number(l.qty || 0) * Number(l.unit_price || 0),
    0
  )
  const adj = Number(sale.adjustment_amount) || 0
  const ship = Number(sale.shipping_amount) || 0
  const newTotal = Math.max(0, newSubtotal - adj + ship)
  const paid = Number(sale.paid) || 0
  const newBalance = Math.max(0, newTotal - paid)

  const stockToReturn: Record<string, number> = {}
  for (const l of removed) {
    if (!l.variant_id) continue
    stockToReturn[l.variant_id] = (stockToReturn[l.variant_id] || 0) + Number(l.qty || 0)
  }
  // Si una línea sigue activa pero se redujo qty, también devolvemos diff
  for (const l of active) {
    const orig = original.find((o) => o.id === l.id)
    if (!orig || !l.variant_id) continue
    const diff = Number(orig.qty || 0) - Number(l.qty || 0)
    if (diff > 0) {
      stockToReturn[l.variant_id] = (stockToReturn[l.variant_id] || 0) + diff
    }
  }

  return {
    lines: repriced,
    removed,
    newTier,
    oldTier,
    newSubtotal,
    newTotal,
    newBalance,
    stockToReturn,
  }
}

/** Crea un CascadeLine a partir de un SaleItem + precios de variante.
 *  Los overrides de umbrales son opcionales — si no se pasan, la línea
 *  usará solo los umbrales globales al repricear. */
export function toCascadeLine(
  item: SaleItem,
  variantPrices?: {
    price_menudeo: number | null
    price_medio: number | null
    price_mayoreo: number | null
    tier_umbral_medio?: number | null
    tier_umbral_mayoreo?: number | null
  },
  productOverrides?: {
    tier_umbral_medio?: number | null
    tier_umbral_mayoreo?: number | null
  },
): CascadeLine {
  return {
    id: item.id,
    variant_id: item.variant_id,
    product_id: item.product_id,
    product_name: item.product_name,
    variant_name: item.variant_name,
    qty: Number(item.qty) || 0,
    tier: item.tier,
    unit_price: Number(item.unit_price) || 0,
    cost_snapshot: Number(item.cost_snapshot) || 0,
    price_menudeo: variantPrices?.price_menudeo ?? null,
    price_medio: variantPrices?.price_medio ?? null,
    price_mayoreo: variantPrices?.price_mayoreo ?? null,
    variant_tier_umbral_medio: variantPrices?.tier_umbral_medio ?? null,
    variant_tier_umbral_mayoreo: variantPrices?.tier_umbral_mayoreo ?? null,
    product_tier_umbral_medio: productOverrides?.tier_umbral_medio ?? null,
    product_tier_umbral_mayoreo: productOverrides?.tier_umbral_mayoreo ?? null,
  }
}

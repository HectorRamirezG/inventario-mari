import { supabase } from "../../lib/supabase"

/**
 * Servicio centralizado del "perfil de compra" del cliente.
 *
 * Agrupa funciones que leen ventas + items + variants de UN cliente para:
 *
 *   - Paleta personal (variantes ya compradas, agrupadas por producto).
 *   - Cross-sell ("Combina con lo que ya tienes").
 *   - Recordatorio de reposición (frecuencia × producto).
 *
 * UNA query a sales+sale_items+variants se reutiliza para los 3 features
 * (cache 5 min) para minimizar round-trips.
 */

export interface PurchasedVariant {
  product_id: string
  product_name: string
  product_category: string | null
  variant_id: string
  variant_name: string
  swatch_hex: string | null
  image_url: string | null
  /** Veces que ha comprado esta variante (suma de qty). */
  total_qty: number
  /** Cuántas veces apareció en distintos pedidos. */
  order_count: number
  /** Última fecha de compra (ISO). */
  last_purchased_at: string
  /** Primera fecha de compra (ISO). */
  first_purchased_at: string
}

export interface PurchaseProfile {
  variants: PurchasedVariant[]
  /** Categorías compradas con su cuenta. */
  categories: { category: string; count: number }[]
  /** Resumen para insights. */
  total_orders: number
  loadedAt: string
}

const EMPTY: PurchaseProfile = {
  variants: [],
  categories: [],
  total_orders: 0,
  loadedAt: new Date().toISOString(),
}

const cache = new Map<string, { data: PurchaseProfile; loadedAt: number }>()
const TTL_MS = 5 * 60_000

export async function getMyPurchaseProfile(
  email: string,
): Promise<PurchaseProfile> {
  if (!email) return EMPTY
  const key = email.toLowerCase()
  const c = cache.get(key)
  if (c && Date.now() - c.loadedAt < TTL_MS) return c.data

  const { data: sales, error: salesErr } = await supabase
    .from("sales")
    .select(
      "id, created_at, status, sale_items(variant_id, product_id, product_name, variant_name, qty)",
    )
    .eq("customer_email", key)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(80)
  if (salesErr) {
    cache.set(key, { data: EMPTY, loadedAt: Date.now() })
    return EMPTY
  }

  const rows = sales ?? []

  // Aggregate por variant_id
  const byVariant = new Map<
    string,
    {
      product_id: string
      product_name: string
      variant_id: string
      variant_name: string
      qty: number
      orders: number
      first: string
      last: string
    }
  >()
  const orderCountMap = new Map<string, Set<string>>() // variant_id -> Set<sale_id>

  for (const s of rows as any[]) {
    const items = Array.isArray(s.sale_items) ? s.sale_items : []
    for (const it of items) {
      if (!it.variant_id || !it.product_id) continue
      const key = it.variant_id
      const existing = byVariant.get(key)
      if (!existing) {
        byVariant.set(key, {
          product_id: it.product_id,
          product_name: it.product_name ?? "Producto",
          variant_id: it.variant_id,
          variant_name: it.variant_name ?? "—",
          qty: Number(it.qty || 0),
          orders: 1,
          first: s.created_at,
          last: s.created_at,
        })
      } else {
        existing.qty += Number(it.qty || 0)
        existing.last =
          s.created_at > existing.last ? s.created_at : existing.last
        existing.first =
          s.created_at < existing.first ? s.created_at : existing.first
      }
      if (!orderCountMap.has(key)) orderCountMap.set(key, new Set())
      orderCountMap.get(key)!.add(s.id)
    }
  }

  // Enriquecer con swatch_hex e image_url
  const variantIds = Array.from(byVariant.keys())
  const productIds = Array.from(
    new Set(
      Array.from(byVariant.values()).map((v) => v.product_id),
    ),
  )

  const [variantsLookup, productsLookup] = await Promise.all([
    variantIds.length > 0
      ? supabase
          .from("variants")
          .select("id, swatch_hex, image_url, image_urls")
          .in("id", variantIds)
      : Promise.resolve({ data: [], error: null } as any),
    productIds.length > 0
      ? supabase
          .from("products")
          .select("id, category")
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  const vById = new Map(
    (variantsLookup.data ?? []).map((v: any) => [v.id, v]),
  )
  const pById = new Map(
    (productsLookup.data ?? []).map((p: any) => [p.id, p]),
  )

  const variants: PurchasedVariant[] = Array.from(byVariant.values())
    .map((v) => {
      const vRow = vById.get(v.variant_id)
      const pRow = pById.get(v.product_id)
      const img =
        (Array.isArray(vRow?.image_urls) && vRow.image_urls[0]) ||
        vRow?.image_url ||
        null
      return {
        product_id: v.product_id,
        product_name: v.product_name,
        product_category: pRow?.category ?? null,
        variant_id: v.variant_id,
        variant_name: v.variant_name,
        swatch_hex: vRow?.swatch_hex ?? null,
        image_url: img,
        total_qty: v.qty,
        order_count: orderCountMap.get(v.variant_id)?.size ?? 1,
        last_purchased_at: v.last,
        first_purchased_at: v.first,
      }
    })
    .sort((a, b) => b.total_qty - a.total_qty)

  // Categorías agregadas
  const catMap = new Map<string, number>()
  for (const v of variants) {
    if (!v.product_category) continue
    catMap.set(v.product_category, (catMap.get(v.product_category) ?? 0) + 1)
  }
  const categories = Array.from(catMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  const profile: PurchaseProfile = {
    variants,
    categories,
    total_orders: rows.length,
    loadedAt: new Date().toISOString(),
  }
  cache.set(key, { data: profile, loadedAt: Date.now() })
  return profile
}

/* ─────────── Helpers usables por features ─────────── */

/**
 * Estimación heurística de "cuánto dura un producto antes de reordenar".
 * Si ha comprado 2+ veces, calcula promedio entre fechas; si solo 1×,
 * usa default por categoría.
 */
export function estimateRefillDays(v: PurchasedVariant): number {
  if (v.order_count >= 2) {
    const first = new Date(v.first_purchased_at).getTime()
    const last = new Date(v.last_purchased_at).getTime()
    const diffDays = Math.max(15, Math.floor((last - first) / 86_400_000))
    return Math.round(diffDays / (v.order_count - 1))
  }
  // Defaults razonables por categoría de maquillaje
  const c = (v.product_category ?? "").toLowerCase()
  if (/labial|gloss/.test(c)) return 90
  if (/base|corrector|polvo/.test(c)) return 120
  if (/sombra|paleta/.test(c)) return 180
  if (/rim.l|m.scara/.test(c)) return 90
  if (/perfume|fragancia/.test(c)) return 365
  return 90
}

/**
 * Devuelve productos que el cliente NO ha comprado pero que combinan
 * naturalmente con su historial (matching por categoría más comprada).
 * Útil para "Combina con lo que ya tienes".
 */
export async function getCrossSellSuggestions(
  email: string,
  limit = 6,
): Promise<{ product_id: string; product_name: string; image_url: string | null }[]> {
  const profile = await getMyPurchaseProfile(email)
  if (profile.variants.length === 0) return []
  const myCategory = profile.categories[0]?.category
  if (!myCategory) return []
  const purchasedIds = new Set(profile.variants.map((v) => v.product_id))

  const { data: products } = await supabase
    .from("products")
    .select("id, name, image_url, category, variants(image_url, image_urls)")
    .eq("category", myCategory)
    .eq("is_active", true)
    .limit(50)
  const list = (products ?? []) as any[]
  return list
    .filter((p) => !purchasedIds.has(p.id))
    .slice(0, limit)
    .map((p) => {
      const firstVar = Array.isArray(p.variants) ? p.variants[0] : null
      const img =
        (Array.isArray(firstVar?.image_urls) && firstVar.image_urls[0]) ||
        firstVar?.image_url ||
        p.image_url ||
        null
      return { product_id: p.id, product_name: p.name, image_url: img }
    })
}

/** Limpia el cache (para usar después de una compra exitosa). */
export function invalidatePurchaseProfileCache(email?: string) {
  if (email) cache.delete(email.toLowerCase())
  else cache.clear()
}

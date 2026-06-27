import { supabase } from "../../lib/supabase"

/**
 * Insights admin — métricas calculadas en cliente desde tablas existentes.
 *
 * Filosofía: no agregamos columnas nuevas; sacamos todo del histórico real.
 *
 * Funciones:
 *   - getPeakHours(days): "tus clientas visitan más entre 8-10 PM"
 *   - getProductFunnel(days): visto → carrito → apartado → pagado por producto
 *   - getProductOfMonth(): el más vendido del mes anterior (badge automático)
 */

/* ─────────── 1) Hora pico ─────────── */

export interface PeakHour {
  hour: number // 0..23
  visits: number
  sales: number
}

export async function getPeakHours(days = 30): Promise<PeakHour[]> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()

  // 1) Visitas: site_visitors.pages_viewed jsonb tiene array de { at, path }
  const { data: vRows } = await supabase
    .from("site_visitors")
    .select("pages_viewed, last_seen_at")
    .gte("last_seen_at", sinceIso)
    .limit(2000)
  const visitsByHour = new Array(24).fill(0) as number[]
  for (const v of (vRows ?? []) as any[]) {
    const arr = Array.isArray(v.pages_viewed) ? v.pages_viewed : []
    for (const p of arr) {
      const ts = typeof p === "object" && p?.at ? p.at : v.last_seen_at
      if (!ts) continue
      const h = new Date(ts).getHours()
      visitsByHour[h] = (visitsByHour[h] ?? 0) + 1
    }
  }

  // 2) Ventas (las que se concretaron) — para correlación
  const { data: sRows } = await supabase
    .from("sales")
    .select("created_at, status")
    .gte("created_at", sinceIso)
    .neq("status", "cancelled")
    .limit(2000)
  const salesByHour = new Array(24).fill(0) as number[]
  for (const s of (sRows ?? []) as any[]) {
    const h = new Date(s.created_at).getHours()
    salesByHour[h] = (salesByHour[h] ?? 0) + 1
  }

  return visitsByHour.map((visits, hour) => ({
    hour,
    visits,
    sales: salesByHour[hour] ?? 0,
  }))
}

/* ─────────── 1.b) Heatmap día×hora ─────────── */

export interface PeakSlot {
  /** 0=Domingo, 1=Lunes, ..., 6=Sábado (Date.getDay()) */
  dayOfWeek: number
  hour: number // 0..23
  visits: number
  sales: number
}

/**
 * Devuelve los 168 slots (7 días × 24 horas) con visitas y ventas.
 * Útil para un heatmap "qué día/hora vende más". Lectura más fina
 * que `getPeakHours` que solo agrega por hora del día.
 */
export async function getPeakHoursHeatmap(days = 30): Promise<PeakSlot[]> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()

  // Inicializa matriz 7×24
  const visits: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const sales: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))

  const { data: vRows } = await supabase
    .from("site_visitors")
    .select("pages_viewed, last_seen_at")
    .gte("last_seen_at", sinceIso)
    .limit(2000)
  for (const v of (vRows ?? []) as any[]) {
    const arr = Array.isArray(v.pages_viewed) ? v.pages_viewed : []
    for (const p of arr) {
      const ts = typeof p === "object" && p?.at ? p.at : v.last_seen_at
      if (!ts) continue
      const d = new Date(ts)
      visits[d.getDay()][d.getHours()] += 1
    }
  }

  const { data: sRows } = await supabase
    .from("sales")
    .select("created_at, status")
    .gte("created_at", sinceIso)
    .neq("status", "cancelled")
    .limit(2000)
  for (const s of (sRows ?? []) as any[]) {
    const d = new Date(s.created_at)
    sales[d.getDay()][d.getHours()] += 1
  }

  const out: PeakSlot[] = []
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      out.push({
        dayOfWeek: day,
        hour,
        visits: visits[day][hour],
        sales: sales[day][hour],
      })
    }
  }
  return out
}

/* ─────────── 2) Funnel por producto ─────────── */

export interface ProductFunnel {
  product_id: string
  product_name: string
  image_url: string | null
  /** Sesiones únicas que vieron /p/{id} en la ventana. */
  viewed: number
  /** Ventas/apartados que incluyen este producto (no canceladas). */
  in_carts: number
  /** Apartados con balance > 0. */
  layaways: number
  /** Ventas pagadas. */
  paid: number
}

export async function getProductFunnels(days = 30): Promise<ProductFunnel[]> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()

  // 1) Visitas por producto
  const { data: vRows } = await supabase
    .from("site_visitors")
    .select("pages_viewed")
    .gte("last_seen_at", sinceIso)
    .limit(2000)

  const viewedByProduct = new Map<string, Set<string>>() // product_id -> Set<session>
  for (const v of (vRows ?? []) as any[]) {
    const arr = Array.isArray(v.pages_viewed) ? v.pages_viewed : []
    const sessionKey = JSON.stringify(arr).slice(0, 32) // proxy de sesión
    for (const p of arr) {
      const path = typeof p === "object" ? p?.path : p
      if (typeof path !== "string") continue
      const m = path.match(/^\/p\/([a-z0-9-]+)/i)
      if (!m) continue
      const pid = m[1]
      if (!viewedByProduct.has(pid)) viewedByProduct.set(pid, new Set())
      viewedByProduct.get(pid)!.add(sessionKey)
    }
  }

  // 2) Items vendidos por producto (in_carts + paid + layaways)
  const { data: items } = await supabase
    .from("sale_items")
    .select(
      "product_id, sales!inner(id, status, balance, created_at)",
    )
    .gte("sales.created_at", sinceIso)
    .neq("sales.status", "cancelled")
    .not("product_id", "is", null)
    .limit(5000)

  const inCarts = new Map<string, Set<string>>() // product_id -> set sale_ids
  const layaways = new Map<string, Set<string>>()
  const paid = new Map<string, Set<string>>()
  for (const it of (items ?? []) as any[]) {
    if (!it.product_id || !it.sales) continue
    const pid = it.product_id
    const sid = it.sales.id
    if (!inCarts.has(pid)) inCarts.set(pid, new Set())
    inCarts.get(pid)!.add(sid)
    if (Number(it.sales.balance ?? 0) > 0) {
      if (!layaways.has(pid)) layaways.set(pid, new Set())
      layaways.get(pid)!.add(sid)
    } else {
      if (!paid.has(pid)) paid.set(pid, new Set())
      paid.get(pid)!.add(sid)
    }
  }

  // 3) Trae info de productos para nombre + imagen
  const allProductIds = Array.from(
    new Set([
      ...Array.from(viewedByProduct.keys()),
      ...Array.from(inCarts.keys()),
    ]),
  )
  if (allProductIds.length === 0) return []
  const { data: products } = await supabase
    .from("products")
    .select("id, name, image_url")
    .in("id", allProductIds)
  const pById = new Map((products ?? []).map((p: any) => [p.id, p]))

  return allProductIds
    .map((pid) => ({
      product_id: pid,
      product_name: pById.get(pid)?.name ?? "Producto",
      image_url: pById.get(pid)?.image_url ?? null,
      viewed: viewedByProduct.get(pid)?.size ?? 0,
      in_carts: inCarts.get(pid)?.size ?? 0,
      layaways: layaways.get(pid)?.size ?? 0,
      paid: paid.get(pid)?.size ?? 0,
    }))
    .filter((f) => f.viewed + f.in_carts > 0)
    .sort((a, b) => b.viewed + b.in_carts - (a.viewed + a.in_carts))
    .slice(0, 12)
}

/* ─────────── 3) Producto del mes (autocálculo) ─────────── */

export interface ProductOfMonth {
  product_id: string
  product_name: string
  image_url: string | null
  total_qty: number
  total_orders: number
  monthLabel: string
}

export async function getProductOfMonth(): Promise<ProductOfMonth | null> {
  // Mes anterior — del 1 al último día.
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  const monthLabel = start.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  })
  const { data: items } = await supabase
    .from("sale_items")
    .select(
      "product_id, product_name, qty, sales!inner(id, status, created_at)",
    )
    .gte("sales.created_at", start.toISOString())
    .lte("sales.created_at", end.toISOString())
    .neq("sales.status", "cancelled")
    .not("product_id", "is", null)
    .limit(5000)

  if (!items || items.length === 0) return null
  const byProduct = new Map<
    string,
    { name: string; qty: number; orders: Set<string> }
  >()
  for (const it of items as any[]) {
    if (!it.product_id) continue
    const e = byProduct.get(it.product_id) ?? {
      name: it.product_name ?? "Producto",
      qty: 0,
      orders: new Set<string>(),
    }
    e.qty += Number(it.qty || 0)
    e.orders.add(it.sales.id)
    byProduct.set(it.product_id, e)
  }
  const sorted = Array.from(byProduct.entries()).sort(
    (a, b) => b[1].qty - a[1].qty,
  )
  if (sorted.length === 0) return null
  const [winnerId, winner] = sorted[0]
  const { data: pRow } = await supabase
    .from("products")
    .select("image_url")
    .eq("id", winnerId)
    .maybeSingle()
  return {
    product_id: winnerId,
    product_name: winner.name,
    image_url: pRow?.image_url ?? null,
    total_qty: winner.qty,
    total_orders: winner.orders.size,
    monthLabel,
  }
}

/* ─────────── 4) Margen real por categoría ─────────── */

export interface CategoryMargin {
  category: string
  revenue: number
  cost: number
  profit: number
  items_sold: number
  margin_pct: number // 0..100
}

/**
 * Suma profit por categoría usando `sale_items.profit` (ya calculado al
 * momento de vender en `salesService.createSale`) joineado con
 * `products.category`. Sale en orden descendente por profit.
 *
 * Cubre solo ventas NO canceladas en la ventana de días dados.
 */
export async function getMarginByCategory(days = 30): Promise<CategoryMargin[]> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()

  const { data: items } = await supabase
    .from("sale_items")
    .select(
      "product_id, qty, unit_price, profit, sales!inner(status, created_at)",
    )
    .gte("sales.created_at", sinceIso)
    .neq("sales.status", "cancelled")
    .not("product_id", "is", null)
    .limit(10000)

  const list = (items ?? []) as any[]
  if (list.length === 0) return []

  // Trae las categorías de los productos involucrados.
  const productIds = Array.from(
    new Set(list.map((it) => it.product_id).filter(Boolean)),
  )
  if (productIds.length === 0) return []
  const { data: products } = await supabase
    .from("products")
    .select("id, category")
    .in("id", productIds)
  const catByProduct = new Map<string, string>()
  for (const p of (products ?? []) as any[]) {
    catByProduct.set(p.id, p.category || "Sin categoría")
  }

  const agg = new Map<
    string,
    { revenue: number; profit: number; qty: number }
  >()
  for (const it of list) {
    const cat = catByProduct.get(it.product_id) || "Sin categoría"
    const qty = Number(it.qty) || 0
    const unit = Number(it.unit_price) || 0
    const profit = Number(it.profit) || 0
    const e = agg.get(cat) ?? { revenue: 0, profit: 0, qty: 0 }
    e.revenue += qty * unit
    e.profit += profit
    e.qty += qty
    agg.set(cat, e)
  }

  return Array.from(agg.entries())
    .map(([category, e]) => {
      const cost = Math.max(0, e.revenue - e.profit)
      return {
        category,
        revenue: e.revenue,
        cost,
        profit: e.profit,
        items_sold: e.qty,
        margin_pct: e.revenue > 0 ? (e.profit / e.revenue) * 100 : 0,
      }
    })
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.profit - a.profit)
}

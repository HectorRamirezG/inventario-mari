import { supabase } from "../../lib/supabase"

export interface InsightProductMissingImage {
  id: string
  name: string
}

export interface InsightRestockHint {
  variant_id: string
  product_name: string
  variant_name: string | null
  stock: number
  sold_30d: number
  /** Días estimados de stock al ritmo actual de venta. */
  days_left: number
}

export interface InsightInactiveClient {
  email: string
  name: string | null
  last_purchase_at: string
  total_spent: number
  days_inactive: number
}

export interface InsightPeakHour {
  hour: number
  count: number
}

export interface InsightWeekDelta {
  thisWeek: number
  lastWeek: number
  pct: number
}

export interface InsightForecast {
  projected: number
  daysElapsed: number
  daysInMonth: number
  paceVsTarget: number | null
}

export interface InsightHeatmapCell {
  dow: number
  hour: number
  count: number
}

export interface InsightVip {
  email: string
  name: string | null
  total: number
  orders: number
}

export interface InsightAbcRow {
  product_id: string
  name: string
  revenue: number
  cumulativePct: number
  klass: "A" | "B" | "C"
}

export async function listProductsWithoutImage(limit = 50): Promise<InsightProductMissingImage[]> {
  const { data } = await supabase
    .from("products")
    .select("id,name,image_url")
    .eq("is_active", true)
    .or("image_url.is.null,image_url.eq.")
    .limit(limit)
  return ((data ?? []) as any[]).map((p) => ({ id: p.id, name: p.name }))
}

export async function getRestockHints(limit = 8): Promise<InsightRestockHint[]> {
  const since = new Date()
  since.setDate(since.getDate() - 30)
  // sale_items NO tiene columna `created_at` propia — la fecha de la venta
  // vive en `sales.created_at`. Hacemos un join con `!inner` para poder
  // filtrar por la fecha real de la venta (filtros sobre relaciones
  // requieren `!inner` en PostgREST).
  const { data: items, error: itemsErr } = await supabase
    .from("sale_items")
    .select("variant_id,qty,sales!inner(created_at,status)")
    .gte("sales.created_at", since.toISOString())
    .neq("sales.status", "cancelled")
    .limit(2000)
  if (itemsErr || !items) return []

  // Suma cantidad vendida por variante en el periodo.
  const qtyByVariant = new Map<string, number>()
  for (const it of items as any[]) {
    if (!it.variant_id) continue
    qtyByVariant.set(
      it.variant_id,
      (qtyByVariant.get(it.variant_id) ?? 0) + (Number(it.qty) || 0),
    )
  }
  if (qtyByVariant.size === 0) return []

  // Trae las variantes con su producto (esta relación SÍ está bien
  // declarada — ya la usamos en otros sitios sin problemas).
  const ids = Array.from(qtyByVariant.keys())
  const { data: vars } = await supabase
    .from("variants")
    .select("id,stock,variant_name,products(name)")
    .in("id", ids)
  if (!vars) return []

  const out: InsightRestockHint[] = []
  for (const v of vars as any[]) {
    const qty = qtyByVariant.get(v.id) ?? 0
    if (qty < 3) continue
    const stock = Number(v.stock) || 0
    const dailyRate = qty / 30
    const daysLeft = dailyRate > 0 ? Math.round(stock / dailyRate) : 999
    if (daysLeft > 14) continue
    out.push({
      variant_id: v.id,
      product_name: v.products?.name ?? "Producto",
      variant_name: v.variant_name ?? null,
      stock,
      sold_30d: qty,
      days_left: daysLeft,
    })
  }
  return out.sort((a, b) => a.days_left - b.days_left).slice(0, limit)
}

export async function getInactiveClients(thresholdDays = 60, limit = 8): Promise<InsightInactiveClient[]> {
  const { data } = await supabase
    .from("sales")
    .select("customer_email,customer_name,total,created_at")
    .not("customer_email", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000)
  if (!data) return []
  const map = new Map<string, InsightInactiveClient>()
  for (const s of data as any[]) {
    const email = String(s.customer_email).toLowerCase()
    const cur = map.get(email)
    const created = new Date(s.created_at)
    if (!cur) {
      map.set(email, {
        email,
        name: s.customer_name ?? null,
        last_purchase_at: s.created_at,
        total_spent: Number(s.total) || 0,
        days_inactive: Math.floor((Date.now() - created.getTime()) / 86400000),
      })
    } else {
      cur.total_spent += Number(s.total) || 0
      if (created.getTime() > new Date(cur.last_purchase_at).getTime()) {
        cur.last_purchase_at = s.created_at
        cur.days_inactive = Math.floor((Date.now() - created.getTime()) / 86400000)
      }
    }
  }
  return Array.from(map.values())
    .filter((c) => c.days_inactive >= thresholdDays)
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, limit)
}

export async function getPeakHours(days = 30): Promise<InsightPeakHour[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data } = await supabase
    .from("sales")
    .select("created_at")
    .gte("created_at", since.toISOString())
    .limit(5000)
  const buckets = new Array(24).fill(0)
  for (const s of (data ?? []) as any[]) {
    const h = new Date(s.created_at).getHours()
    buckets[h]++
  }
  return buckets.map((count, hour) => ({ hour, count }))
}

export async function getHeatmap(days = 30): Promise<InsightHeatmapCell[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data } = await supabase
    .from("sales")
    .select("created_at")
    .gte("created_at", since.toISOString())
    .limit(5000)
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const s of (data ?? []) as any[]) {
    const d = new Date(s.created_at)
    grid[d.getDay()][d.getHours()]++
  }
  const out: InsightHeatmapCell[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      out.push({ dow, hour, count: grid[dow][hour] })
    }
  }
  return out
}

export async function getWeekDelta(): Promise<InsightWeekDelta> {
  const now = new Date()
  const startThis = new Date(now)
  startThis.setDate(now.getDate() - 7)
  const startLast = new Date(startThis)
  startLast.setDate(startThis.getDate() - 7)
  const { data } = await supabase
    .from("sales")
    .select("total,created_at")
    .gte("created_at", startLast.toISOString())
    .lte("created_at", now.toISOString())
    .limit(5000)
  let tw = 0
  let lw = 0
  for (const s of (data ?? []) as any[]) {
    const t = Number(s.total) || 0
    const at = new Date(s.created_at)
    if (at >= startThis) tw += t
    else lw += t
  }
  const pct = lw > 0 ? ((tw - lw) / lw) * 100 : tw > 0 ? 100 : 0
  return { thisWeek: tw, lastWeek: lw, pct }
}

export async function getMonthForecast(target?: number): Promise<InsightForecast> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = Math.max(1, now.getDate())
  const { data } = await supabase
    .from("sales")
    .select("total")
    .gte("created_at", start.toISOString())
    .lte("created_at", now.toISOString())
    .limit(5000)
  const total = ((data ?? []) as any[]).reduce((a, s) => a + (Number(s.total) || 0), 0)
  const projected = (total / daysElapsed) * daysInMonth
  const paceVsTarget = target && target > 0 ? (projected / target) * 100 : null
  return { projected, daysElapsed, daysInMonth, paceVsTarget }
}

export async function getCLV(limit = 10): Promise<InsightVip[]> {
  const { data } = await supabase
    .from("sales")
    .select("customer_email,customer_name,total")
    .not("customer_email", "is", null)
    .limit(5000)
  if (!data) return []
  const map = new Map<string, InsightVip>()
  for (const s of data as any[]) {
    const email = String(s.customer_email).toLowerCase()
    const cur = map.get(email) ?? { email, name: s.customer_name ?? null, total: 0, orders: 0 }
    cur.total += Number(s.total) || 0
    cur.orders += 1
    if (!cur.name && s.customer_name) cur.name = s.customer_name
    map.set(email, cur)
  }
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

export async function getAbcAnalysis(): Promise<InsightAbcRow[]> {
  const { data } = await supabase
    .from("sale_items")
    .select("qty,unit_price,products(id,name)")
    .limit(5000)
  if (!data) return []
  const agg = new Map<string, { name: string; revenue: number }>()
  for (const it of data as any[]) {
    const p = it.products
    if (!p?.id) continue
    const rev = (Number(it.qty) || 0) * (Number(it.unit_price) || 0)
    const cur = agg.get(p.id) ?? { name: p.name, revenue: 0 }
    cur.revenue += rev
    agg.set(p.id, cur)
  }
  const rows = Array.from(agg.entries())
    .map(([product_id, v]) => ({ product_id, name: v.name, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
  const total = rows.reduce((a, r) => a + r.revenue, 0)
  let acc = 0
  return rows.map((r) => {
    acc += r.revenue
    const cumulativePct = total > 0 ? (acc / total) * 100 : 0
    const klass: "A" | "B" | "C" =
      cumulativePct <= 80 ? "A" : cumulativePct <= 95 ? "B" : "C"
    return { ...r, cumulativePct, klass }
  })
}

export async function getProductOfTheDay() {
  const { data } = await supabase
    .from("products")
    .select("id,name,image_url,variants(id,price_menudeo,price,stock,image_urls)")
    .eq("is_active", true)
    .limit(200)
  if (!data?.length) return null
  const candidates = (data as any[]).filter((p) => {
    const v = p.variants?.[0]
    return v && Number(v.stock) > 2
  })
  if (!candidates.length) return null
  const dayKey = new Date().toISOString().slice(0, 10)
  let hash = 0
  for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0
  const pick = candidates[hash % candidates.length]
  const v = pick.variants?.[0]
  return {
    id: pick.id as string,
    name: pick.name as string,
    image: (v?.image_urls?.[0] as string) ?? (pick.image_url as string | null) ?? null,
    price: Number(v?.price_menudeo ?? v?.price ?? 0),
  }
}

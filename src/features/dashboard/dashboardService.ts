import { supabase } from "../../lib/supabase";
import type { DashboardStats } from "./dashboardTypes";

/**
 * Helper para tomar el resultado de Promise.allSettled sin romper el
 * dashboard si una sub-query falla (RLS, columna inesperada, etc.).
 */
function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback
}

/**
 * Devuelve el rango ISO [start, end] del periodo "últimos N días" terminando
 * hoy a las 23:59:59 e iniciando hace N-1 días a las 00:00:00.
 */
function periodRange(days: number, endDate = new Date()): { start: string; end: string } {
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Genera N días hacia atrás con la "etiqueta corta" para el chart.
 * Ej: [{ date: "2026-06-10", label: "10 jun" }, ...]
 */
function lastNDays(days: number): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = []
  const fmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    out.push({
      date: d.toISOString().slice(0, 10),
      label: fmt.format(d).replace(/\./g, ""),
    })
  }
  return out
}

export async function getDashboardStats(periodDays = 30): Promise<DashboardStats> {
  // Umbral para "vencen en 5 días" — asumimos plazo de apartado = 30 días
  // desde created_at (no existe columna apartado_due_date en la DB real).
  // Un apartado "vence en 5 días" si created_at <= hoy - 25 días.
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 25)
  const cutoffIso = cutoff.toISOString()

  // Ventana actual y ventana anterior (mismo tamaño desplazado N días atrás)
  const current = periodRange(periodDays)
  const prevEnd = new Date(current.start)
  prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
  const prev = periodRange(periodDays, prevEnd)

  const results = await Promise.allSettled([
    // 0) total de productos activos
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
    // 1) total de variantes activas
    supabase.from("variants").select("*", { count: "exact", head: true }).eq("is_active", true),
    // 2) variantes para calcular stock bajo + valor inventario
    supabase
      .from("variants")
      .select(
        "id,stock,is_active,cost_override,products:products(min_stock,is_active,cost,category)"
      ),
    // 3) ventas del período actual (no canceladas)
    supabase
      .from("sales")
      .select("id,total,balance,paid,customer_name,status,is_layaway,created_at")
      .gte("created_at", current.start)
      .lte("created_at", current.end)
      .neq("status", "cancelled"),
    // 4) items del período actual con ganancia + categoría del producto
    supabase
      .from("sale_items")
      .select(
        "product_name,variant_id,variant_name,qty,unit_price,profit,sale_id,sales!inner(created_at,status),products:products(category)"
      )
      .gte("sales.created_at", current.start)
      .lte("sales.created_at", current.end)
      .neq("sales.status", "cancelled"),
    // 5) pendientes operativos: envíos
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("is_foreign_shipping", true)
      .eq("balance", 0)
      .neq("status", "cancelled"),
    // 6) apartados que vencen pronto
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("is_layaway", true)
      .gt("balance", 0)
      .lte("created_at", cutoffIso)
      .neq("status", "cancelled"),
    // 7) comprobantes pendientes
    supabase
      .from("payment_proofs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    // 8) ventas período anterior (para comparativa)
    supabase
      .from("sales")
      .select("id,total,created_at,status")
      .gte("created_at", prev.start)
      .lte("created_at", prev.end)
      .neq("status", "cancelled"),
    // 9) items período anterior (para ganancia anterior)
    supabase
      .from("sale_items")
      .select("profit,sales!inner(created_at,status)")
      .gte("sales.created_at", prev.start)
      .lte("sales.created_at", prev.end)
      .neq("sales.status", "cancelled"),
    // 10) pagos del período actual agrupados luego por método
    supabase
      .from("payments")
      .select("amount,method,created_at")
      .gte("created_at", current.start)
      .lte("created_at", current.end),
  ])

  const empty = { data: null as any, count: 0 }
  const pCount = settled(results[0] as any, empty)
  const vCount = settled(results[1] as any, empty)
  const inv = settled(results[2] as any, { data: [] as any[] } as any)
  const salesData = settled(results[3] as any, { data: [] as any[] } as any)
  const itemsData = settled(results[4] as any, { data: [] as any[] } as any)
  const shipments = settled(results[5] as any, empty)
  const dueLayaways = settled(results[6] as any, empty)
  const pendingProofs = settled(results[7] as any, empty)
  const prevSalesData = settled(results[8] as any, { data: [] as any[] } as any)
  const prevItemsData = settled(results[9] as any, { data: [] as any[] } as any)
  const paymentsData = settled(results[10] as any, { data: [] as any[] } as any)

  // ─────────── Stock bajo + valor inventario ───────────
  let lowStockCount = 0
  let inventoryValue = 0
  for (const x of (inv.data as any[]) ?? []) {
    if (!x.is_active || !x.products?.is_active) continue
    const stk = Number(x.stock) || 0
    const cost = Number(x.cost_override ?? x.products?.cost ?? 0) || 0
    inventoryValue += stk * cost
    if (stk <= Number(x.products?.min_stock ?? 0)) lowStockCount += 1
  }

  // ─────────── KPIs del período actual ───────────
  // revenue = total VENDIDO (incluye apartados sin liquidar).
  // collected = dinero REALMENTE recibido (sum de paid). Mari pedía
  // distinguir ambas porque "$X de ingresos" sonaba a $X en mano cuando
  // en realidad podían ser apartados con balance.
  const revenue = (salesData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.total) || 0),
    0
  )
  const collected = (salesData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.paid) || 0),
    0
  )
  const pending = (salesData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.balance) || 0),
    0
  )
  const profit = (itemsData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.profit) || 0),
    0
  )
  const operations = salesData.data?.length ?? 0

  // ─────────── Período anterior (comparativa) ───────────
  const prevRevenue = (prevSalesData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.total) || 0),
    0
  )
  const prevProfit = (prevItemsData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.profit) || 0),
    0
  )
  const prevOperations = prevSalesData.data?.length ?? 0

  // ─────────── Top productos del período ───────────
  const byProduct = new Map<string, number>()
  ;(itemsData.data ?? []).forEach((i: any) => {
    byProduct.set(i.product_name, (byProduct.get(i.product_name) ?? 0) + Number(i.qty))
  })
  const top = Array.from(byProduct.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // ─────────── Categorías más vendidas ───────────
  const byCategory = new Map<string, { qty: number; revenue: number }>()
  ;(itemsData.data ?? []).forEach((i: any) => {
    const cat = (i.products?.category as string | null) ?? "Sin categoría"
    const cur = byCategory.get(cat) ?? { qty: 0, revenue: 0 }
    cur.qty += Number(i.qty) || 0
    cur.revenue += (Number(i.qty) || 0) * (Number(i.unit_price) || 0)
    byCategory.set(cat, cur)
  })
  const topCategories = Array.from(byCategory.entries())
    .map(([category, v]) => ({ category, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // ─────────── Top clientes del período ───────────
  const byCustomer = new Map<string, { total: number; orders: number }>()
  ;(salesData.data ?? []).forEach((s: any) => {
    const name = (s.customer_name as string | null)?.trim() || "Sin nombre"
    const cur = byCustomer.get(name) ?? { total: 0, orders: 0 }
    cur.total += Number(s.total) || 0
    cur.orders += 1
    byCustomer.set(name, cur)
  })
  const topCustomers = Array.from(byCustomer.entries())
    .map(([name, v]) => ({ name, total: v.total, orders: v.orders }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  // ─────────── Métodos de pago ───────────
  const byMethod = new Map<string, { amount: number; count: number }>()
  ;(paymentsData.data ?? []).forEach((p: any) => {
    const m = (p.method as string | null)?.trim() || "efectivo"
    const cur = byMethod.get(m) ?? { amount: 0, count: 0 }
    cur.amount += Number(p.amount) || 0
    cur.count += 1
    byMethod.set(m, cur)
  })
  const paymentMethods = Array.from(byMethod.entries())
    .map(([method, v]) => ({ method, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount)

  // ─────────── Tendencia diaria ───────────
  const days = lastNDays(periodDays)
  const dayRevenue = new Map<string, number>()
  const dayOps = new Map<string, number>()
  ;(salesData.data ?? []).forEach((s: any) => {
    const d = String(s.created_at).slice(0, 10)
    dayRevenue.set(d, (dayRevenue.get(d) ?? 0) + (Number(s.total) || 0))
    dayOps.set(d, (dayOps.get(d) ?? 0) + 1)
  })
  const dayProfit = new Map<string, number>()
  ;(itemsData.data ?? []).forEach((i: any) => {
    const created = (i.sales?.created_at as string | null) ?? ""
    if (!created) return
    const d = created.slice(0, 10)
    dayProfit.set(d, (dayProfit.get(d) ?? 0) + (Number(i.profit) || 0))
  })
  const trend = days.map((d) => ({
    date: d.date,
    label: d.label,
    revenue: Math.round((dayRevenue.get(d.date) ?? 0) * 100) / 100,
    profit: Math.round((dayProfit.get(d.date) ?? 0) * 100) / 100,
    operations: dayOps.get(d.date) ?? 0,
  }))

  const soldByVariant = new Map<string, { qty: number; productName: string; variantName: string }>()
  ;(itemsData.data ?? []).forEach((i: any) => {
    const vid = i.variant_id as string | null
    if (!vid) return
    const cur = soldByVariant.get(vid) ?? {
      qty: 0,
      productName: String(i.product_name ?? ""),
      variantName: String(i.variant_name ?? ""),
    }
    cur.qty += Number(i.qty) || 0
    soldByVariant.set(vid, cur)
  })
  const stockByVariant = new Map<string, number>()
  for (const v of (inv.data as any[]) ?? []) {
    if (!v.is_active || !v.products?.is_active) continue
    if (typeof v.id === "string") stockByVariant.set(v.id, Number(v.stock) || 0)
  }
  const stockoutRisk: DashboardStats["stockoutRisk"] = []
  for (const [vid, info] of soldByVariant.entries()) {
    const stock = stockByVariant.get(vid)
    if (stock === undefined || stock <= 0) continue
    const perDay = info.qty / periodDays
    if (perDay <= 0) continue
    const days = stock / perDay
    if (days <= 14) {
      stockoutRisk.push({
        variantId: vid,
        productName: info.productName,
        variantName: info.variantName,
        stock,
        daysUntilStockout: Math.round(days * 10) / 10,
        soldPerDay: Math.round(perDay * 10) / 10,
      })
    }
  }
  stockoutRisk.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)

  return {
    products: pCount.count ?? 0,
    variants: vCount.count ?? 0,
    lowStock: lowStockCount,
    revenue,
    collected,
    profit,
    pending,
    operations,
    top,
    pendingShipments: shipments.count ?? 0,
    dueLayaways: dueLayaways.count ?? 0,
    pendingProofs: pendingProofs.count ?? 0,
    prevRevenue,
    prevProfit,
    prevOperations,
    trend,
    paymentMethods,
    topCustomers,
    topCategories,
    inventoryValue,
    stockoutRisk: stockoutRisk.slice(0, 8),
  }
}

export const getSalesStats = getDashboardStats;


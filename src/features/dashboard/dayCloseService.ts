import { supabase } from "../../lib/supabase"

export interface DayCloseStats {
  date: string // YYYY-MM-DD
  sales_count: number
  layaway_count: number
  cancelled_count: number
  revenue: number
  paid_today: number
  pending_today: number
  profit: number
  /** Promedio: revenue / sales_count */
  ticket_avg: number
  payment_methods: Record<string, number>
  top_products: { name: string; qty: number; revenue: number }[]
  top_customers: { name: string; total: number }[]
}

function startOfDayISO(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
function endOfDayISO(date = new Date()) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

export async function getDayCloseStats(date = new Date()): Promise<DayCloseStats> {
  const from = startOfDayISO(date)
  const to = endOfDayISO(date)
  const dateLabel = from.slice(0, 10)

  // Pedimos en paralelo lo mínimo necesario
  const [salesRes, itemsRes, paymentsRes] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, customer_name, total, paid, balance, status, is_layaway, created_at"
      )
      .gte("created_at", from)
      .lte("created_at", to),
    supabase
      .from("sale_items")
      .select("product_name, qty, unit_price, profit, sale_id, sales!inner(created_at)")
      .gte("sales.created_at", from)
      .lte("sales.created_at", to),
    supabase
      .from("payments")
      .select("amount, method, created_at")
      .gte("created_at", from)
      .lte("created_at", to),
  ])

  const sales = (salesRes.data ?? []) as any[]
  const items = (itemsRes.data ?? []) as any[]
  const payments = (paymentsRes.data ?? []) as any[]

  // ── KPIs base ────────────────────────────────────────────────
  let sales_count = 0
  let layaway_count = 0
  let cancelled_count = 0
  let revenue = 0
  let pending_today = 0

  for (const s of sales) {
    if (s.status === "cancelled") {
      cancelled_count += 1
      continue
    }
    sales_count += 1
    if (s.is_layaway) layaway_count += 1
    revenue += Number(s.total) || 0
    pending_today += Number(s.balance) || 0
  }

  let profit = 0
  for (const it of items) {
    profit += Number(it.profit) || 0
  }

  // ── Pagos por método (incluye abonos posteriores que cayeron hoy) ──
  const payment_methods: Record<string, number> = {}
  let paid_today = 0
  for (const p of payments) {
    const m = (p.method ?? "efectivo").toString()
    const amt = Number(p.amount) || 0
    paid_today += amt
    payment_methods[m] = (payment_methods[m] ?? 0) + amt
  }

  // ── Top productos del día ────────────────────────────────────
  const byProduct = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const it of items) {
    const name = it.product_name ?? "—"
    const qty = Number(it.qty) || 0
    const r = qty * (Number(it.unit_price) || 0)
    const cur = byProduct.get(name)
    if (cur) {
      cur.qty += qty
      cur.revenue += r
    } else {
      byProduct.set(name, { name, qty, revenue: r })
    }
  }
  const top_products = Array.from(byProduct.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  // ── Top clientes ─────────────────────────────────────────────
  const byCustomer = new Map<string, { name: string; total: number }>()
  for (const s of sales) {
    if (s.status === "cancelled" || !s.customer_name) continue
    const name = s.customer_name as string
    const cur = byCustomer.get(name)
    const tot = Number(s.total) || 0
    if (cur) cur.total += tot
    else byCustomer.set(name, { name, total: tot })
  }
  const top_customers = Array.from(byCustomer.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  return {
    date: dateLabel,
    sales_count,
    layaway_count,
    cancelled_count,
    revenue,
    paid_today,
    pending_today,
    profit,
    ticket_avg: sales_count > 0 ? revenue / sales_count : 0,
    payment_methods,
    top_products,
    top_customers,
  }
}

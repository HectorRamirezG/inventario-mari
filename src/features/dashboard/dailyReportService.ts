import { supabase } from "../../lib/supabase"

export interface DailyReport {
  date: string
  /** Fecha legible (ej: "viernes 19 de junio"). */
  prettyDate: string
  /** Ventas totales del día (no canceladas). */
  salesCount: number
  /** Ingresos cobrados HOY (paid sum de ventas creadas hoy). */
  revenue: number
  /** Pendientes (balance > 0 de ventas creadas hoy). */
  pending: number
  /** Ticket promedio del día. */
  ticketAvg: number
  /** Top 3 productos del día por cantidad vendida. */
  topItems: Array<{ name: string; qty: number }>
  /** Cantidad de comprobantes que llegaron HOY y siguen pendientes. */
  pendingProofs: number
}

/** Rango ISO [start, end] del día indicado en hora LOCAL. Default = hoy. */
function dayRange(d = new Date()): { startIso: string; endIso: string } {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const end = new Date(d)
  end.setHours(23, 59, 59, 999)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

/**
 * Construye un resumen "del día" usando 3 queries livianas en paralelo.
 * No mete datos extras (no margen, no clientes nuevos) — el objetivo es
 * 1 sólo mensaje compartible, no un dashboard.
 */
export async function getDailyReport(date = new Date()): Promise<DailyReport> {
  const { startIso, endIso } = dayRange(date)
  const prettyDate = date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  const [salesRes, itemsRes, proofsRes] = await Promise.allSettled([
    supabase
      .from("sales")
      .select("id,total,paid,balance,status")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .neq("status", "cancelled"),
    supabase
      .from("sale_items")
      .select("product_name,qty,sales!inner(created_at,status)")
      .gte("sales.created_at", startIso)
      .lte("sales.created_at", endIso)
      .neq("sales.status", "cancelled"),
    supabase
      .from("payment_proofs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ])

  const sales =
    salesRes.status === "fulfilled" ? (salesRes.value.data ?? []) : []
  const items =
    itemsRes.status === "fulfilled" ? (itemsRes.value.data ?? []) : []
  const pendingProofs =
    proofsRes.status === "fulfilled" ? (proofsRes.value.count ?? 0) : 0

  const salesCount = sales.length
  const revenue = sales.reduce((acc: number, s: any) => acc + Number(s.paid ?? 0), 0)
  const pending = sales.reduce(
    (acc: number, s: any) => acc + Number(s.balance ?? 0),
    0,
  )
  const ticketAvg = salesCount > 0 ? revenue / salesCount : 0

  // Top items por cantidad acumulada.
  const itemMap = new Map<string, number>()
  for (const it of items as any[]) {
    const name = (it.product_name as string) ?? "Sin nombre"
    itemMap.set(name, (itemMap.get(name) ?? 0) + Number(it.qty ?? 0))
  }
  const topItems = Array.from(itemMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, qty]) => ({ name, qty }))

  return {
    date: startIso.slice(0, 10),
    prettyDate,
    salesCount,
    revenue,
    pending,
    ticketAvg,
    topItems,
    pendingProofs,
  }
}

/** Mensaje de WhatsApp con emojis sutiles y formato leíble. */
export function buildDailyReportText(
  report: DailyReport,
  storeName = "Beauty's Me",
): string {
  const fmt = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
  const lines: string[] = []
  lines.push(`*${storeName}* · Reporte de ${report.prettyDate}`)
  lines.push("")
  lines.push(`🧾 Ventas: *${report.salesCount}*`)
  lines.push(`💵 Ingresos: *${fmt(report.revenue)}*`)
  if (report.pending > 0) lines.push(`⏳ Por cobrar: ${fmt(report.pending)}`)
  if (report.ticketAvg > 0) lines.push(`🎯 Ticket promedio: ${fmt(report.ticketAvg)}`)
  if (report.pendingProofs > 0)
    lines.push(`📎 Comprobantes por revisar: ${report.pendingProofs}`)
  if (report.topItems.length > 0) {
    lines.push("")
    lines.push("🏆 *Más vendidos hoy:*")
    report.topItems.forEach((it, i) => {
      lines.push(`${i + 1}. ${it.name} × ${it.qty}`)
    })
  }
  if (report.salesCount === 0) {
    lines.push("")
    lines.push("Hoy no hubo ventas registradas. ¡Mañana arrancamos fuerte! ✨")
  }
  return lines.join("\n")
}

/**
 * walletService — "Mi Monedero" del cliente.
 *
 * Centraliza las queries del dashboard financiero:
 *   - Pedidos con saldo pendiente (ordenados por vencimiento próximo)
 *   - Pagos recientes (historial)
 *   - Resumen agregado (cuánto debe, cuánto ha pagado)
 *
 * Convención: el plazo de apartado es 30 días desde `sales.created_at`
 * (no existe columna `due_date` en BD — ver memoria repo).
 */
import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

/** Pedido con saldo pendiente para mostrar en monedero. */
export interface WalletOutstandingOrder {
  sale_id: string
  total: number
  paid: number
  balance: number
  created_at: string
  /** Días restantes para liquidar (negativo si ya vencido). */
  daysUntilDue: number
  is_layaway: boolean
  public_token: string | null
}

/** Pago hecho por el cliente (historial). */
export interface WalletPayment {
  id: string
  sale_id: string
  amount: number
  method: string | null
  created_at: string
}

/** Resumen agregado del monedero. */
export interface WalletSummary {
  totalPending: number
  totalPaidLifetime: number
  ordersWithBalance: number
  upcomingDueSoon: number // pedidos que vencen en ≤7 días
  overdueCount: number    // pedidos vencidos (daysUntilDue < 0)
}

const LAYAWAY_GRACE_DAYS = 30

/** Calcula días hasta vencer (negativo si ya vencio). */
function daysUntilDue(createdAtIso: string): number {
  const created = new Date(createdAtIso).getTime()
  if (!created) return 999
  const dueAt = created + LAYAWAY_GRACE_DAYS * 24 * 3600 * 1000
  return Math.floor((dueAt - Date.now()) / (24 * 3600 * 1000))
}

/**
 * Pedidos del cliente con balance > 0 (activos, no cancelados).
 * Ordenados por vencimiento más próximo primero (los vencidos arriba).
 */
export async function listOutstandingOrders(
  email: string,
): Promise<WalletOutstandingOrder[]> {
  if (!email) return []
  try {
    const { data, error } = await supabase
      .from("sales")
      .select("id, total, paid, status, is_layaway, created_at, public_token")
      .ilike("customer_email", email.trim())
      .neq("status", "cancelled")
      .order("created_at", { ascending: true })
      .limit(50)
    if (error) throw error
    const rows = (data ?? []) as Array<{
      id: string
      total: number | null
      paid: number | null
      status: string
      is_layaway: boolean | null
      created_at: string
      public_token: string | null
    }>
    const out: WalletOutstandingOrder[] = []
    for (const r of rows) {
      const total = Number(r.total) || 0
      const paid = Number(r.paid) || 0
      const balance = Math.max(0, total - paid)
      if (balance <= 0) continue
      out.push({
        sale_id: r.id,
        total,
        paid,
        balance,
        created_at: r.created_at,
        daysUntilDue: daysUntilDue(r.created_at),
        is_layaway: !!r.is_layaway,
        public_token: r.public_token,
      })
    }
    // Vencidos primero (daysUntilDue ascendente = más negativos arriba).
    out.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    return out
  } catch (e: any) {
    debug.warn("[wallet] listOutstandingOrders", e?.message)
    return []
  }
}

/**
 * Historial de pagos del cliente. Trae pagos asociados a sus ventas
 * (cualquier estado), ordenados por fecha desc.
 */
export async function listRecentPayments(
  email: string,
  limit = 30,
): Promise<WalletPayment[]> {
  if (!email) return []
  try {
    // Primero traemos los sale_ids del cliente para filtrar payments.
    const { data: salesData } = await supabase
      .from("sales")
      .select("id")
      .ilike("customer_email", email.trim())
      .limit(200)
    const saleIds = ((salesData ?? []) as Array<{ id: string }>).map((s) => s.id)
    if (saleIds.length === 0) return []

    const { data, error } = await supabase
      .from("payments")
      .select("id, sale_id, amount, method, created_at")
      .in("sale_id", saleIds)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return ((data ?? []) as WalletPayment[]) ?? []
  } catch (e: any) {
    debug.warn("[wallet] listRecentPayments", e?.message)
    return []
  }
}

/**
 * Resumen agregado del monedero. Lee ambas queries (eficiente porque
 * vienen del mismo customer_email).
 */
export async function getWalletSummary(email: string): Promise<WalletSummary> {
  const empty: WalletSummary = {
    totalPending: 0,
    totalPaidLifetime: 0,
    ordersWithBalance: 0,
    upcomingDueSoon: 0,
    overdueCount: 0,
  }
  if (!email) return empty
  try {
    const orders = await listOutstandingOrders(email)
    const totalPending = orders.reduce((s, o) => s + o.balance, 0)
    const upcomingDueSoon = orders.filter(
      (o) => o.daysUntilDue >= 0 && o.daysUntilDue <= 7,
    ).length
    const overdueCount = orders.filter((o) => o.daysUntilDue < 0).length

    // Total pagado de toda la vida: suma de `paid` de todos los pedidos
    // (incluso los liquidados).
    const { data: allSales } = await supabase
      .from("sales")
      .select("paid")
      .ilike("customer_email", email.trim())
      .neq("status", "cancelled")
      .limit(500)
    const totalPaidLifetime = ((allSales ?? []) as Array<{ paid: number | null }>).reduce(
      (s, r) => s + (Number(r.paid) || 0),
      0,
    )

    return {
      totalPending,
      totalPaidLifetime,
      ordersWithBalance: orders.length,
      upcomingDueSoon,
      overdueCount,
    }
  } catch (e: any) {
    debug.warn("[wallet] getWalletSummary", e?.message)
    return empty
  }
}

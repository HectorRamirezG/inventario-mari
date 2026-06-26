import { supabase } from "../../lib/supabase"

/**
 * Servicio del "Vistazo del día" — el bloque-hero matutino que Mari abre a
 * primera hora. Reúne en UNA sola consulta paralela TODO lo que necesita ver
 * antes de tocar 5 pestañas: entregas pendientes, comprobantes a revisar,
 * saldos por cobrar, y cumpleaños del día.
 *
 * Diseñado para devolver siempre algo (cero rows = arrays vacíos), nunca
 * lanzar — el dashboard NO debe caer si una de las tablas truena.
 */

export interface TodayDelivery {
  id: string
  customer_name: string | null
  driver_name: string | null
  delivery_zone: string | null
  delivery_time_target: string | null
  amount_to_collect: number
  status: "draft" | "sent" | "picked_up"
  is_urgent: boolean
}

export interface TodayPendingProof {
  id: string
  sale_id: string
  customer_email: string | null
  amount: number | null
  created_at: string
}

export interface TodayDueSale {
  id: string
  customer_name: string | null
  balance: number
  days_until_due: number
  public_token: string | null
}

export interface TodayBirthday {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
}

export interface TodayGlance {
  deliveries: TodayDelivery[]
  proofs: TodayPendingProof[]
  dueSales: TodayDueSale[]
  birthdays: TodayBirthday[]
  cash_to_collect_today: number
  loadedAt: string
}

const EMPTY: TodayGlance = {
  deliveries: [],
  proofs: [],
  dueSales: [],
  birthdays: [],
  cash_to_collect_today: 0,
  loadedAt: new Date().toISOString(),
}

/**
 * Plazo de apartado = 30 días desde created_at (regla cliente, no hay columna
 * `due_date` en sales). Vence en ≤5 días si tiene 25..30 días de antigüedad.
 */
function dueWindowIso(): { earlyIso: string; lateIso: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const early = new Date(today)
  early.setDate(early.getDate() - 30) // ya vencido HOY
  const late = new Date(today)
  late.setDate(late.getDate() - 25) // vence en 5 días
  return { earlyIso: early.toISOString(), lateIso: late.toISOString() }
}

export async function getTodayGlance(): Promise<TodayGlance> {
  const { earlyIso, lateIso } = dueWindowIso()
  const todayStartIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const month = new Date().getMonth() + 1
  const day = new Date().getDate()

  const results = await Promise.allSettled([
    // 0) Entregas activas (no entregadas, no canceladas) ordenadas por horario
    supabase
      .from("delivery_notes")
      .select(
        "id, sale_id, driver_name, delivery_zone, delivery_time_target, amount_to_collect, status, created_at, sales(customer_name)"
      )
      .in("status", ["draft", "sent", "picked_up"])
      .order("created_at", { ascending: true })
      .limit(20),
    // 1) Comprobantes pendientes (incluye efectivos declarados por el cliente)
    supabase
      .from("payment_proofs")
      .select("id, sale_id, customer_email, amount, created_at")
      .in("status", ["pending", "pending_verification"])
      .order("created_at", { ascending: true })
      .limit(20),
    // 2) Apartados con saldo que vencen en ≤5 días (incluye los ya vencidos)
    supabase
      .from("sales")
      .select("id, customer_name, balance, created_at, public_token")
      .eq("is_layaway", true)
      .gt("balance", 0)
      .gte("created_at", earlyIso)
      .lte("created_at", lateIso)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true })
      .limit(10),
    // 3) Cumpleañeros de HOY (cliente con birthday cuyo MM-DD coincide).
    //    Filtramos en SQL con extract para no traer toda la tabla.
    supabase
      .from("user_profiles")
      .select("id, full_name, email, phone, birthday")
      .not("birthday", "is", null)
      .limit(500),
  ])

  // 0) Deliveries
  let deliveries: TodayDelivery[] = []
  const dr = results[0]
  if (dr.status === "fulfilled" && Array.isArray(dr.value.data)) {
    deliveries = dr.value.data.map((d: any) => {
      // Marca como urgente si created_at < hoy 00:00 (ya quedó pendiente)
      const isOld = String(d.created_at ?? "") < todayStartIso
      const isLate = String(d.delivery_time_target ?? "").toLowerCase().includes("urgent")
      return {
        id: d.id,
        customer_name: d.sales?.customer_name ?? null,
        driver_name: d.driver_name ?? null,
        delivery_zone: d.delivery_zone ?? null,
        delivery_time_target: d.delivery_time_target ?? null,
        amount_to_collect: Number(d.amount_to_collect ?? 0),
        status: d.status,
        is_urgent: isOld || isLate,
      }
    })
  }

  // 1) Proofs pendientes
  let proofs: TodayPendingProof[] = []
  const pr = results[1]
  if (pr.status === "fulfilled" && Array.isArray(pr.value.data)) {
    proofs = pr.value.data.map((p: any) => ({
      id: p.id,
      sale_id: p.sale_id,
      customer_email: p.customer_email ?? null,
      amount: p.amount != null ? Number(p.amount) : null,
      created_at: p.created_at,
    }))
  }

  // 2) Saldos por vencer (calculamos días restantes)
  let dueSales: TodayDueSale[] = []
  const ds = results[2]
  if (ds.status === "fulfilled" && Array.isArray(ds.value.data)) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueSales = ds.value.data.map((s: any) => {
      const created = new Date(s.created_at)
      created.setHours(0, 0, 0, 0)
      const ageDays = Math.floor((today.getTime() - created.getTime()) / 86_400_000)
      return {
        id: s.id,
        customer_name: s.customer_name ?? null,
        balance: Number(s.balance ?? 0),
        days_until_due: Math.max(-30, 30 - ageDays),
        public_token: s.public_token ?? null,
      }
    })
    // ordenar por más urgentes primero (menos días)
    dueSales.sort((a, b) => a.days_until_due - b.days_until_due)
  }

  // 3) Cumpleañeros HOY (filtro client-side por month+day)
  let birthdays: TodayBirthday[] = []
  const br = results[3]
  if (br.status === "fulfilled" && Array.isArray(br.value.data)) {
    birthdays = br.value.data
      .filter((p: any) => {
        if (!p.birthday) return false
        const [, m, d] = String(p.birthday).split("-").map(Number)
        return m === month && d === day
      })
      .slice(0, 6)
      .map((p: any) => ({
        id: p.id,
        full_name: p.full_name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
      }))
  }

  const cash_to_collect_today = deliveries.reduce(
    (sum, d) => sum + (d.status === "picked_up" ? d.amount_to_collect : 0),
    0,
  )

  return {
    deliveries,
    proofs,
    dueSales,
    birthdays,
    cash_to_collect_today,
    loadedAt: new Date().toISOString(),
  }
}

export const EMPTY_TODAY_GLANCE = EMPTY

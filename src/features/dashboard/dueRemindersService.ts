import { supabase } from "../../lib/supabase"
import type { Sale } from "../../types/database"

export interface DueReminder {
  sale: Sale
  /** Días restantes para vencer (negativo si ya venció). */
  daysLeft: number
  /** Si ya se le mandó recordatorio HOY desde este dispositivo. */
  remindedToday: boolean
}

// Asumimos plazo de apartado = 30 días desde created_at (no hay
// columna `due_date` en la DB real — ver memory inventario-mari).
const APARTADO_DURATION_DAYS = 30

function ymd(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function reminderKey(saleId: string, date = new Date()): string {
  return `mari:reminded:${saleId}:${ymd(date)}`
}

/** Marca el recordatorio enviado hoy para que la card no lo vuelva a destacar. */
export function markReminderSent(saleId: string): void {
  try {
    localStorage.setItem(reminderKey(saleId), "1")
    window.dispatchEvent(new CustomEvent("mari:due-reminder-sent"))
  } catch {
    /* localStorage lleno o privado: ignoramos */
  }
}

function wasRemindedToday(saleId: string): boolean {
  try {
    return localStorage.getItem(reminderKey(saleId)) === "1"
  } catch {
    return false
  }
}

/**
 * Trae apartados (sale.is_layaway o sale.balance>0) cuya fecha de
 * vencimiento cae dentro de `daysAhead` días (o ya venció hace
 * hasta `gracePastDays`). No incluye cancelados ni pagados.
 *
 * El ordenamiento prioriza los más urgentes (menos daysLeft primero).
 */
export async function getDueReminders(
  daysAhead = 5,
  gracePastDays = 2,
): Promise<DueReminder[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Apartados creados entre estos límites están "cerca de vencer":
  //   minCreated = today - (DURATION + gracePastDays) → ya venció
  //   maxCreated = today - (DURATION - daysAhead)    → vence en daysAhead
  const minCreated = new Date(today)
  minCreated.setDate(minCreated.getDate() - (APARTADO_DURATION_DAYS + gracePastDays))
  const maxCreated = new Date(today)
  maxCreated.setDate(maxCreated.getDate() - (APARTADO_DURATION_DAYS - daysAhead))

  const { data, error } = await supabase
    .from("sales")
    .select(
      "id,total,paid,balance,status,is_layaway,created_at,public_token,customer_name,customer_email,customer_phone,is_foreign_shipping",
    )
    .gt("balance", 0)
    .neq("status", "cancelled")
    .gte("created_at", minCreated.toISOString())
    .lte("created_at", maxCreated.toISOString())
    .order("created_at", { ascending: true })
    .limit(40)

  if (error) return []
  const list = (data ?? []) as Sale[]

  return list.map((sale) => {
    const created = new Date(sale.created_at)
    created.setHours(0, 0, 0, 0)
    const daysSince = Math.round(
      (today.getTime() - created.getTime()) / 86_400_000,
    )
    const daysLeft = APARTADO_DURATION_DAYS - daysSince
    return {
      sale,
      daysLeft,
      remindedToday: wasRemindedToday(sale.id),
    }
  })
}

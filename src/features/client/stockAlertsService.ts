import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

/**
 * Cliente del sistema "Avísame cuando llegue stock".
 *
 * El cliente puede suscribirse a una variante sin stock; cuando Mari
 * agrega inventario (trigger SQL), todos los suscritos reciben una
 * notificación in-app y se marca su alerta como notificada.
 *
 * Las funciones son best-effort: si la tabla o RPC no existen todavía
 * (Mari aún no corrió `fix_stock_alerts.sql`), devuelven false/0 y la
 * UI muestra mensajes amigables sin romperse.
 */

/** Suscribe un email a una variante. Devuelve true si OK. */
export async function subscribeStockAlert(
  variantId: string,
  email: string,
  name?: string | null,
): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail || !cleanEmail.includes("@")) return false
  const { error } = await supabase.rpc("subscribe_stock_alert", {
    p_variant_id: variantId,
    p_email: cleanEmail,
    p_name: name?.trim() || null,
  })
  if (error) {
    debug.warn("[stock-alerts] subscribe:", error.message)
    return false
  }
  return true
}

/** Desuscribe email + variante. */
export async function unsubscribeStockAlert(
  variantId: string,
  email: string,
): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) return false
  const { error } = await supabase.rpc("unsubscribe_stock_alert", {
    p_variant_id: variantId,
    p_email: cleanEmail,
  })
  if (error) {
    debug.warn("[stock-alerts] unsubscribe:", error.message)
    return false
  }
  return true
}

/** Lee si el email actual tiene una alerta pendiente para esa variante.
 *  Devuelve `false` si la tabla aún no existe — el cliente puede
 *  intentar suscribirse igual. */
export async function isSubscribedToStock(
  variantId: string,
  email: string,
): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail) return false
  const { data, error } = await supabase
    .from("stock_alerts")
    .select("id", { head: true, count: "exact" })
    .eq("variant_id", variantId)
    .eq("customer_email", cleanEmail)
    .is("notified_at", null)
    .limit(1)
  if (error) {
    if (!/does not exist|not found|404/i.test(error.message)) {
      debug.warn("[stock-alerts] isSubscribed:", error.message)
    }
    return false
  }
  return Array.isArray(data) && data.length > 0
}

/** Conteo total de suscriptores PENDIENTES por variante (admin lo usa
 *  para saber cuánta demanda hay reprimida). Tolerante a tabla
 *  faltante: devuelve 0. */
export async function countPendingStockAlerts(
  variantId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("stock_alerts")
    .select("id", { count: "exact", head: true })
    .eq("variant_id", variantId)
    .is("notified_at", null)
  if (error) return 0
  return count ?? 0
}

/** Conteo agrupado por variant_id para TODAS las variantes de un producto.
 *  Una sola query — más barato que llamar `countPendingStockAlerts` N veces.
 *  Devuelve un `Record<variantId, number>` con SOLO las variantes que
 *  tienen al menos 1 suscriptor pendiente. Tolerante a tabla faltante. */
export async function getPendingStockAlertsByProduct(
  productId: string,
): Promise<Record<string, number>> {
  // Primero obtenemos los variant ids del producto (solo activos).
  const { data: variants, error: vErr } = await supabase
    .from("variants")
    .select("id")
    .eq("product_id", productId)
  if (vErr || !variants || variants.length === 0) return {}

  const ids = (variants as Array<{ id: string }>).map((v) => v.id)

  const { data, error } = await supabase
    .from("stock_alerts")
    .select("variant_id")
    .in("variant_id", ids)
    .is("notified_at", null)
  if (error || !data) return {}

  const counts: Record<string, number> = {}
  for (const row of data as Array<{ variant_id: string }>) {
    if (!row.variant_id) continue
    counts[row.variant_id] = (counts[row.variant_id] ?? 0) + 1
  }
  return counts
}

/** Suscriptor a "Avísame cuando llegue" para una variante específica.
 *  Lo usa el drawer admin para listar quién está esperando y mandar
 *  WhatsApp manual si conviene. */
export interface StockSubscriber {
  id: string
  email: string
  name: string | null
  created_at: string
  /** Teléfono opcional — si el cliente está en `user_profiles` lo
   *  rescatamos para poder mandarle WhatsApp directo. */
  phone: string | null
}

/** Lista los suscriptores pendientes (no notificados) de UNA variante,
 *  incluyendo teléfono si está en user_profiles. Tolerante a tabla
 *  faltante. Orden: más recientes primero. */
export async function listStockSubscribers(
  variantId: string,
): Promise<StockSubscriber[]> {
  const { data, error } = await supabase
    .from("stock_alerts")
    .select("id,customer_email,customer_name,created_at")
    .eq("variant_id", variantId)
    .is("notified_at", null)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error || !data) return []
  const rows = data as Array<{
    id: string
    customer_email: string
    customer_name: string | null
    created_at: string
  }>
  if (rows.length === 0) return []

  // Best-effort fetch de teléfono desde user_profiles para los emails
  // que conozcamos. Si no hay match, queda null y el botón WhatsApp se
  // oculta para esa fila.
  const emails = rows.map((r) => r.customer_email.toLowerCase())
  const phoneByEmail = new Map<string, string>()
  try {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("email,phone")
      .in("email", emails)
    if (profiles) {
      for (const p of profiles as Array<{ email: string; phone: string | null }>) {
        const k = p.email?.toLowerCase().trim()
        const ph = p.phone?.trim()
        if (k && ph) phoneByEmail.set(k, ph)
      }
    }
  } catch {
    /* noop */
  }

  return rows.map((r) => ({
    id: r.id,
    email: r.customer_email,
    name: r.customer_name,
    created_at: r.created_at,
    phone: phoneByEmail.get(r.customer_email.toLowerCase()) ?? null,
  }))
}

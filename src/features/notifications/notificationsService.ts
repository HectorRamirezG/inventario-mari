import { useCallback, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { sound } from "../../lib/sound"
import { useAuth, isStaffOrAdmin, type AppRole } from "../../lib/useAuth"
import { debug } from "../../lib/debug"
import {
  NOTIF_TYPE_CATEGORY,
  shouldPlayForNotif,
  type NotifCategory,
} from "../../lib/notifPrefs"
import { isDocumentVisible } from "../../lib/useDocumentVisible"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"

export type NotifType =
  // ───── Originales
  | "payment_added"
  | "sale_paid"
  | "sale_cancelled"
  | "new_layaway"
  // ───── Pagos y comprobantes
  | "payment_proof"
  | "payment_proof_uploaded"
  | "payment_proof_received"
  | "payment_proof_reminder"
  | "payment_approved"
  | "payment_rejected"
  | "proof_rejected"
  | "price_adjusted"
  // ───── Apartados
  | "layaway_extension"
  | "layaway_due_soon"
  | "layaway_stale"
  // ───── Soporte
  | "support_ticket"
  | "support_resolved"
  // ───── Wishes
  | "wish_created"
  | "wish_status"
  | "wish_available"
  // ───── Reviews
  | "review_created"
  | "review_published"
  // ───── Delivery
  | "delivery_picked_up"
  | "delivery_delivered"
  | "delivery_not_opened"
  // ───── Stock
  | "stock_low"
  | "stock_back"
  // ───── Milestones / ciclo de vida
  | "daily_goal"
  | "birthday"
  | "new_customer"
  | "abandoned_cart"

export interface AppNotification {
  id: string
  recipient_email: string
  recipient_role: "client" | "admin"
  type: NotifType | string
  title: string
  body: string | null
  link: string | null
  metadata: Record<string, any> | null
  read_at: string | null
  created_at: string
}

/** Determina qué `recipient_role` debe ver este usuario. */
function roleScope(role: AppRole): "client" | "admin" {
  return isStaffOrAdmin(role) ? "admin" : "client"
}

/* -------------------- API plana -------------------- */

/**
 * Elige el método de `sound` adecuado según la categoría de la notif y
 * respeta las preferencias del usuario (quiet hours, mute, etc.).
 *
 * Centralizado aquí para que TANTO el realtime hook como
 * `triggerLocalNotification` lo usen y sean consistentes.
 */
export function playForType(type: string): void {
  const { sound: canSound, haptic: canHaptic } = shouldPlayForNotif(type)
  if (!canSound && !canHaptic) return
  const cat: NotifCategory = NOTIF_TYPE_CATEGORY[type] ?? "system"
  // Si no se permite sonido pero sí vibración (quiet hours partial), llamamos
  // a la función igual: cada método ya respeta `getPrefs().haptics` y
  // `getPrefs().sounds` internamente. Aquí solo elegimos el "color" del audio.
  const method =
    cat === "proofs" || cat === "sales"
      ? "notifyMoney"
      : cat === "support"
      ? "notifyAlert"
      : cat === "wishes" || cat === "reviews"
      ? "notifySoft"
      : cat === "delivery"
      ? "notifyDelivery"
      : cat === "stock"
      ? "notifyStock"
      : cat === "milestone"
      ? "notifyMilestone"
      : "notify"
  // Si el global de sound está apagado pero quiet hours permite haptic,
  // igual lo permite (el método de sound respeta prefs.sounds).
  sound.play(method as any)
}

export async function fetchNotifications(
  scope: "client" | "admin",
  limit = 30,
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_role", scope)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as AppNotification[]
}

export async function markAsRead(id: string) {
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
}

export async function markAllRead() {
  // La RPC `mark_all_notifications_read` puede no existir si la migración
  // 0010 no se corrió. Hacemos try/catch (NO `.catch()` en la promesa de
  // Supabase: esa promesa no es "thenable nativa" y rompía con
  // `rpc(...).catch is not a function`).
  try {
    const { error } = await supabase.rpc("mark_all_notifications_read")
    if (!error) return
    debug.warn("[notif] RPC falló, usando fallback:", error.message)
  } catch (e) {
    debug.warn("[notif] RPC excepción, usando fallback:", e)
  }
  // Fallback: marca todas como leídas con UPDATE directo
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
}

export async function removeNotification(id: string) {
  await supabase.from("notifications").delete().eq("id", id)
}

/** Marca una notif como NO leída (volver a destacar). */
export async function markAsUnread(id: string) {
  await supabase.from("notifications").update({ read_at: null }).eq("id", id)
}

/**
 * Dispara una notificación nativa del sistema (Web Notification API).
 * Sólo funciona si el usuario otorgó permiso. Útil para mostrar push
 * locales aunque el origen sea el realtime de Supabase (no push remoto).
 *
 * No falla si el navegador no soporta o el permiso fue rechazado.
 */
export function triggerLocalNotification(input: {
  title: string
  body?: string | null
  tag?: string
  icon?: string
}): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return
  if (Notification.permission !== "granted") return
  try {
    const n = new Notification(input.title, {
      body: input.body ?? undefined,
      icon: input.icon ?? "/icon-192.png",
      tag: input.tag,
      silent: false,
    })
    // Cierre automático después de 8 segundos para no apilar
    setTimeout(() => n.close(), 8000)
  } catch {
    /* noop */
  }
}

/* -------------------- Hook reactivo -------------------- */

/**
 * Suscribe al usuario logueado a su feed de notificaciones.
 * IMPORTANTE: filtra por `recipient_role` correcto al usuario:
 *  - admin/staff → sólo notifs de admin (cobros, apartados, tickets nuevos)
 *  - client      → sólo notifs personales (su ticket resuelto, etc.)
 * Antes el filtro era sólo por email; si el admin tenía un correo que
 * casualmente aparecía como customer_email en algún ticket, recibía
 * notifs que eran para el cliente.
 */
export function useNotifications(opts: {
  onNew?: (n: AppNotification) => void
} = {}) {
  const { session, email, role } = useAuth()
  const enabled = !!session && !!email
  const scope = roleScope(role)
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const data = await fetchNotifications(scope)
      setItems(data)
    } catch {
      /* silencio */
    } finally {
      setLoading(false)
    }
  }, [enabled, scope])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      setLoading(false)
      return
    }
    refresh()
  }, [enabled, refresh])

  // Filtros client-side equivalentes a `recipient_role=eq.${scope}` y
  // por email del lado servidor (RLS) — todo despachado por el hub.
  const scopeMatch = useCallback(
    (row: any) =>
      row?.recipient_role === scope &&
      (!row?.recipient_email || row.recipient_email === email),
    [scope, email],
  )

  useRealtimeSubscription(
    "notifications",
    (payload) => {
      const n = payload.new as AppNotification
      setItems((prev) => [n, ...prev].slice(0, 50))
      if (isDocumentVisible()) playForType(n.type)
      triggerLocalNotification({ title: n.title, body: n.body, tag: n.id })
      opts.onNew?.(n)
    },
    { event: "INSERT", match: scopeMatch, enabled },
  )

  useRealtimeSubscription(
    "notifications",
    (payload) => {
      const n = payload.new as AppNotification
      setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)))
    },
    { event: "UPDATE", match: scopeMatch, enabled },
  )

  useRealtimeSubscription(
    "notifications",
    (payload) => {
      const id = (payload.old as any)?.id
      if (id) setItems((prev) => prev.filter((x) => x.id !== id))
    },
    { event: "DELETE", match: scopeMatch, enabled },
  )

  const unread = items.filter((n) => !n.read_at).length

  return {
    items,
    unread,
    loading,
    refresh,
    markAsRead,
    markAsUnread,
    markAllRead,
    removeNotification,
  }
}

/* ─────────── Helpers para DISPARAR notificaciones ─────────── */

/**
 * Payload base para crear una notificación. Lo usamos desde cualquier
 * service que quiera avisar a admins o a un cliente específico.
 *
 * IMPORTANTE: Las RLS de la tabla `notifications` permiten INSERT a
 * cualquier sesión autenticada con role anon (porque la app usa el
 * `anon` key). Si tu policy es más estricta, esto fallará silenciosamente
 * y verás un warning en consola sin romper el flujo principal.
 */
export interface NotifyInput {
  type: NotifType | string
  title: string
  body?: string | null
  link?: string | null
  metadata?: Record<string, any> | null
}

/**
 * Inserta una notificación dirigida a TODOS los admins/staff.
 * No requiere conocer correos: el filtro se hace por
 * `recipient_role='admin'` y los admins se suscriben a ese canal.
 *
 * Se usa cuando un cliente realiza una acción que debe ver:
 * crea apartado, sube comprobante, abre ticket de soporte, pide
 * extensión de plazo, etc.
 */
export async function notifyAdmins(input: NotifyInput): Promise<void> {
  try {
    const { error } = await supabase.from("notifications").insert({
      recipient_role: "admin",
      recipient_email: null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: input.metadata ?? null,
    })
    if (error) debug.warn("[notify] admins fallo:", error.message)
  } catch (e: any) {
    debug.warn("[notify] admins excepción:", e?.message)
  }
}

/**
 * Inserta una notificación dirigida a UN cliente específico.
 * Se identifica por `recipient_email` (lowercase). Si el cliente no
 * tiene email registrado en la venta (compra de mostrador), no se
 * envía nada — no es error.
 *
 * Se usa cuando realiza una acción que el cliente debe ver:
 * aprueba/rechaza un comprobante, agrega un pago manual, marca como
 * pagado/cancelado, resuelve ticket, etc.
 */
export async function notifyClient(
  email: string | null | undefined,
  input: NotifyInput,
): Promise<void> {
  if (!email) return
  const clean = email.trim().toLowerCase()
  if (!clean) return
  try {
    const { error } = await supabase.from("notifications").insert({
      recipient_role: "client",
      recipient_email: clean,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: input.metadata ?? null,
    })
    if (error) debug.warn("[notify] client fallo:", error.message)
  } catch (e: any) {
    debug.warn("[notify] client excepción:", e?.message)
  }
}

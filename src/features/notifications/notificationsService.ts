import { useCallback, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { sound } from "../../lib/sound"
import { useAuth } from "../../lib/useAuth"

export type NotifType =
  | "payment_added"
  | "sale_paid"
  | "sale_cancelled"
  | "new_layaway"

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

/* -------------------- API plana -------------------- */

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
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
    console.warn("[notif] RPC falló, usando fallback:", error.message)
  } catch (e) {
    console.warn("[notif] RPC excepción, usando fallback:", e)
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

/* -------------------- Hook reactivo -------------------- */

/**
 * Suscribe al usuario logueado a su feed de notificaciones.
 * - Carga inicial (limit 30)
 * - INSERT realtime → prepend + sonido + toast opcional via callback
 * - UPDATE realtime (read_at) → patch
 */
export function useNotifications(opts: {
  onNew?: (n: AppNotification) => void
} = {}) {
  const { session, email } = useAuth()
  const enabled = !!session && !!email
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    try {
      const data = await fetchNotifications()
      setItems(data)
    } catch {
      /* silencio */
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      setLoading(false)
      return
    }
    refresh()

    const channel = supabase
      .channel("mari-notifications-" + email)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_email=eq.${email}`,
        },
        (payload) => {
          const n = payload.new as AppNotification
          setItems((prev) => [n, ...prev].slice(0, 50))
          sound.play("notify")
          opts.onNew?.(n)
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_email=eq.${email}`,
        },
        (payload) => {
          const n = payload.new as AppNotification
          setItems((prev) => prev.map((x) => (x.id === n.id ? n : x)))
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `recipient_email=eq.${email}`,
        },
        (payload) => {
          const id = (payload.old as any)?.id
          if (id) setItems((prev) => prev.filter((x) => x.id !== id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, email])

  const unread = items.filter((n) => !n.read_at).length

  return { items, unread, loading, refresh, markAsRead, markAllRead, removeNotification }
}

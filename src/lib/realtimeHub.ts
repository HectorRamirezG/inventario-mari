import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import { debug } from "./debug"

// Bus realtime único multiplexado. Reemplaza los ~7 supabase.channel()
// que vivían dispersos en hooks/services. Solo abre un WebSocket a
// Supabase Realtime y rutea cada evento a los suscriptores interesados.
//
// Beneficios:
//  - 1 socket en lugar de 7 (ahorra handshakes y memoria del backend RT).
//  - Cada consumer recibe el payload sin reabrir conexiones.
//  - Las tablas en uso se reconstruyen con debounce (80ms) cuando llega
//    una suscripción nueva, así el montaje inicial agrupa todo.
//  - Filtro client-side para no perder granularidad (el original lo
//    hacía vía `filter:` de postgres_changes, que no es multiplexable
//    cuando varios consumers comparten canal).

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*"

export type RealtimeTable =
  | "sales"
  | "sale_items"
  | "payments"
  | "payment_proofs"
  | "delivery_notes"
  | "support_tickets"
  | "variants"
  | "products"
  | "stock_movements"
  | "wishes"
  | "reviews"
  | "notifications"
  | "stories"

export interface RealtimeListener {
  table: RealtimeTable
  event: RealtimeEvent
  match?: (row: any) => boolean
  cb: (payload: any) => void
}

const listeners = new Map<symbol, RealtimeListener>()
const tableRefCount = new Map<RealtimeTable, number>()
let channel: RealtimeChannel | null = null
let rebuildTimer: ReturnType<typeof setTimeout> | null = null

function dispatch(table: RealtimeTable, payload: any) {
  const evType = payload?.eventType as RealtimeEvent | undefined
  const row = payload?.new ?? payload?.old
  for (const l of listeners.values()) {
    if (l.table !== table) continue
    if (l.event !== "*" && evType && l.event !== evType) continue
    if (l.match && !l.match(row)) continue
    try {
      l.cb(payload)
    } catch (e: any) {
      debug.warn(`[realtimeHub] listener ${table} error:`, e?.message)
    }
  }
}

function rebuild() {
  rebuildTimer = null
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
  }
  if (tableRefCount.size === 0) return
  const ch = supabase.channel("mari-realtime-hub")
  for (const t of tableRefCount.keys()) {
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: t },
      (payload) => dispatch(t, payload),
    )
  }
  ch.subscribe()
  channel = ch
}

function scheduleRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(rebuild, 80)
}

export function subscribeRealtime(l: RealtimeListener): () => void {
  const id = Symbol("rt")
  listeners.set(id, l)
  const prev = tableRefCount.get(l.table) ?? 0
  tableRefCount.set(l.table, prev + 1)
  if (prev === 0) scheduleRebuild()
  return () => {
    if (!listeners.has(id)) return
    listeners.delete(id)
    const cur = tableRefCount.get(l.table) ?? 0
    if (cur <= 1) {
      tableRefCount.delete(l.table)
      scheduleRebuild()
    } else {
      tableRefCount.set(l.table, cur - 1)
    }
  }
}

export function realtimeHubStats() {
  return {
    listeners: listeners.size,
    tables: Array.from(tableRefCount.keys()),
    connected: !!channel,
  }
}

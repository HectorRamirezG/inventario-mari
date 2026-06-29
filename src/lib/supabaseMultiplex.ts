import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import { debug } from "./debug"

// Canal único, estático e inmutable. Reemplaza al hub anterior que
// reconstruía el canal cada vez que un consumer se montaba/desmontaba
// (causa real del parpadeo en cadena reportado por la usuaria).
//
// Suscribimos UNA sola vez a todas las tablas conocidas al primer
// arranque de la app. Los consumidores no agregan listeners al canal:
// reciben los eventos via `window.dispatchEvent(new CustomEvent(...))`
// con debounce de 600ms para no saturar el hilo principal.

const TABLES = [
  "sales",
  "sale_items",
  "payments",
  "payment_proofs",
  "delivery_notes",
  "support_tickets",
  "variants",
  "products",
  "stock_movements",
  "wishes",
  "reviews",
  "notifications",
  "stories",
  "app_settings",
  "loyalty_rules",
  "loyalty_balance",
  "loyalty_events",
  "stock_alerts",
] as const

export type RealtimeTable = (typeof TABLES)[number]

export const REALTIME_EVENT = (table: RealtimeTable) => `mari:rt:${table}`

export type RealtimeStatus = "joining" | "joined" | "closed" | "error" | "unknown"

let channel: RealtimeChannel | null = null
let started = false
let currentStatus: RealtimeStatus = "unknown"
let lastEventAt: number | null = null

const statusListeners = new Set<(s: RealtimeStatus) => void>()
const eventListeners = new Set<(ts: number) => void>()
const debounceTimers = new Map<RealtimeTable, ReturnType<typeof setTimeout>>()

function emitStatus(s: RealtimeStatus) {
  if (currentStatus === s) return
  currentStatus = s
  for (const fn of statusListeners) {
    try {
      fn(s)
    } catch {
      /* swallow */
    }
  }
}

function emitEvent() {
  lastEventAt = Date.now()
  for (const fn of eventListeners) {
    try {
      fn(lastEventAt)
    } catch {
      /* swallow */
    }
  }
}

// Debounce adaptivo por tabla: las tablas críticas (notificaciones,
// comprobantes, pagos, deliveries) usan 120ms para sentirse "vivas",
// el resto mantiene 600ms para no saturar el hilo principal cuando hay
// cambios masivos de inventario o productos.
const FAST_DISPATCH_MS = 120
const SLOW_DISPATCH_MS = 600
const FAST_TABLES = new Set<RealtimeTable>([
  "notifications",
  "payment_proofs",
  "payments",
  "delivery_notes",
  "support_tickets",
  "loyalty_balance",
  "loyalty_events",
])

function scheduleDispatch(table: RealtimeTable, payload: unknown) {
  const prev = debounceTimers.get(table)
  if (prev) clearTimeout(prev)
  const delay = FAST_TABLES.has(table) ? FAST_DISPATCH_MS : SLOW_DISPATCH_MS
  const timer = setTimeout(() => {
    debounceTimers.delete(table)
    window.dispatchEvent(
      new CustomEvent(REALTIME_EVENT(table), { detail: payload }),
    )
  }, delay)
  debounceTimers.set(table, timer)
}

export function startSupabaseMultiplex() {
  if (started || typeof window === "undefined") return
  started = true
  emitStatus("joining")
  const ch = supabase.channel("mari-realtime-hub")
  for (const t of TABLES) {
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: t },
      (payload) => {
        emitEvent()
        scheduleDispatch(t, payload)
      },
    )
  }
  ch.subscribe((status: string) => {
    const map: Record<string, RealtimeStatus> = {
      SUBSCRIBED: "joined",
      CHANNEL_ERROR: "error",
      TIMED_OUT: "error",
      CLOSED: "closed",
    }
    emitStatus(map[status] ?? "joining")
  })
  channel = ch

  // ───── Auto-reconnect ─────
  // El canal de Supabase a veces se cierra cuando: (a) el teléfono entra
  // a modo standby varias horas, (b) cambia de wifi a 4G y vuelve, (c)
  // hay timeout del servidor. Sin reconnect explícito, la PWA deja de
  // recibir eventos y Mari/cliente piensa que "ya no llega nada".
  //
  // Estrategia: en visibilitychange + online, si el status NO es "joined",
  // forzamos un reset del canal.
  const reconnectIfBroken = () => {
    if (currentStatus === "joined" || currentStatus === "joining") return
    debug.warn(
      `[realtime] reconectando (status=${currentStatus})`,
    )
    try {
      if (channel) supabase.removeChannel(channel)
    } catch {
      /* swallow */
    }
    channel = null
    started = false
    emitStatus("unknown")
    // Pequeño delay para evitar thundering herd.
    window.setTimeout(() => startSupabaseMultiplex(), 250)
  }

  const onVis = () => {
    if (document.visibilityState === "visible") reconnectIfBroken()
  }
  const onOnline = () => reconnectIfBroken()
  document.addEventListener("visibilitychange", onVis)
  window.addEventListener("online", onOnline)

  // Heartbeat: si pasaron 90s sin NINGÚN evento Y la página está
  // visible, asumimos canal muerto y reconectamos. 90s es conservador
  // para no reconectar de más cuando simplemente no hay actividad.
  const heartbeatId = window.setInterval(() => {
    if (document.visibilityState !== "visible") return
    if (currentStatus !== "joined") return
    const since = lastEventAt ? Date.now() - lastEventAt : Infinity
    if (since > 90_000) {
      // Sin evento en 90s + canal "joined" → probablemente muerto silencioso.
      // Forzamos un ping ligero: hacemos un select trivial. Si truena por
      // red, reconectamos.
      supabase
        .from("app_settings")
        .select("key")
        .limit(1)
        .then(({ error }) => {
          if (error) reconnectIfBroken()
        })
    }
  }, 30_000)

  // Limpieza (sólo si se llama stopSupabaseMultiplex después).
  ;(channel as any).__cleanup = () => {
    document.removeEventListener("visibilitychange", onVis)
    window.removeEventListener("online", onOnline)
    window.clearInterval(heartbeatId)
  }
}

export function stopSupabaseMultiplex() {
  if (!channel) return
  try {
    // Limpia listeners de reconnect/heartbeat antes de remover.
    const cleanup = (channel as any).__cleanup as (() => void) | undefined
    if (typeof cleanup === "function") cleanup()
    supabase.removeChannel(channel)
  } catch (e: any) {
    debug.warn("[supabaseMultiplex] removeChannel:", e?.message)
  }
  channel = null
  started = false
  emitStatus("closed")
}

export function onRealtimeStatus(cb: (s: RealtimeStatus) => void) {
  statusListeners.add(cb)
  cb(currentStatus)
  return () => {
    statusListeners.delete(cb)
  }
}

export function onRealtimeEvent(cb: (ts: number) => void) {
  eventListeners.add(cb)
  return () => {
    eventListeners.delete(cb)
  }
}

export function getRealtimeStatus(): RealtimeStatus {
  return currentStatus
}

export function getLastRealtimeEventAt(): number | null {
  return lastEventAt
}

export function multiplexStats() {
  return {
    tables: TABLES.length,
    connected: !!channel,
    status: currentStatus,
    lastEventAt,
  }
}

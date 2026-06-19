import { useCallback, useEffect, useState } from "react"

import { supabase } from "./supabase"
import { useAuth } from "./useAuth"
import { useBusinessRules } from "../features/settings/businessRulesService"
import { debug } from "./debug"
import { useRealtimeSubscription } from "./useRealtimeSubscription"
import { useDebouncedCallback } from "./useDebouncedCallback"

/**
 * Contadores globales que pinta el sidebar como badges sobre cada item.
 * Una sola fuente de verdad; ejecuta queries `head:true` paralelas
 * (sin transferir filas) y se refresca con eventos broadcast del resto
 * de la app (ej. `mari:proof-status`, `mari:apartado-refresh`).
 *
 * Devuelve 0 si la tabla no existe o RLS bloquea — degrada elegante.
 */
export interface SidebarCounts {
  /** Apartados con saldo pendiente */
  pendientes: number
  /** Tickets de soporte abiertos (status='open') */
  soporte: number
  /** Wishes en estado 'pending' */
  sugerencias: number
  /** Reviews esperando aprobación admin */
  resenias: number
  /** Variantes con stock <= 3 (bajo stock) */
  catalogo: number
}

const ZERO: SidebarCounts = {
  pendientes: 0,
  soporte: 0,
  sugerencias: 0,
  resenias: 0,
  catalogo: 0,
}

async function countOrZero(
  table: string,
  filter?: (q: any) => any,
): Promise<number> {
  try {
    let q = supabase.from(table).select("id", { count: "exact", head: true })
    if (filter) q = filter(q)
    const { count, error } = await q
    if (error) {
      if (/does not exist|404|not found|PGRST/i.test(error.message)) return 0
      return 0
    }
    return count ?? 0
  } catch (e: any) {
    debug.warn(`[sidebarCounts] ${table}:`, e?.message)
    return 0
  }
}

export function useSidebarCounts(): SidebarCounts {
  const { session, role } = useAuth()
  const rules = useBusinessRules()
  const isStaff = role === "admin" || role === "staff"
  const [counts, setCounts] = useState<SidebarCounts>(ZERO)

  const refresh = useCallback(async () => {
    if (!session || !isStaff) {
      setCounts(ZERO)
      return
    }
    const lowStockLimit = rules.stock_alert_threshold ?? 3
    const tasks: Promise<[keyof SidebarCounts, number]>[] = [
      countOrZero("sales", (q) => q.eq("status", "pending"))
        .then((n) => ["pendientes", n] as const),
      countOrZero("support_tickets", (q) => q.eq("status", "open"))
        .then((n) => ["soporte", n] as const),
      countOrZero("variants", (q) =>
        q.lte("stock", lowStockLimit).eq("is_active", true),
      ).then((n) => ["catalogo", n] as const),
    ]
    if (rules.wishes_enabled) {
      tasks.push(
        countOrZero("wishes", (q) => q.eq("status", "pending"))
          .then((n) => ["sugerencias", n] as const),
      )
    }
    if (rules.reviews_enabled) {
      tasks.push(
        countOrZero("reviews", (q) => q.eq("status", "pending"))
          .then((n) => ["resenias", n] as const),
      )
    }
    const results = await Promise.all(tasks)
    setCounts((prev) => {
      const next: SidebarCounts = { ...ZERO }
      for (const [k, v] of results) next[k] = v
      return { ...prev, ...next }
    })
  }, [session, isStaff, rules.wishes_enabled, rules.reviews_enabled, rules.stock_alert_threshold])

  // Realtime: el hub multiplex despacha eventos a estas tablas y
  // colapsamos las ráfagas en una sola query de conteo cada 400ms.
  const scheduleRefresh = useDebouncedCallback(() => refresh(), 400)
  const enabled = !!session && isStaff
  useRealtimeSubscription("sales", scheduleRefresh, { enabled })
  useRealtimeSubscription("support_tickets", scheduleRefresh, { enabled })
  useRealtimeSubscription("variants", scheduleRefresh, { enabled })
  useRealtimeSubscription("wishes", scheduleRefresh, {
    enabled: enabled && rules.wishes_enabled,
  })
  useRealtimeSubscription("reviews", scheduleRefresh, {
    enabled: enabled && rules.reviews_enabled,
  })

  useEffect(() => {
    refresh()
    let intervalId: ReturnType<typeof setInterval> | undefined
    const startInterval = () => {
      if (intervalId) return
      intervalId = setInterval(refresh, 60_000)
    }
    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = undefined
      }
    }
    if (typeof document === "undefined") return
    if (document.visibilityState === "visible") startInterval()
    const handleVis = () => {
      if (document.visibilityState === "visible") {
        refresh()
        startInterval()
      } else {
        stopInterval()
      }
    }
    document.addEventListener("visibilitychange", handleVis)
    const evNames = [
      "mari:apartado-refresh",
      "mari:apartado-new",
      "mari:proof-status",
      "mari:support-refresh",
      "mari:reviews-refresh",
    ]
    const handler = () => refresh()
    evNames.forEach((n) => window.addEventListener(n, handler))
    return () => {
      stopInterval()
      document.removeEventListener("visibilitychange", handleVis)
      evNames.forEach((n) => window.removeEventListener(n, handler))
    }
  }, [refresh])

  return counts
}

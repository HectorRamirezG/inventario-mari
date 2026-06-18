import { useCallback, useEffect, useState } from "react"

import { supabase } from "./supabase"
import { useAuth } from "./useAuth"
import { useBusinessRules } from "../features/settings/businessRulesService"
import { debug } from "./debug"

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
}

const ZERO: SidebarCounts = {
  pendientes: 0,
  soporte: 0,
  sugerencias: 0,
  resenias: 0,
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
      // Tabla inexistente o RLS bloqueando: 0 silencioso
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
    // Lanzamos en paralelo. Cada query trae a lo sumo el HEAD (count),
    // no transfiere filas, así que es barato. Gateamos por reglas para
    // no pegarle a tablas que el admin desactivó.
    const tasks: Promise<[keyof SidebarCounts, number]>[] = [
      countOrZero("sales", (q) => q.eq("status", "pending"))
        .then((n) => ["pendientes", n] as const),
      countOrZero("support_tickets", (q) => q.eq("status", "open"))
        .then((n) => ["soporte", n] as const),
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
      // Preserva claves que NO se consultaron (regla apagada)
      return { ...prev, ...next }
    })
  }, [session, isStaff, rules.wishes_enabled, rules.reviews_enabled])

  useEffect(() => {
    refresh()
    // Refresh cada 60s mientras la pestaña esté visible.
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
    if (typeof document !== "undefined") {
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
      // Eventos broadcast: cuando algo cambia en la app, refrescamos.
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
    }
    return () => stopInterval()
  }, [refresh])

  return counts
}

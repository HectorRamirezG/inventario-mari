// src/features/dashboard/useDashboard.ts
import { useEffect, useState } from "react"
import { getDashboardStats } from "./dashboardService"
import type { DashboardStats } from "./dashboardTypes"
import { debug } from "../../lib/debug"
import { supabase } from "../../lib/supabase"

export function useDashboard(periodDays = 30) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // `silent` = true cuando el refresh viene del realtime/intervalo,
  // así no mostramos el skeleton ni rebobinamos el scroll. Solo
  // actualizamos los datos en su lugar.
  async function refresh(silent = false) {
    if (!silent) setLoading(true)
    try {
      const data = await getDashboardStats(periodDays)
      setStats(data)
    } catch (error) {
      debug.error("Error en dashboard:", error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // Realtime: cuando entre/cambie una venta o un pago, refrescamos
    // los KPIs en SILENCIO (sin skeleton) para no perder la posición
    // de scroll del admin. Debounce de 600ms para colapsar ráfagas.
    let debounceId: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (debounceId) clearTimeout(debounceId)
      debounceId = setTimeout(() => refresh(true), 600)
    }
    const channel = supabase
      .channel(`dashboard-${periodDays}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        schedule,
      )
      .subscribe()
    return () => {
      if (debounceId) clearTimeout(debounceId)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays])

  return { stats, loading, refresh }
}

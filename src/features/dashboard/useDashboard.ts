// src/features/dashboard/useDashboard.ts
import { useEffect, useState } from "react"
import { getDashboardStats } from "./dashboardService"
import type { DashboardStats } from "./dashboardTypes"
import { debug } from "../../lib/debug"
import { supabase } from "../../lib/supabase"

export function useDashboard(periodDays = 30) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const data = await getDashboardStats(periodDays)
      setStats(data)
    } catch (error) {
      debug.error("Error en dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // Realtime: cuando entre/cambie una venta o un pago, refrescamos
    // los KPIs sin esperar a que el admin recargue la página.
    // Debounce de 600ms para no spamear si llegan varios eventos.
    let debounceId: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (debounceId) clearTimeout(debounceId)
      debounceId = setTimeout(refresh, 600)
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

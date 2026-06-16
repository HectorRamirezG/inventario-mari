// src/features/dashboard/useDashboard.ts
import { useEffect, useState } from "react"
import { getDashboardStats } from "./dashboardService"
import type { DashboardStats } from "./dashboardTypes"

export function useDashboard(periodDays = 30) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const data = await getDashboardStats(periodDays)
      setStats(data)
    } catch (error) {
      console.error("Error en dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays])

  return { stats, loading, refresh }
}

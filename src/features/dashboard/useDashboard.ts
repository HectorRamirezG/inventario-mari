// src/features/dashboard/useDashboard.ts
import { useEffect, useState } from "react"
import { getDashboardStats } from "./dashboardService"
import type { DashboardStats } from "./dashboardTypes" // Agrega 'type' aquí

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const data = await getDashboardStats()
      setStats(data)
    } catch (error) {
      console.error("Error en dashboard:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return { stats, loading, refresh }
}
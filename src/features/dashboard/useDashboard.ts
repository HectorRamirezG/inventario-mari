import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getDashboardStats } from "./dashboardService"
import type { DashboardStats } from "./dashboardTypes"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"

export const dashboardQueryKey = (periodDays: number) =>
  ["dashboard", periodDays] as const

export function useDashboard(periodDays = 30) {
  const queryClient = useQueryClient()
  const { data, isLoading, isFetching, refetch } = useQuery<DashboardStats>({
    queryKey: dashboardQueryKey(periodDays),
    queryFn: () => getDashboardStats(periodDays),
    staleTime: 30_000,
  })

  // Colapsa ráfagas de eventos realtime en una sola invalidación.
  const invalidate = useDebouncedCallback(() => {
    queryClient.invalidateQueries({ queryKey: dashboardQueryKey(periodDays) })
  }, 600)

  useRealtimeSubscription("sales", invalidate)
  useRealtimeSubscription("payments", invalidate)

  const refresh = useCallback(() => {
    refetch()
  }, [refetch])

  return {
    stats: data ?? null,
    loading: isLoading,
    refreshing: isFetching && !isLoading,
    refresh,
  }
}


import { useCallback, useEffect, useState } from "react"

import { supabase } from "./supabase"
import { useAuth } from "./useAuth"
import { useRealtimeSubscription } from "./useRealtimeSubscription"
import { useDebouncedCallback } from "./useDebouncedCallback"
import { debug } from "./debug"
import { isStaffOrAdmin } from "./useAuth"

/**
 * Cuenta cuántas variantes ACTIVAS tienen stock = 0 (agotadas).
 *
 * Diferente de `useSidebarCounts.catalogo` que cuenta TODO lo que esté
 * con stock ≤ umbral (incluye stock 1, 2, 3). Aquí solo lo CRÍTICO.
 *
 * Diseñado para alimentar un banner sticky en el AdminShell que avisa
 * a Mari: "X productos sin stock, restablece para no perder ventas".
 *
 * Degrada a 0 si:
 *   - Sin sesión o sin rol admin/staff
 *   - La query falla (RLS, red, cualquier cosa)
 */
export function useCriticalStockCount(): number {
  const { session, role } = useAuth()
  const isStaff = isStaffOrAdmin(role)
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!session || !isStaff) {
      setCount(0)
      return
    }
    try {
      const { count: n, error } = await supabase
        .from("variants")
        .select("id", { count: "exact", head: true })
        .eq("stock", 0)
        .eq("is_active", true)
      if (error) {
        debug.warn("[criticalStock] error:", error.message)
        setCount(0)
        return
      }
      setCount((prev) => {
        const next = n ?? 0
        return prev === next ? prev : next
      })
    } catch (e: any) {
      debug.warn("[criticalStock] exception:", e?.message)
      setCount(0)
    }
  }, [session, isStaff])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Reaccionar a cambios realtime de variants y a ventas (que reducen stock)
  const scheduleRefresh = useDebouncedCallback(() => refresh(), 600)
  const enabled = !!session && isStaff
  useRealtimeSubscription("variants", scheduleRefresh, { enabled })
  useRealtimeSubscription("sales", scheduleRefresh, { enabled })

  return count
}

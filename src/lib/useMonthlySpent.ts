import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import { useRealtimeSubscription } from "./useRealtimeSubscription"

/**
 * Hook: total gastado por el cliente (sumatoria de paid en sales activas)
 * durante los últimos N días. Útil para evaluar VIP automático y para
 * mostrar "ahorro mensual" en perfil del cliente.
 *
 * @param email correo lowercase del cliente
 * @param days ventana en días (default 30)
 * @returns { spent, loading, refresh }
 */
export function useMonthlySpent(email: string | null | undefined, days = 30) {
  const [spent, setSpent] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!email) {
      setSpent(0)
      setLoading(false)
      return
    }
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - days)
    try {
      const { data } = await supabase
        .from("sales")
        .select("paid,status,created_at")
        .eq("customer_email", email.toLowerCase())
        .gte("created_at", since.toISOString())
        .neq("status", "cancelled")
      const total = (data ?? []).reduce(
        (acc: number, r: any) => acc + (Number(r.paid) || 0),
        0,
      )
      setSpent(total)
    } catch {
      setSpent(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, days])

  // Realtime: nuevo pago/venta del cliente recalcula.
  useRealtimeSubscription("payments", refresh, { enabled: !!email })
  useRealtimeSubscription("sales", refresh, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })

  return { spent, loading, refresh }
}

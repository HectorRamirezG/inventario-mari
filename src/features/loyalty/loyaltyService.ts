import { useCallback, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../lib/useAuth"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { debug } from "../../lib/debug"

export interface LoyaltyRule {
  action_key: string
  label: string
  description: string | null
  points: number
  enabled: boolean
  one_time: boolean
  emoji: string | null
}

export interface LoyaltyBalance {
  customer_email: string
  points: number
  lifetime_earned: number
  lifetime_spent: number
  updated_at: string
}

export interface LoyaltyEvent {
  id: string
  customer_email: string
  action_key: string | null
  delta: number
  note: string | null
  ref_id: string | null
  created_at: string
}

/** Lista todas las reglas (catálogo público). */
export async function listLoyaltyRules(): Promise<LoyaltyRule[]> {
  const { data, error } = await supabase
    .from("loyalty_rules")
    .select("*")
    .order("points", { ascending: false })
  if (error) {
    debug.warn("[loyalty] listRules:", error.message)
    return []
  }
  return (data ?? []) as LoyaltyRule[]
}

/** Actualiza una regla (solo admin). */
export async function updateLoyaltyRule(
  actionKey: string,
  patch: Partial<Pick<LoyaltyRule, "points" | "enabled" | "label" | "description" | "one_time" | "emoji">>,
): Promise<void> {
  const { error } = await supabase
    .from("loyalty_rules")
    .update(patch)
    .eq("action_key", actionKey)
  if (error) throw error
}

/** Trae el balance del cliente logueado. */
export async function fetchMyBalance(email: string): Promise<LoyaltyBalance | null> {
  if (!email) return null
  const { data, error } = await supabase
    .from("loyalty_balance")
    .select("*")
    .eq("customer_email", email.toLowerCase())
    .maybeSingle()
  if (error) {
    if (/does not exist|not found|404/i.test(error.message)) return null
    debug.warn("[loyalty] fetchMyBalance:", error.message)
    return null
  }
  return data as LoyaltyBalance | null
}

/** Historial de eventos del cliente logueado. */
export async function fetchMyEvents(email: string, limit = 30): Promise<LoyaltyEvent[]> {
  if (!email) return []
  const { data, error } = await supabase
    .from("loyalty_events")
    .select("*")
    .eq("customer_email", email.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    if (/does not exist|not found|404/i.test(error.message)) return []
    debug.warn("[loyalty] fetchMyEvents:", error.message)
    return []
  }
  return (data ?? []) as LoyaltyEvent[]
}

/** Canjea puntos del cliente. Devuelve true si tuvo saldo. */
export async function spendLoyaltyPoints(
  email: string,
  points: number,
  note?: string,
  refId?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("spend_loyalty_points", {
    p_email: email.toLowerCase(),
    p_points: Math.max(0, Math.floor(points)),
    p_note: note ?? null,
    p_ref_id: refId ?? null,
  })
  if (error) {
    debug.warn("[loyalty] spend:", error.message)
    return false
  }
  return !!data
}

/** Otorga puntos manualmente (admin). Wrapper de la RPC. */
export async function awardLoyaltyPoints(
  email: string,
  actionKey: string,
  refId?: string,
  note?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("award_loyalty_points", {
    p_email: email.toLowerCase(),
    p_action: actionKey,
    p_ref_id: refId ?? null,
    p_note: note ?? null,
  })
  if (error) {
    debug.warn("[loyalty] award:", error.message)
    return 0
  }
  return Number(data) || 0
}

/* ─────────────────── Hooks ─────────────────── */

/** Hook reactivo del balance del cliente logueado. Realtime via hub. */
export function useMyLoyaltyBalance() {
  const { email, session } = useAuth()
  const [balance, setBalance] = useState<LoyaltyBalance | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!email) {
      setBalance(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const data = await fetchMyBalance(email)
    setBalance(data)
    setLoading(false)
  }, [email])

  useEffect(() => {
    if (!session) {
      setBalance(null)
      setLoading(false)
      return
    }
    refresh()
  }, [session, refresh])

  // Realtime: cualquier cambio en MI balance refresca.
  useRealtimeSubscription("loyalty_balance" as any, refresh, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })
  // También escucha eventos nuevos para refresh inmediato.
  useRealtimeSubscription("loyalty_events" as any, refresh, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })

  return { balance, loading, refresh }
}

/** Hook del historial reciente del cliente. */
export function useMyLoyaltyEvents(limit = 30) {
  const { email, session } = useAuth()
  const [events, setEvents] = useState<LoyaltyEvent[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!email) {
      setEvents([])
      setLoading(false)
      return
    }
    setLoading(true)
    const data = await fetchMyEvents(email, limit)
    setEvents(data)
    setLoading(false)
  }, [email, limit])

  useEffect(() => {
    if (!session) {
      setEvents([])
      setLoading(false)
      return
    }
    refresh()
  }, [session, refresh])

  useRealtimeSubscription("loyalty_events" as any, refresh, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })

  return { events, loading, refresh }
}

/** Hook del catálogo de reglas (cache + realtime). */
export function useLoyaltyRules() {
  const [rules, setRules] = useState<LoyaltyRule[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await listLoyaltyRules()
    setRules(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRealtimeSubscription("loyalty_rules" as any, refresh, { enabled: true })

  return { rules, loading, refresh }
}

/** Calcula el valor en pesos de N puntos. */
export function pointsToMoney(points: number, pesoPorPunto: number): number {
  return Math.max(0, points) * Math.max(0, pesoPorPunto)
}

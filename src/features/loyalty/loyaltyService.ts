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

/** Crea una regla nueva (admin). El `action_key` debe ser único.
 *  Se prefija con `custom_` para diferenciar de las que vienen del seed. */
export async function createLoyaltyRule(rule: {
  label: string
  description?: string | null
  points: number
  emoji?: string | null
  one_time?: boolean
  enabled?: boolean
}): Promise<LoyaltyRule> {
  const slug = rule.label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  const action_key = `custom_${slug || Date.now().toString(36)}`
  const payload = {
    action_key,
    label: rule.label.trim().slice(0, 80),
    description: rule.description?.trim().slice(0, 200) || null,
    points: Math.max(0, Math.min(9999, Math.floor(rule.points))),
    emoji: rule.emoji?.trim().slice(0, 6) || "✨",
    one_time: !!rule.one_time,
    enabled: rule.enabled !== false,
  }
  const { data, error } = await supabase
    .from("loyalty_rules")
    .insert(payload)
    .select("*")
    .single()
  if (error) throw error
  return data as LoyaltyRule
}

/** Borra una regla (solo custom_*). Las del seed no deben tocarse. */
export async function deleteLoyaltyRule(actionKey: string): Promise<void> {
  if (!actionKey.startsWith("custom_")) {
    throw new Error("Solo puedes borrar reglas creadas por ti.")
  }
  const { error } = await supabase
    .from("loyalty_rules")
    .delete()
    .eq("action_key", actionKey)
  if (error) throw error
}

/** Otorga puntos MANUALMENTE a un cliente (admin). No usa el RPC
 *  porque el RPC siempre lee los puntos de la regla; aquí el admin
 *  decide la cantidad libre y la nota. Inserta el evento + actualiza
 *  el balance. Mismo patrón que `apartadosService.cancelSaleAndRefund`.
 *
 *  Devuelve el nuevo balance del cliente, o null si algo falló. */
export async function awardManualPoints(opts: {
  email: string
  points: number
  note?: string
  actionKey?: string
}): Promise<number | null> {
  const email = opts.email.trim().toLowerCase()
  const delta = Math.floor(opts.points)
  if (!email || !delta) return null

  const { error: evErr } = await supabase.from("loyalty_events").insert({
    customer_email: email,
    action_key: opts.actionKey ?? "manual_grant",
    delta,
    note: opts.note?.trim() || "Regalo del equipo",
    ref_table: "manual",
    ref_id: null,
  })
  if (evErr) {
    debug.warn("[loyalty] manual event insert:", evErr.message)
    throw new Error(evErr.message)
  }

  // Upsert balance: sumar al existente o crear nuevo.
  const { data: existing } = await supabase
    .from("loyalty_balance")
    .select("points,lifetime_earned,lifetime_spent")
    .eq("customer_email", email)
    .maybeSingle()

  if (existing) {
    const nextPoints = Math.max(0, (Number((existing as any).points) || 0) + delta)
    const nextEarned =
      delta > 0
        ? (Number((existing as any).lifetime_earned) || 0) + delta
        : Number((existing as any).lifetime_earned) || 0
    const nextSpent =
      delta < 0
        ? (Number((existing as any).lifetime_spent) || 0) + Math.abs(delta)
        : Number((existing as any).lifetime_spent) || 0
    const { error: upErr } = await supabase
      .from("loyalty_balance")
      .update({
        points: nextPoints,
        lifetime_earned: nextEarned,
        lifetime_spent: nextSpent,
        updated_at: new Date().toISOString(),
      })
      .eq("customer_email", email)
    if (upErr) {
      debug.warn("[loyalty] manual balance update:", upErr.message)
      throw new Error(upErr.message)
    }
    return nextPoints
  } else {
    const initialPoints = Math.max(0, delta)
    const { error: insErr } = await supabase.from("loyalty_balance").insert({
      customer_email: email,
      points: initialPoints,
      lifetime_earned: delta > 0 ? delta : 0,
      lifetime_spent: delta < 0 ? Math.abs(delta) : 0,
    })
    if (insErr) {
      debug.warn("[loyalty] manual balance insert:", insErr.message)
      throw new Error(insErr.message)
    }
    return initialPoints
  }
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

/** Resultado liviano del autocomplete de cliente en `GrantPointsModal`. */
export interface CustomerSuggestion {
  email: string
  full_name: string | null
  points: number
}

/** Busca clientes por email o nombre (ILIKE). Limitado a 8 resultados.
 *  Usado por el modal "Regalar puntos" como autocomplete. Hace 2 queries
 *  en paralelo: user_profiles + loyalty_balance, y mergea por email. */
export async function searchCustomers(
  query: string,
  limit = 8,
): Promise<CustomerSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const pattern = `%${q}%`

  const [profilesRes, balancesRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("email,full_name")
      .or(`email.ilike.${pattern},full_name.ilike.${pattern}`)
      .limit(limit),
    // Si el cliente NO está en user_profiles pero sí compró como invitado
    // y ganó puntos, lo encontramos por loyalty_balance. Match solo email.
    supabase
      .from("loyalty_balance")
      .select("customer_email,points")
      .ilike("customer_email", pattern)
      .limit(limit),
  ])

  const byEmail = new Map<string, CustomerSuggestion>()

  if (!profilesRes.error && profilesRes.data) {
    for (const r of profilesRes.data as any[]) {
      const email = String(r.email || "").toLowerCase().trim()
      if (!email) continue
      byEmail.set(email, {
        email,
        full_name: r.full_name || null,
        points: 0,
      })
    }
  }

  if (!balancesRes.error && balancesRes.data) {
    for (const r of balancesRes.data as any[]) {
      const email = String(r.customer_email || "").toLowerCase().trim()
      if (!email) continue
      const existing = byEmail.get(email)
      if (existing) {
        existing.points = Number(r.points) || 0
      } else {
        byEmail.set(email, {
          email,
          full_name: null,
          points: Number(r.points) || 0,
        })
      }
    }
  }

  return Array.from(byEmail.values()).slice(0, limit)
}

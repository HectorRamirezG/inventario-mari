import { supabase } from "../../lib/supabase"

export interface RegisteredUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  full_name: string
  role: "admin" | "staff" | "client" | string
  phone: string | null
  avatar_url: string | null
  orders: number
  total_spent: number
  last_purchase_at: string | null
  /** Puntos disponibles en programa de premios (loyalty). 0 si nunca participó. */
  loyalty_points?: number
  /** Total acumulado de puntos ganados de por vida (mide engagement). */
  lifetime_earned?: number
}

export interface Visitor {
  id: string
  session_id: string
  user_agent: string | null
  first_seen_at: string
  last_seen_at: string
  total_visits: number
  pages_viewed: Array<{ path: string; at: string }>
  converted_user_email: string | null
}

export async function listAllUsers(limit = 200, offset = 0): Promise<RegisteredUser[]> {
  const { data, error } = await supabase.rpc("list_all_users", {
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  const payload = (data ?? {}) as { users?: RegisteredUser[] }
  const users = payload.users ?? []

  // Fallback teléfono: la RPC sólo lee `profiles.phone`, pero las clientas
  // suelen capturar su número en el checkout (queda en `sales.customer_phone`).
  // Aquí completamos el `phone` faltante con el último teléfono no-nulo
  // de cualquier venta asociada al email. Una sola query, agrupada en cliente.
  const emailsMissingPhone = users
    .filter((u) => !u.phone && u.email)
    .map((u) => u.email.toLowerCase())
  if (emailsMissingPhone.length > 0) {
    const { data: phoneRows } = await supabase
      .from("sales")
      .select("customer_email,customer_phone,created_at")
      .in("customer_email", emailsMissingPhone)
      .not("customer_phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000)
    if (phoneRows && phoneRows.length > 0) {
      const phoneByEmail = new Map<string, string>()
      for (const r of phoneRows as any[]) {
        const k = String(r.customer_email || "").toLowerCase()
        const p = String(r.customer_phone || "").trim()
        if (!k || !p) continue
        if (!phoneByEmail.has(k)) phoneByEmail.set(k, p)
      }
      for (const u of users) {
        if (!u.phone && u.email) {
          const fromSale = phoneByEmail.get(u.email.toLowerCase())
          if (fromSale) u.phone = fromSale
        }
      }
    }
  }

  // Loyalty: traemos balance de TODOS los usuarios con email en un solo
  // query y mergeamos. Tolerante: si la tabla no existe, no rompemos.
  const emails = users.map((u) => u.email?.toLowerCase()).filter(Boolean)
  if (emails.length > 0) {
    try {
      const { data: loyaltyRows } = await supabase
        .from("loyalty_balance")
        .select("customer_email,points,lifetime_earned")
        .in("customer_email", emails)
      if (loyaltyRows) {
        const byEmail = new Map<string, { p: number; e: number }>(
          (loyaltyRows as any[]).map((r) => [
            String(r.customer_email).toLowerCase(),
            { p: Number(r.points) || 0, e: Number(r.lifetime_earned) || 0 },
          ]),
        )
        for (const u of users) {
          const k = u.email?.toLowerCase()
          if (!k) continue
          const lb = byEmail.get(k)
          u.loyalty_points = lb?.p ?? 0
          u.lifetime_earned = lb?.e ?? 0
        }
      }
    } catch {
      /* tabla puede no existir todavía: SQL fix_loyalty_system pendiente */
    }
  }

  return users
}

export async function listVisitors(limit = 200, onlyUnconverted = true): Promise<Visitor[]> {
  const { data, error } = await supabase.rpc("list_visitors", {
    p_limit: limit,
    p_only_unconverted: onlyUnconverted,
  })
  if (error) throw error
  const payload = (data ?? {}) as { visitors?: Visitor[] }
  return payload.visitors ?? []
}

/** Track de visita anónima. Best-effort; silencia errores (RPC no existe). */
export async function trackVisit(input: {
  sessionId: string
  userAgent?: string | null
  path?: string | null
}): Promise<void> {
  try {
    await supabase.rpc("track_visit", {
      p_session_id: input.sessionId,
      p_user_agent: input.userAgent ?? null,
      p_path: input.path ?? null,
    })
  } catch {
    /* noop: la RPC puede no estar creada todavía */
  }
}

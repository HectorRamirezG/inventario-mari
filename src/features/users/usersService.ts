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

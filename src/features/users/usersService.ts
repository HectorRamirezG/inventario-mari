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
  return payload.users ?? []
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

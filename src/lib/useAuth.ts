import { useCallback, useEffect, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"

export type AppRole = "admin" | "staff" | "client" | "anon"

export interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  role: AppRole
  email: string | null
  fullName: string | null
}

const initial: AuthState = {
  loading: true,
  session: null,
  user: null,
  role: "anon",
  email: null,
  fullName: null,
}

let cached: AuthState = initial
const listeners = new Set<(s: AuthState) => void>()
function setState(next: AuthState) {
  cached = next
  listeners.forEach((l) => l(next))
}

async function refreshProfile(session: Session | null) {
  if (!session?.user) {
    setState({ ...initial, loading: false })
    return
  }
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role, full_name, email")
    .eq("id", session.user.id)
    .maybeSingle()

  // Si el trigger todavía no corrió (caso muy raro de race), asumimos
  // rol 'client' temporalmente y reintentamos en 1s.
  const role = (data?.role as AppRole) ?? (error ? "anon" : "client")
  setState({
    loading: false,
    session,
    user: session.user,
    role,
    email: data?.email ?? session.user.email ?? null,
    fullName: data?.full_name ?? session.user.email ?? null,
  })

  if (!data && session.user) {
    setTimeout(() => refreshProfile(session), 1200)
  }
}

let inited = false
function initOnce() {
  if (inited) return
  inited = true
  supabase.auth.getSession().then(({ data }) => refreshProfile(data.session))
  supabase.auth.onAuthStateChange((_event, session) => refreshProfile(session))
}

/**
 * Hook reactivo a la sesión de Supabase Auth + rol del perfil.
 * El estado es un singleton para que cada subcomponente comparta cache.
 */
export function useAuth(): AuthState & {
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string, fullName?: string) => Promise<void>
  sendMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
} {
  const [state, setLocal] = useState<AuthState>(cached)

  useEffect(() => {
    initOnce()
    const l = (s: AuthState) => setLocal(s)
    listeners.add(l)
    setLocal(cached)
    return () => {
      listeners.delete(l)
    }
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }, [])

  const signUpWithPassword = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName ?? email } },
      })
      if (error) throw new Error(error.message)
    },
    []
  )

  const sendMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/login" },
    })
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return {
    ...state,
    signInWithPassword,
    signUpWithPassword,
    sendMagicLink,
    signOut,
  }
}

export function isStaffOrAdmin(role: AppRole) {
  return role === "admin" || role === "staff"
}

import { useCallback, useEffect, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./supabase"
import { setLastSession, clearLastSession } from "./lastSession"

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
    .select("role, full_name, email, avatar_url")
    .eq("id", session.user.id)
    .maybeSingle()

  // Si el trigger todavía no corrió (caso muy raro de race), asumimos
  // rol 'client' temporalmente y reintentamos en 1s.
  const role = (data?.role as AppRole) ?? (error ? "anon" : "client")
  const finalEmail = data?.email ?? session.user.email ?? null
  const finalName = data?.full_name ?? session.user.email ?? null
  setState({
    loading: false,
    session,
    user: session.user,
    role,
    email: finalEmail,
    fullName: finalName,
  })

  // Persiste el último usuario logueado para el Smart Login del próximo
  // acceso. Sólo data visual (email/nombre/avatar). NUNCA password.
  if (finalEmail) {
    setLastSession({
      email: finalEmail,
      full_name: finalName,
      avatar_url: (data?.avatar_url as string | null) ?? null,
    })
  }

  if (!data && session.user) {
    setTimeout(() => refreshProfile(session), 1200)
  }
}

let inited = false
function initOnce() {
  if (inited) return
  inited = true
  supabase.auth.getSession().then(({ data }) => {
    // Aseguramos que el canal realtime use el mismo token que las queries
    supabase.realtime.setAuth(data.session?.access_token ?? null)
    refreshProfile(data.session)
  })
  supabase.auth.onAuthStateChange((event, session) => {
    // CRÍTICO: si la sesión cambia (login/logout) hay que sincronizar el
    // token de realtime, porque si no, los canales abiertos siguen
    // usando el token viejo y RLS los rechaza silenciosamente — esto
    // es lo que causaba el cuelgue "infinito cargando" al pasar de
    // anónimo a logueado en celular.
    supabase.realtime.setAuth(session?.access_token ?? null)

    refreshProfile(session)

    // Notifica a feature pages para que limpien su caché local
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mari:auth-changed", {
          detail: { event, hasSession: !!session },
        })
      )
    }

    // Si el usuario cierra sesión, cerramos TODOS los canales realtime
    // para evitar fugas de memoria + re-suscripciones con token nulo
    if (event === "SIGNED_OUT") {
      try {
        supabase.removeAllChannels()
      } catch {
        /* silencio */
      }
    }
  })
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
  forgetDevice: () => Promise<void>
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
        options: {
          data: { full_name: fullName ?? email },
          emailRedirectTo: window.location.origin + "/login",
        },
      })
      if (error) throw new Error(error.message)
    },
    []
  )

  const sendMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + "/login",
        shouldCreateUser: true,
      },
    })
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    // Disparamos un evento para que el shell aplique fade-out (300ms)
    // antes de que Supabase tumbe la sesión y React rerender al Login.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("mari:signing-out"))
      await new Promise((r) => setTimeout(r, 280))
    }
    // scope:'local' evita el 403 cuando el access_token ya expiró —
    // sólo limpia el storage del navegador en vez de pedir a /auth/v1/logout
    // que revoque tokens en todos los dispositivos. Si el logout local
    // falla por cualquier motivo, limpiamos manualmente como red de seguridad.
    try {
      await supabase.auth.signOut({ scope: "local" })
    } catch (err) {
      console.warn("[auth] signOut local failed, clearing storage", err)
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
          .forEach((k) => localStorage.removeItem(k))
      } catch {}
    }
  }, [])

  /** Cierra sesión Y olvida el dispositivo (borra lastSession). */
  const forgetDevice = useCallback(async () => {
    clearLastSession()
    await signOut()
  }, [signOut])

  return {
    ...state,
    signInWithPassword,
    signUpWithPassword,
    sendMagicLink,
    signOut,
    forgetDevice,
  }
}

export function isStaffOrAdmin(role: AppRole) {
  return role === "admin" || role === "staff"
}

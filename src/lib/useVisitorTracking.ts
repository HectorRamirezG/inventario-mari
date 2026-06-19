import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"

import { trackVisit } from "../features/users/usersService"

const KEY = "mari:visitor-session"

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return ""
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ""
  }
}

/**
 * Trackea sesiones del visitante (anónimo o logueado).
 *
 * - Genera un session_id persistente en localStorage (no es cookie).
 * - Llama a la RPC `track_visit` 1 vez al montar + cada vez que cambia
 *   la ruta (con debounce de 1.2s para no spamear si el cliente navega
 *   muy rápido).
 * - 100% best-effort: si la RPC no existe o falla, no rompe nada.
 *
 * Importante: el RPC en BD es SECURITY DEFINER y respeta tope de
 * `pages_viewed` (últimas 20). Tampoco guarda IP — solo el user_agent.
 */
export function useVisitorTracking(): void {
  const { pathname } = useLocation()
  const lastPathRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const sessionId = getOrCreateSessionId()
    if (!sessionId) return
    if (lastPathRef.current === pathname) return
    lastPathRef.current = pathname

    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      trackVisit({
        sessionId,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        path: pathname,
      })
    }, 1200)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [pathname])
}

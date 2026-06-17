import { useEffect, useState } from "react"

/**
 * Preferencias del usuario persistidas en localStorage.
 * Se exponen via hook reactivo (todos los componentes que las consumen
 * se re-renderizan cuando cambian).
 *
 * Las claves usan namespace `mari:pref:*` para no chocar con otros datos.
 */

export interface UserPrefs {
  /** Reproducir sonidos sutiles (cobros, escaneos, etc.) */
  sounds: boolean
  /** Vibrar el dispositivo (haptic feedback) */
  haptics: boolean
  /** Confetti en milestones (primera venta del día, etc.) */
  confetti: boolean
}

const DEFAULTS: UserPrefs = {
  sounds: true,
  haptics: true,
  confetti: true,
}

const KEY = "mari:prefs:v1"

function readPrefs(): UserPrefs {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<UserPrefs>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function writePrefs(next: UserPrefs) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    // Dispatch evento custom para que todos los listeners se enteren
    window.dispatchEvent(new CustomEvent("mari:prefs-change", { detail: next }))
  } catch {
    /* noop */
  }
}

/* ──────────────────────────────────────────────────────
 * API síncrona (para llamarse desde funciones no-react)
 * ────────────────────────────────────────────────────── */

let cached: UserPrefs = readPrefs()

/** Lee la preferencia actual sin React. Útil dentro de useFeedback, sound, etc. */
export function getPrefs(): UserPrefs {
  return cached
}

/** Actualiza una preferencia individual. */
export function setPref<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
  cached = { ...cached, [key]: value }
  writePrefs(cached)
}

/** Resetea a defaults. */
export function resetPrefs() {
  cached = { ...DEFAULTS }
  writePrefs(cached)
}

if (typeof window !== "undefined") {
  // Sincroniza el cache si otro tab cambia las prefs
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) cached = readPrefs()
  })
  window.addEventListener("mari:prefs-change", (e: any) => {
    if (e?.detail) cached = e.detail
  })
}

/* ──────────────────────────────────────────────────────
 * Hook React reactivo
 * ────────────────────────────────────────────────────── */

export function useUserPrefs() {
  const [prefs, setPrefs] = useState<UserPrefs>(cached)

  useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail) setPrefs(e.detail)
    }
    window.addEventListener("mari:prefs-change", handler)
    return () => window.removeEventListener("mari:prefs-change", handler)
  }, [])

  return {
    prefs,
    toggle: <K extends keyof UserPrefs>(key: K) => setPref(key, !prefs[key] as UserPrefs[K]),
    set: setPref,
    reset: resetPrefs,
  }
}

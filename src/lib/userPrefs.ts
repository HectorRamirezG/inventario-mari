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
  /** Volumen global de los sonidos 0..100 (0=silencio, 100=máximo) */
  volume: number
  /** Pack de sonidos: paleta de tonos para feedback. */
  soundPack: SoundPack
  /** Intensidad de animaciones de la interfaz. */
  motion: MotionLevel
  /** Programación automática de modo oscuro por horario.
   *  Cuando ON, el tema cambia a dark entre `darkStart` y `darkEnd` sin
   *  importar la preferencia explícita. Anula al `force_dark_mode` admin
   *  solo si llega ANTES (el force admin sigue ganando si está activo). */
  darkSchedule: boolean
  darkStart: string // "20:00"
  darkEnd: string // "07:00"
  /** Mood emoji que ve Mari arriba del sidebar (😎🔥💪🌸✨🌙🎀) */
  moodEmoji: string
  /** Quiet hours: las notificaciones siguen llegando pero SIN sonido ni
   *  vibración entre estas horas. Útil para no molestar de madrugada. */
  quietHoursEnabled: boolean
  quietStart: string // "22:00"
  quietEnd: string // "07:00"
}

export type SoundPack = "default" | "vintage" | "arcade" | "premium"
export type MotionLevel = "off" | "low" | "normal" | "high"

const DEFAULTS: UserPrefs = {
  sounds: true,
  haptics: true,
  confetti: true,
  volume: 70,
  soundPack: "default",
  motion: "normal",
  darkSchedule: false,
  darkStart: "20:00",
  darkEnd: "07:00",
  moodEmoji: "✨",
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "07:00",
}

const KEY = "mari:prefs:v1"

function readPrefs(): UserPrefs {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<UserPrefs>
    return sanitize({ ...DEFAULTS, ...parsed })
  } catch {
    return DEFAULTS
  }
}

/** Normaliza valores fuera de rango / strings inválidos. */
function sanitize(p: UserPrefs): UserPrefs {
  const TIME_RE = /^\d{2}:\d{2}$/
  const VALID_PACKS: SoundPack[] = ["default", "vintage", "arcade", "premium"]
  const VALID_MOTION: MotionLevel[] = ["off", "low", "normal", "high"]
  return {
    sounds: !!p.sounds,
    haptics: !!p.haptics,
    confetti: !!p.confetti,
    volume: Math.max(0, Math.min(100, Math.round(p.volume ?? DEFAULTS.volume))),
    soundPack: VALID_PACKS.includes(p.soundPack) ? p.soundPack : DEFAULTS.soundPack,
    motion: VALID_MOTION.includes(p.motion) ? p.motion : DEFAULTS.motion,
    darkSchedule: !!p.darkSchedule,
    darkStart: TIME_RE.test(p.darkStart ?? "") ? p.darkStart : DEFAULTS.darkStart,
    darkEnd: TIME_RE.test(p.darkEnd ?? "") ? p.darkEnd : DEFAULTS.darkEnd,
    moodEmoji:
      typeof p.moodEmoji === "string" && p.moodEmoji.trim().length > 0
        ? p.moodEmoji.slice(0, 6)
        : DEFAULTS.moodEmoji,
    quietHoursEnabled: !!p.quietHoursEnabled,
    quietStart: TIME_RE.test(p.quietStart ?? "") ? p.quietStart : DEFAULTS.quietStart,
    quietEnd: TIME_RE.test(p.quietEnd ?? "") ? p.quietEnd : DEFAULTS.quietEnd,
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

/* ──────────────────────────────────────────────────────
 * Helpers de tiempo (quiet hours / dark schedule)
 * Ambos rangos soportan WRAP-AROUND: si start > end (22:00 → 07:00)
 * el rango cruza medianoche y se evalúa correctamente.
 * ────────────────────────────────────────────────────── */

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map((x) => Number(x))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

export function isWithinTimeRange(now: Date, start: string, end: string): boolean {
  const cur = now.getHours() * 60 + now.getMinutes()
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s === e) return false
  if (s < e) {
    // Rango normal: 09:00 → 18:00
    return cur >= s && cur < e
  }
  // Rango con wrap-around: 22:00 → 07:00
  return cur >= s || cur < e
}

/** ¿Estamos en quiet hours según las prefs del usuario? */
export function isQuietNow(prefs: UserPrefs = cached, now: Date = new Date()): boolean {
  if (!prefs.quietHoursEnabled) return false
  return isWithinTimeRange(now, prefs.quietStart, prefs.quietEnd)
}

/** ¿El dark schedule pide modo oscuro ahora mismo? */
export function isDarkScheduleNow(prefs: UserPrefs = cached, now: Date = new Date()): boolean {
  if (!prefs.darkSchedule) return false
  return isWithinTimeRange(now, prefs.darkStart, prefs.darkEnd)
}

import toast from "react-hot-toast"

import { sound } from "./sound"
import { getPrefs } from "./userPrefs"

/**
 * Sistema simple de achievements / milestones.
 *
 * Filosofía: el código que tiene contexto (sales, reviews, dashboard…)
 * llama `tryUnlock(id, ...)` cuando piensa que se cumple. La función
 * decide si ya estaba desbloqueado y, si no, dispara confetti + toast.
 *
 * Persistencia: se guarda en localStorage para evitar disparar 2 veces
 * el mismo logro. Los logros con scope `daily` se resetean al cambiar de
 * día; los `forever` se quedan para siempre.
 *
 * NO toca BD ni rompe nada si falla — es 100% efecto visual.
 */

export type AchievementId =
  | "first_sale_today"
  | "daily_goal_reached"
  | "hundred_products"
  | "first_five_star_review"
  | "ten_sales_streak"

interface AchievementMeta {
  title: string
  emoji: string
  /** "daily" se resetea cada día; "forever" se guarda para siempre. */
  scope: "daily" | "forever"
  /** Sonido a reproducir. */
  sfx: "notifyMoney" | "notifyMilestone" | "notifyDelivery"
}

const ACHIEVEMENTS: Record<AchievementId, AchievementMeta> = {
  first_sale_today: {
    title: "¡Primera venta del día!",
    emoji: "🎉",
    scope: "daily",
    sfx: "notifyMoney",
  },
  daily_goal_reached: {
    title: "¡Meta diaria alcanzada!",
    emoji: "🎯",
    scope: "daily",
    sfx: "notifyMilestone",
  },
  hundred_products: {
    title: "100 productos en tu catálogo",
    emoji: "📦",
    scope: "forever",
    sfx: "notifyMilestone",
  },
  first_five_star_review: {
    title: "Primera reseña 5 estrellas",
    emoji: "⭐",
    scope: "forever",
    sfx: "notifyDelivery",
  },
  ten_sales_streak: {
    title: "10 ventas seguidas",
    emoji: "🔥",
    scope: "daily",
    sfx: "notifyMilestone",
  },
}

const STORAGE_KEY = "mari:achievements:v1"

/**
 * Estructura persistida:
 *   {
 *     date: "2026-06-18",        // YYYY-MM-DD del último reset diario
 *     daily: ["first_sale_today"],
 *     forever: ["hundred_products"]
 *   }
 */
interface PersistedState {
  date: string
  daily: AchievementId[]
  forever: AchievementId[]
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function load(): PersistedState {
  if (typeof window === "undefined") return { date: today(), daily: [], forever: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { date: today(), daily: [], forever: [] }
    const parsed = JSON.parse(raw) as PersistedState
    // Si pasó la medianoche, resetea daily
    if (parsed.date !== today()) {
      return { date: today(), daily: [], forever: parsed.forever ?? [] }
    }
    return {
      date: parsed.date,
      daily: parsed.daily ?? [],
      forever: parsed.forever ?? [],
    }
  } catch {
    return { date: today(), daily: [], forever: [] }
  }
}

function save(s: PersistedState) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {}
}

/** ¿El logro está ya desbloqueado en este device? */
export function isUnlocked(id: AchievementId): boolean {
  const state = load()
  const meta = ACHIEVEMENTS[id]
  if (!meta) return false
  return meta.scope === "daily"
    ? state.daily.includes(id)
    : state.forever.includes(id)
}

/**
 * Intenta desbloquear un logro. Si ya estaba desbloqueado, no hace nada.
 * Si no, lo persiste, dispara confetti (respetando prefs), toast y
 * sonido del pack.
 *
 * Retorna `true` si efectivamente disparó el achievement.
 */
export function tryUnlock(id: AchievementId): boolean {
  const meta = ACHIEVEMENTS[id]
  if (!meta) return false
  if (isUnlocked(id)) return false

  const state = load()
  if (meta.scope === "daily") {
    state.daily = [...state.daily, id]
  } else {
    state.forever = [...state.forever, id]
  }
  save(state)

  // Toast destacado con emoji grande
  toast.success(`${meta.emoji} ${meta.title}`, {
    duration: 4500,
    style: {
      background: "linear-gradient(135deg, #fff7ed, #fff0f7)",
      color: "#831843",
      fontWeight: 800,
      letterSpacing: "0.02em",
      border: "1px solid rgba(232,121,249,0.3)",
      boxShadow: "0 10px 30px -10px rgba(232,121,249,0.4)",
    },
    icon: meta.emoji,
  })

  // Sonido del pack activo
  try {
    sound.play(meta.sfx)
  } catch {}

  // Confetti si el usuario lo permite. Carga lazy para no inflar bundle.
  if (getPrefs().confetti) {
    import("./confetti")
      .then(({ fireConfetti }) =>
        fireConfetti({
          count: meta.scope === "forever" ? 120 : 80,
          duration: 2200,
        }),
      )
      .catch(() => {})
  }
  return true
}

/** Útil para debug / reset manual. */
export function resetAchievements(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}

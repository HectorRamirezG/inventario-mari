import { useEffect, useState } from "react"

/**
 * Preferencias dedicadas al sistema de notificaciones.
 *
 * Independientes de `userPrefs` (que es global de la app). Aquí guardamos:
 *  - Tipos silenciados (por categoría)
 *  - Quiet hours (rango de horas en el que no suenan)
 *  - Silenciar TODO el sonido de notifs (sin tocar el sonido global de la app)
 *  - Push nativas activadas/desactivadas (opt-in)
 *
 * Persistencia en localStorage `mari:notifPrefs:v1`. Reactivo via custom event.
 */

/* ────── Tipos canónicos del sistema ────── */
/** Categorías agrupadas para que la UI pueda silenciar grupos completos. */
export type NotifCategory =
  | "sales" // ventas, abonos, cancelaciones
  | "proofs" // comprobantes de pago
  | "support" // tickets de soporte
  | "wishes" // sugerencias de cliente
  | "reviews" // reseñas
  | "delivery" // comandas de entrega
  | "stock" // alertas de inventario
  | "milestone" // metas alcanzadas, cumpleaños
  | "system" // recordatorios at-load, otros

/** Mapa tipo → categoría. Usado para silenciar grupos. */
export const NOTIF_TYPE_CATEGORY: Record<string, NotifCategory> = {
  // Ventas / pagos
  payment_added: "sales",
  sale_paid: "sales",
  sale_cancelled: "sales",
  new_layaway: "sales",
  layaway_extension: "sales",
  layaway_due_soon: "sales",
  layaway_stale: "sales",
  // Comprobantes
  payment_proof: "proofs",
  payment_proof_uploaded: "proofs",
  payment_proof_reminder: "proofs",
  payment_proof_received: "proofs",
  payment_approved: "proofs",
  payment_rejected: "proofs",
  proof_rejected: "proofs",
  // Soporte
  support_ticket: "support",
  support_resolved: "support",
  // Wishes
  wish_created: "wishes",
  wish_status: "wishes",
  wish_available: "wishes",
  // Reviews
  review_created: "reviews",
  review_published: "reviews",
  // Delivery
  delivery_picked_up: "delivery",
  delivery_delivered: "delivery",
  delivery_not_opened: "delivery",
  // Stock
  stock_low: "stock",
  stock_back: "stock",
  // Milestones / etc
  daily_goal: "milestone",
  birthday: "milestone",
  new_customer: "milestone",
  abandoned_cart: "milestone",
  // Sistema
  price_adjusted: "system",
}

export const NOTIF_CATEGORY_META: Record<
  NotifCategory,
  { label: string; hint: string; emoji: string }
> = {
  sales: {
    label: "Ventas y abonos",
    hint: "Cobros, liquidaciones, cancelaciones",
    emoji: "💸",
  },
  proofs: {
    label: "Comprobantes de pago",
    hint: "Cuando un cliente sube su transferencia",
    emoji: "🧾",
  },
  support: {
    label: "Soporte",
    hint: "Tickets de incidencias y resoluciones",
    emoji: "🆘",
  },
  wishes: {
    label: "Sugerencias",
    hint: "Lo que los clientes piden y no tienes",
    emoji: "✨",
  },
  reviews: {
    label: "Reseñas",
    hint: "Comentarios y calificaciones nuevas",
    emoji: "⭐",
  },
  delivery: {
    label: "Comandas y entregas",
    hint: "Estatus del repartidor",
    emoji: "🛵",
  },
  stock: {
    label: "Inventario",
    hint: "Stock bajo, productos agotados, reposiciones",
    emoji: "📦",
  },
  milestone: {
    label: "Logros y eventos",
    hint: "Metas, cumpleaños, carritos abandonados",
    emoji: "🎉",
  },
  system: {
    label: "Sistema",
    hint: "Avisos generales",
    emoji: "🔔",
  },
}

export const ALL_CATEGORIES: NotifCategory[] = [
  "sales",
  "proofs",
  "support",
  "wishes",
  "reviews",
  "delivery",
  "stock",
  "milestone",
  "system",
]

/* ────── Estructura de prefs ────── */

export interface NotifPrefs {
  /** Si false, el bell no suena ni vibra. */
  enabled: boolean
  /** Sonido por defecto cuando llega cualquier notif. */
  soundOnIncoming: boolean
  /** Vibración por defecto cuando llega cualquier notif. */
  hapticOnIncoming: boolean
  /** Push notificaciones nativas (Web Push). Opt-in. */
  pushNativeEnabled: boolean
  /** Categorías silenciadas (no suenan ni vibran ni muestran toast). */
  mutedCategories: NotifCategory[]
  /** Quiet hours: rango horario en el que no hay sonido/vibración. */
  quietHours: {
    enabled: boolean
    /** "HH:MM" inicio (24h) */
    from: string
    /** "HH:MM" fin (24h) */
    to: string
  }
}

const DEFAULTS: NotifPrefs = {
  enabled: true,
  soundOnIncoming: true,
  hapticOnIncoming: true,
  pushNativeEnabled: false,
  mutedCategories: [],
  quietHours: {
    enabled: false,
    from: "22:00",
    to: "08:00",
  },
}

const KEY = "mari:notifPrefs:v1"

function readPrefs(): NotifPrefs {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>
    return {
      ...DEFAULTS,
      ...parsed,
      quietHours: { ...DEFAULTS.quietHours, ...(parsed.quietHours ?? {}) },
      mutedCategories: Array.isArray(parsed.mutedCategories)
        ? (parsed.mutedCategories as NotifCategory[])
        : [],
    }
  } catch {
    return DEFAULTS
  }
}

function writePrefs(next: NotifPrefs) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent("mari:notifPrefs-change", { detail: next }))
  } catch {
    /* noop */
  }
}

let cached: NotifPrefs = readPrefs()

/** Lee la pref actual sin React. */
export function getNotifPrefs(): NotifPrefs {
  return cached
}

/** Actualiza una pref individual. */
export function setNotifPref<K extends keyof NotifPrefs>(key: K, value: NotifPrefs[K]) {
  cached = { ...cached, [key]: value }
  writePrefs(cached)
}

/** Reemplaza todas las prefs. */
export function setAllNotifPrefs(next: NotifPrefs) {
  cached = next
  writePrefs(cached)
}

export function resetNotifPrefs() {
  cached = { ...DEFAULTS }
  writePrefs(cached)
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) cached = readPrefs()
  })
  window.addEventListener("mari:notifPrefs-change", (e: any) => {
    if (e?.detail) cached = e.detail
  })
}

/* ────── Helpers ────── */

/** Determina si una hora dada cae dentro del rango "quiet hours". */
export function isWithinQuietHours(date: Date = new Date()): boolean {
  const prefs = getNotifPrefs()
  if (!prefs.quietHours.enabled) return false
  const [fH, fM] = prefs.quietHours.from.split(":").map(Number)
  const [tH, tM] = prefs.quietHours.to.split(":").map(Number)
  const now = date.getHours() * 60 + date.getMinutes()
  const from = (fH || 0) * 60 + (fM || 0)
  const to = (tH || 0) * 60 + (tM || 0)
  if (from === to) return false
  // Rango cruza medianoche (ej. 22:00 → 08:00)
  if (from > to) return now >= from || now < to
  return now >= from && now < to
}

/** ¿Está silenciada la categoría a la que pertenece este tipo? */
export function isCategoryMuted(type: string): boolean {
  const cat = NOTIF_TYPE_CATEGORY[type] ?? "system"
  return getNotifPrefs().mutedCategories.includes(cat)
}

/** Decide si una notificación entrante debe sonar/vibrar. */
export function shouldPlayForNotif(type: string): {
  sound: boolean
  haptic: boolean
} {
  const prefs = getNotifPrefs()
  if (!prefs.enabled) return { sound: false, haptic: false }
  if (isCategoryMuted(type)) return { sound: false, haptic: false }
  const quiet = isWithinQuietHours()
  return {
    sound: prefs.soundOnIncoming && !quiet,
    haptic: prefs.hapticOnIncoming && !quiet,
  }
}

/* ────── Hook React ────── */

export function useNotifPrefs() {
  const [prefs, setPrefs] = useState<NotifPrefs>(cached)

  useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail) setPrefs(e.detail)
    }
    window.addEventListener("mari:notifPrefs-change", handler)
    return () => window.removeEventListener("mari:notifPrefs-change", handler)
  }, [])

  return {
    prefs,
    setPref: setNotifPref,
    setAll: setAllNotifPrefs,
    reset: resetNotifPrefs,
    toggleCategory: (cat: NotifCategory) => {
      const muted = prefs.mutedCategories.includes(cat)
        ? prefs.mutedCategories.filter((c) => c !== cat)
        : [...prefs.mutedCategories, cat]
      setNotifPref("mutedCategories", muted)
    },
  }
}

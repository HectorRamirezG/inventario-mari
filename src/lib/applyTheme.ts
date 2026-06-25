/**
 * Aplica el accent color elegido en BusinessRules como CSS variables.
 * Es destructivo (sobreescribe `--color-primary*` en `<html>`), pero
 * solo se ejecuta una vez por cambio del flag y no toca nada más.
 *
 * Si el admin elige "pink" (default), restaura los valores originales
 * del index.css para no degradar el branding base de Beauty's Me.
 *
 * Exporta también `ACCENT_NAMES`, `ACCENT_PREVIEW` y `ACCENT_LABELS`
 * para que admin y cliente reutilicen el mismo grid de colores sin
 * duplicar constantes (lo usa BusinessRulesPage y UserProfileDrawer).
 */

/** Nombres canónicos de las paletas disponibles. */
export const ACCENT_NAMES = [
  "pink",
  "violet",
  "rose",
  "amber",
  "emerald",
  "sky",
  "indigo",
] as const

export type AccentName = (typeof ACCENT_NAMES)[number]

export type AccentPalette = {
  base: string
  hover: string
  active: string
  subtle: string
  glass: string
  /** Color HEX a usar en `<meta name="theme-color">` modo claro */
  meta: string
  /** Color "from" del gradient bi-color de marca. */
  from: string
  /** Color "to" del gradient bi-color (contrastante). */
  to: string
}

const PALETTES: Record<AccentName, AccentPalette> = {
  pink: {
    base: "#e6007e",
    hover: "#c4006b",
    active: "#a00058",
    subtle: "#fff0f7",
    glass: "rgba(230, 0, 126, 0.05)",
    meta: "#e6007e",
    from: "#e6007e",
    to: "#a855f7",
  },
  violet: {
    base: "#7c3aed",
    hover: "#6d28d9",
    active: "#5b21b6",
    subtle: "#f3eafd",
    glass: "rgba(124, 58, 237, 0.06)",
    meta: "#7c3aed",
    from: "#7c3aed",
    to: "#ec4899",
  },
  rose: {
    base: "#e11d48",
    hover: "#be123c",
    active: "#9f1239",
    subtle: "#ffe9ee",
    glass: "rgba(225, 29, 72, 0.06)",
    meta: "#e11d48",
    from: "#e11d48",
    to: "#f97316",
  },
  amber: {
    base: "#f59e0b",
    hover: "#d97706",
    active: "#b45309",
    subtle: "#fff7e6",
    glass: "rgba(245, 158, 11, 0.06)",
    meta: "#f59e0b",
    from: "#f59e0b",
    to: "#dc2626",
  },
  emerald: {
    base: "#10b981",
    hover: "#059669",
    active: "#047857",
    subtle: "#e7faf2",
    glass: "rgba(16, 185, 129, 0.06)",
    meta: "#10b981",
    from: "#10b981",
    to: "#0ea5e9",
  },
  sky: {
    base: "#0ea5e9",
    hover: "#0284c7",
    active: "#0369a1",
    subtle: "#e6f6fe",
    glass: "rgba(14, 165, 233, 0.06)",
    meta: "#0ea5e9",
    from: "#0ea5e9",
    to: "#6366f1",
  },
  indigo: {
    base: "#4f46e5",
    hover: "#4338ca",
    active: "#3730a3",
    subtle: "#ebeafd",
    glass: "rgba(79, 70, 229, 0.06)",
    meta: "#4f46e5",
    from: "#4f46e5",
    to: "#06b6d4",
  },
}

export function applyAccent(accent: AccentName): void {
  if (typeof document === "undefined") return
  const p = PALETTES[accent] ?? PALETTES.pink
  const root = document.documentElement.style
  root.setProperty("--color-primary", p.base)
  root.setProperty("--color-primary-hover", p.hover)
  root.setProperty("--color-primary-active", p.active)
  root.setProperty("--color-primary-subtle", p.subtle)
  root.setProperty("--color-primary-glass", p.glass)
  // Bi-color para gradient de marca. Las CSS classes .bg-brand /
  // .text-brand-gradient leen estas vars y reaccionan automáticamente.
  root.setProperty("--brand-from", p.from)
  root.setProperty("--brand-to", p.to)
  // Solo overrideamos theme-color cuando estamos en light. En dark
  // mantenemos el slate de la barra del sistema.
  if (document.documentElement.dataset.theme !== "dark") {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", p.meta)
  }
}

/** Etiqueta legible bilingüe del acento — se usa en pickers (admin + cliente). */
export const ACCENT_LABELS: Record<AccentName, string> = {
  pink: "Rosa · Violeta",
  violet: "Violeta · Rosa",
  rose: "Rojo · Naranja",
  amber: "Ámbar · Rojo",
  emerald: "Verde · Azul",
  sky: "Azul · Índigo",
  indigo: "Índigo · Cian",
}

/** Gradient CSS listo para `background:` — preview del color en pickers. */
export const ACCENT_PREVIEW: Record<AccentName, string> = {
  pink: "linear-gradient(135deg,#e6007e,#a855f7)",
  violet: "linear-gradient(135deg,#7c3aed,#ec4899)",
  rose: "linear-gradient(135deg,#e11d48,#f97316)",
  amber: "linear-gradient(135deg,#f59e0b,#dc2626)",
  emerald: "linear-gradient(135deg,#10b981,#0ea5e9)",
  sky: "linear-gradient(135deg,#0ea5e9,#6366f1)",
  indigo: "linear-gradient(135deg,#4f46e5,#06b6d4)",
}

/**
 * Forzar/quitar dark mode globalmente (regla `force_dark_mode`).
 * Si force=true, fuerza dark y deshabilita el toggle individual.
 * Si force=false, deja que la preferencia del usuario gane.
 */
export function applyForceDark(force: boolean): void {
  if (typeof document === "undefined") return
  if (force) {
    document.documentElement.dataset.theme = "dark"
    document.documentElement.style.colorScheme = "dark"
    document.documentElement.dataset.themeForced = "1"
    document.documentElement.classList.add("dark")
  } else {
    delete document.documentElement.dataset.themeForced
  }
}

/**
 * Forzar/quitar light mode globalmente (regla `force_light_mode`).
 * Si force=true, fuerza light y deshabilita el toggle individual.
 * NOTA: si `force_dark_mode` también está activo, ESE gana — esta
 * función solo aplica si dark NO está forzado.
 */
export function applyForceLight(force: boolean): void {
  if (typeof document === "undefined") return
  // Si dark ya está forzado, no pisar.
  if (document.documentElement.dataset.themeForced === "1") return
  if (force) {
    document.documentElement.dataset.theme = "light"
    document.documentElement.style.colorScheme = "light"
    document.documentElement.dataset.themeForced = "1"
    document.documentElement.classList.remove("dark")
  } else {
    // Solo limpiamos si el forzado actual era light (no tocamos dark).
    if (
      document.documentElement.dataset.themeForced === "1" &&
      document.documentElement.dataset.theme === "light"
    ) {
      delete document.documentElement.dataset.themeForced
    }
  }
}

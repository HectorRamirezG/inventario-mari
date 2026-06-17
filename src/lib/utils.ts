import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ──────────────────────────────────────────────────────────────
 * Generadores deterministicos a partir de strings
 * Sirven para avatares con color unico por nombre, badges, etc.
 * ────────────────────────────────────────────────────────────── */

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/** Hue 0-360 determinístico para un string (nombre, id, etc.) */
export function hueFromString(s: string | null | undefined): number {
  if (!s) return 320
  return hashString(s) % 360
}

/** Color HSL listo para usar en background o text */
export function colorFromString(s: string | null | undefined, sat = 70, light = 55): string {
  return `hsl(${hueFromString(s)} ${sat}% ${light}%)`
}

/**
 * Gradiente CSS único por nombre. Pensado para avatares y headers
 * personalizados. Tono base + tono complementario suave.
 */
export function avatarGradient(s: string | null | undefined): string {
  const h = hueFromString(s)
  const h2 = (h + 40) % 360
  return `linear-gradient(135deg, hsl(${h} 75% 60%), hsl(${h2} 75% 50%))`
}

/** Iniciales (máx 2) a partir de un nombre completo. */
export function initialsFromName(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
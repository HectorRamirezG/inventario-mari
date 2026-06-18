/**
 * Aplica el nivel de animación elegido por el usuario en el `<html>`
 * como un atributo `data-motion`. CSS y framer-motion deciden qué
 * hacer con cada nivel:
 *   - "off":    sin animaciones (transitions y animations 0s)
 *   - "low":    duración reducida 50%, sin spring
 *   - "normal": defaults
 *   - "high":   springs más rebotantes, durations 110%
 *
 * Hace SOFT-OVERRIDE de prefers-reduced-motion del SO: si el usuario
 * explícitamente elige "high" desde la app, ganamos sobre el OS. Si
 * elige "off" o el OS pide reduce, los dos pueden coincidir.
 */

import type { MotionLevel } from "./userPrefs"

export function applyMotionLevel(level: MotionLevel) {
  if (typeof document === "undefined") return
  document.documentElement.dataset.motion = level
}

/**
 * Multiplicador para `framer-motion` que aplicado a `duration`/`delay`
 * respeta la preferencia. Componentes que quieran respetar la regla
 * pueden importar esto y multiplicar:
 *
 *   const m = useMotionScale()
 *   <motion.div animate={{...}} transition={{ duration: 0.4 * m }} />
 */
export function getMotionScale(level: MotionLevel): number {
  switch (level) {
    case "off":
      return 0
    case "low":
      return 0.5
    case "high":
      return 1.1
    default:
      return 1
  }
}

import type { CSSProperties } from "react"
import type { Transition } from "framer-motion"

// Curva estándar para paneles que entran/salen sin rebote.
export const OVERLAY_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Tween rápido para el backdrop (opacity).
export const OVERLAY_BACKDROP_TRANSITION: Transition = {
  duration: 0.18,
  ease: "easeOut",
}

// Tween corto para paneles (sheet/modal/drawer) sin spring.
export const OVERLAY_PANEL_TRANSITION: Transition = {
  duration: 0.22,
  ease: OVERLAY_EASE,
}

// Variante más rápida para subcomponentes internos.
export const OVERLAY_INNER_TRANSITION: Transition = {
  duration: 0.16,
  ease: OVERLAY_EASE,
}

// Estilos que fuerzan capa GPU dedicada y evitan repaints durante la animación.
export const OVERLAY_PANEL_STYLE: CSSProperties = {
  transform: "translate3d(0,0,0)",
  willChange: "transform, opacity",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  contain: "layout paint",
}

// Tiempo a esperar antes de montar contenido secundario (Q&A, charts, etc.)
// para no competir con la animación de entrada del panel.
export const OVERLAY_DEFER_MS = 220

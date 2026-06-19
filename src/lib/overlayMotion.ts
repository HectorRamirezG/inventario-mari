import type { CSSProperties } from "react"
import type { Transition } from "framer-motion"

// Curva estándar para paneles que entran/salen sin rebote.
export const OVERLAY_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const OVERLAY_BACKDROP_TRANSITION: Transition = {
  duration: 0.18,
  ease: "easeOut",
}

export const OVERLAY_PANEL_TRANSITION: Transition = {
  duration: 0.22,
  ease: OVERLAY_EASE,
}

export const OVERLAY_INNER_TRANSITION: Transition = {
  duration: 0.16,
  ease: OVERLAY_EASE,
}

// translate3d promueve a capa GPU sin los efectos colaterales de
// will-change (que mantiene la capa permanente y satura memoria mobile)
// ni de contain (que entra en conflicto con transforms animados).
export const OVERLAY_PANEL_STYLE: CSSProperties = {
  transform: "translate3d(0,0,0)",
  WebkitBackfaceVisibility: "hidden",
  backfaceVisibility: "hidden",
}

// Tiempo a esperar antes de montar contenido secundario (Q&A, charts, etc.)
// Mantiene el panel principal estable durante toda la animación de entrada
// más un colchón para que el navegador termine de pintar.
export const OVERLAY_DEFER_MS = 280

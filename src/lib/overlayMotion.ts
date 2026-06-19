import type { CSSProperties } from "react"
import type { Transition } from "framer-motion"

// Curva easeOutExpo estilo iOS / panel de control: arranca rápido y
// desacelera de forma orgánica. Da sensación de fluidez en mobile.
export const OVERLAY_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export const OVERLAY_BACKDROP_TRANSITION: Transition = {
  duration: 0.28,
  ease: "easeOut",
}

// Duración larga (380ms) para que la GPU del celular tenga tiempo de
// pintar todos los frames intermedios. Tween corto (220ms) saltaba al
// final en dispositivos de gama media.
export const OVERLAY_PANEL_TRANSITION: Transition = {
  duration: 0.38,
  ease: OVERLAY_EASE,
}

export const OVERLAY_INNER_TRANSITION: Transition = {
  duration: 0.22,
  ease: OVERLAY_EASE,
}

// will-change activo en la capa GPU permite a iOS/Android prereservar la
// memoria de la textura y mantener los 60fps durante toda la animación.
// translate3d garantiza la promoción de capa en navegadores que ignoran
// will-change. backface-visibility evita micro-jitter en bordes.
export const OVERLAY_PANEL_STYLE: CSSProperties = {
  transform: "translate3d(0,0,0)",
  willChange: "transform, opacity",
  WebkitBackfaceVisibility: "hidden",
  backfaceVisibility: "hidden",
}

// Tiempo a esperar antes de montar contenido secundario (Q&A, charts).
// = duración del panel + colchón de 60ms para que termine de pintar el
// último frame antes de empujar trabajo nuevo al hilo principal.
export const OVERLAY_DEFER_MS = 440

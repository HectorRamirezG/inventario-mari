/**
 * Pequeño efecto de confetti sin librerías externas.
 * Dibuja N piezas de papel cayendo con física simple, las colorea
 * con la paleta de la marca y se autodestruye.
 *
 * Respeta:
 *  - prefers-reduced-motion (sistema operativo)
 *  - prefs.confetti = false (preferencia del usuario)
 *
 * Uso:
 *   import { fireConfetti } from "@/lib/confetti"
 *   fireConfetti({ duration: 1800, count: 80 })
 */

import { getPrefs } from "./userPrefs"
import { getBusinessRules } from "../features/settings/businessRulesService"

interface ConfettiOptions {
  /** Duración total del efecto en ms. */
  duration?: number
  /** Número de piezas. */
  count?: number
  /** Origen Y de las piezas en px (default: 25% desde abajo). */
  originY?: number
  /** Override de colores. */
  colors?: string[]
}

const DEFAULT_COLORS = [
  "#e6007e", // primary
  "#a855f7", // purple
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ec4899", // pink
]

let activeCanvas: HTMLCanvasElement | null = null
let cleanupTimer: number | null = null

export function fireConfetti(options: ConfettiOptions = {}) {
  if (typeof window === "undefined") return

  // Respetar prefers-reduced-motion del sistema
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return

  // Respetar preferencia explícita del usuario
  if (!getPrefs().confetti) return

  // Respetar regla global del admin (BusinessRules)
  if (!getBusinessRules().confetti_on_purchase) return

  const {
    duration = 1800,
    count = 80,
    colors = DEFAULT_COLORS,
  } = options

  // Limpiar canvas previo si seguía vivo
  if (activeCanvas) {
    try { activeCanvas.remove() } catch {}
    activeCanvas = null
  }
  if (cleanupTimer !== null) {
    window.clearTimeout(cleanupTimer)
    cleanupTimer = null
  }

  const canvas = document.createElement("canvas")
  canvas.style.position = "fixed"
  canvas.style.inset = "0"
  canvas.style.pointerEvents = "none"
  canvas.style.zIndex = "9999"
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  activeCanvas = canvas

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    canvas.remove()
    return
  }

  const originX = canvas.width / 2
  const originY = options.originY ?? canvas.height * 0.4

  type Piece = {
    x: number
    y: number
    vx: number
    vy: number
    color: string
    rot: number
    vRot: number
    size: number
    shape: "rect" | "circle"
  }

  const pieces: Piece[] = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 6 + Math.random() * 9
    pieces.push({
      x: originX + (Math.random() - 0.5) * 80,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.4,
      size: 6 + Math.random() * 6,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    })
  }

  const start = performance.now()
  const gravity = 0.32
  const drag = 0.995
  let raf = 0

  function draw(now: number) {
    if (!ctx || !activeCanvas) return
    const elapsed = now - start
    const t = elapsed / duration
    // Fade-out por opacidad global al final
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const alpha = Math.max(0, 1 - Math.max(0, t - 0.6) * 2.5)

    for (const p of pieces) {
      p.vy += gravity
      p.vx *= drag
      p.vy *= drag
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vRot

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.5)
      } else {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    if (elapsed < duration && activeCanvas) {
      raf = requestAnimationFrame(draw)
    } else {
      cancelAnimationFrame(raf)
      try { canvas.remove() } catch {}
      if (activeCanvas === canvas) activeCanvas = null
    }
  }
  raf = requestAnimationFrame(draw)

  // Failsafe cleanup
  cleanupTimer = window.setTimeout(() => {
    if (activeCanvas === canvas) {
      try { canvas.remove() } catch {}
      activeCanvas = null
    }
    cleanupTimer = null
  }, duration + 500)
}

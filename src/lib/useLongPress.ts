import { useCallback, useRef } from "react"

interface Options {
  /** Ms que el dedo debe mantener presión antes de disparar. Default 400. */
  delay?: number
  /** Si el dedo se mueve más de Npx mientras espera, cancela (es scroll). */
  moveThreshold?: number
  /** Bloquear el menú contextual del browser para evitar conflicto. */
  preventContextMenu?: boolean
}

/**
 * Hook nativo para detectar Long-Press (mantener presionado) en mobile
 * y desktop. Cancela si el dedo se mueve (scroll) o si llega un click
 * normal antes del delay.
 *
 * Devuelve un objeto con handlers listos para spread en un elemento:
 *   <div {...useLongPress(onLongPress, opts)}>
 *
 * onLongPress se llama UNA SOLA VEZ cuando el dedo lleva `delay` ms
 * sobre el elemento sin moverse. onCancel (callback opcional para el
 * caller) se llama cuando el dedo levanta (sirve para esconder previews).
 */
export function useLongPress<T extends HTMLElement = HTMLElement>(
  onLongPress: () => void,
  options: Options & { onCancel?: () => void } = {},
) {
  const {
    delay = 400,
    moveThreshold = 8,
    preventContextMenu = true,
    onCancel,
  } = options
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPosRef.current = null
  }, [])

  const start = useCallback(
    (x: number, y: number) => {
      clear()
      firedRef.current = false
      startPosRef.current = { x, y }
      timerRef.current = setTimeout(() => {
        firedRef.current = true
        onLongPress()
      }, delay)
    },
    [clear, delay, onLongPress],
  )

  const move = useCallback(
    (x: number, y: number) => {
      const s = startPosRef.current
      if (!s) return
      const dx = Math.abs(x - s.x)
      const dy = Math.abs(y - s.y)
      if (dx > moveThreshold || dy > moveThreshold) {
        clear()
      }
    },
    [clear, moveThreshold],
  )

  const end = useCallback(() => {
    clear()
    if (firedRef.current) {
      onCancel?.()
      firedRef.current = false
    }
  }, [clear, onCancel])

  return {
    onTouchStart: (e: React.TouchEvent<T>) => {
      const t = e.touches[0]
      if (!t) return
      start(t.clientX, t.clientY)
    },
    onTouchMove: (e: React.TouchEvent<T>) => {
      const t = e.touches[0]
      if (!t) return
      move(t.clientX, t.clientY)
    },
    onTouchEnd: end,
    onTouchCancel: end,
    onMouseDown: (e: React.MouseEvent<T>) => start(e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent<T>) => move(e.clientX, e.clientY),
    onMouseUp: end,
    onMouseLeave: end,
    onContextMenu: preventContextMenu
      ? (e: React.MouseEvent<T>) => e.preventDefault()
      : undefined,
  }
}

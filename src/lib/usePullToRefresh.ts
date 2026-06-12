import { useEffect, useRef, useState } from "react"

/**
 * Pull-to-refresh nativo del scroll. Se activa cuando el usuario está
 * en el tope del contenedor y arrastra hacia abajo más del `threshold`.
 *
 * Devuelve:
 *   - `containerRef`: pásalo al div que tiene `overflow-y: auto`.
 *   - `pulling`: distancia actual del jalón (0..threshold), útil para UI.
 *   - `refreshing`: true mientras se ejecuta `onRefresh`.
 */
export function usePullToRefresh(
  onRefresh: () => Promise<unknown> | unknown,
  opts: { threshold?: number; enabled?: boolean } = {}
) {
  const threshold = opts.threshold ?? 70
  const enabled = opts.enabled ?? true

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [pulling, setPulling] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        // Resistencia: cuesta más jalar mientras más se jala
        const dist = Math.min(threshold * 1.5, dy * 0.5)
        setPulling(dist)
      }
    }

    const onEnd = async () => {
      if (startY.current === null) return
      startY.current = null
      if (pulling >= threshold && !refreshing) {
        setRefreshing(true)
        try {
          await onRefresh()
        } finally {
          setRefreshing(false)
          setPulling(0)
        }
      } else {
        setPulling(0)
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: true })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("touchcancel", onEnd)

    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [enabled, threshold, pulling, refreshing, onRefresh])

  return { containerRef, pulling, refreshing, threshold }
}

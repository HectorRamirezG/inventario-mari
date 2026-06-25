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
  // Refs para no re-ejecutar el efecto cuando cambian `pulling`,
  // `refreshing` o `onRefresh`. Antes se hacía detach+attach en cada
  // setPulling (1 por touchmove) y se perdían eventos a mitad de gesto.
  const pullingRef = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { pullingRef.current = pulling }, [pulling])
  useEffect(() => { refreshingRef.current = refreshing }, [refreshing])
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

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
      if (startY.current === null || refreshingRef.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        // Resistencia: cuesta más jalar mientras más se jala
        const dist = Math.min(threshold * 1.5, dy * 0.5)
        pullingRef.current = dist
        setPulling(dist)
      }
    }

    const onEnd = async () => {
      if (startY.current === null) return
      startY.current = null
      if (pullingRef.current >= threshold && !refreshingRef.current) {
        setRefreshing(true)
        try {
          await onRefreshRef.current()
        } finally {
          setRefreshing(false)
          pullingRef.current = 0
          setPulling(0)
        }
      } else {
        pullingRef.current = 0
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
    // Deps mínimos: solo lo que cambia el setup. Los handlers leen
    // el resto desde refs.
  }, [enabled, threshold])

  return { containerRef, pulling, refreshing, threshold }
}

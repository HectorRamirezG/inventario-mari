import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RefreshCw, Loader2 } from "lucide-react"

interface Props {
  /** Función async que ejecuta el refresh. */
  onRefresh: () => Promise<unknown> | unknown
  children: React.ReactNode
  /** Píxeles de jalón necesarios para gatillar refresh. Default 70. */
  threshold?: number
  /** Desactivar (ej. cuando hay un drawer abierto). */
  disabled?: boolean
  className?: string
  /** Estilos inline opcionales (merge con `position: relative`). */
  style?: React.CSSProperties
}

/**
 * Wrapper que provee pull-to-refresh sobre el contenedor scrollable
 * principal. El indicador visual (un círculo con icono) aparece al
 * inicio mientras el usuario jala.
 *
 * Uso típico (en App.tsx envolviendo el <main>):
 *   <PullToRefresh onRefresh={refreshCurrentSection}>
 *     <main>...</main>
 *   </PullToRefresh>
 */
export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  disabled,
  className,
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [pulling, setPulling] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pullingRef = useRef(0)
  // Guardamos `onRefresh` y `refreshing` en refs para que el efecto NO
  // dependa de ellos. Antes el efecto se re-ejecutaba en cada render
  // (porque el caller pasa una arrow function nueva cada vez), lo que
  // hac\u00eda detach+attach de listeners constantemente. Combinado con
  // re-renders frecuentes del shell por realtime, durante el scroll
  // mobile el listener desaparec\u00eda a la mitad del gesto y el browser
  // interpretaba como overscroll \u2192 rebote al top.
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (disabled) return
    const el = containerRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 4) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshingRef.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        const dist = Math.min(threshold * 1.6, dy * 0.45)
        pullingRef.current = dist
        setPulling(dist)
      }
    }

    const onEnd = async () => {
      if (startY.current === null) {
        if (pullingRef.current > 0) {
          pullingRef.current = 0
          setPulling(0)
        }
        return
      }
      startY.current = null
      if (pullingRef.current >= threshold && !refreshingRef.current) {
        setRefreshing(true)
        try { await onRefreshRef.current() }
        finally {
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
    // \u26a0\ufe0f Deps a prop\u00f3sito m\u00ednimos: solo lo que afecta el setup real.
    // refreshing/onRefresh se leen via ref dentro de los handlers.
  }, [disabled, threshold])

  const triggered = pulling >= threshold
  const showIndicator = pulling > 0 || refreshing

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", ...style }}
    >
      {/* Indicador absoluto al tope */}
      <AnimatePresence>
        {showIndicator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="sticky top-0 left-0 right-0 z-30 pointer-events-none flex justify-center"
            style={{ height: 0 }}
          >
            <div
              className={`-mt-1 w-10 h-10 rounded-full flex items-center justify-center shadow-bloom transition-colors ${
                triggered || refreshing
                  ? "bg-primary text-white"
                  : "bg-white dark:bg-slate-900 text-primary border border-primary/20"
              }`}
              style={{
                transform: `translateY(${Math.min(pulling, threshold) * 0.6}px)`,
              }}
            >
              {refreshing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw
                  size={16}
                  style={{
                    transform: `rotate(${Math.min(pulling / threshold, 1) * 270}deg)`,
                    transition: "transform 80ms linear",
                  }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  )
}

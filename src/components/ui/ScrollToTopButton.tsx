import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp } from "lucide-react"

interface Props {
  /** Selector CSS del contenedor scrolleable. Default `.scroll-container-ios`. */
  targetSelector?: string
  /** Píxeles que hay que scrollear hacia abajo antes de mostrar el botón. */
  threshold?: number
  /** Distancia desde el fondo de la pantalla en clases tailwind. */
  bottomOffsetClass?: string
}

/**
 * Botón circular flotante que aparece cuando el contenedor scrolleable
 * activo está por debajo de `threshold` píxeles. Tap → scroll suave al
 * tope. Auto-oculta cuando estás arriba.
 *
 * Se engancha al PRIMER elemento que matchee `targetSelector` en el DOM
 * y lo re-evalúa cuando cambia la ruta. Si no encuentra, hace nada.
 */
export default function ScrollToTopButton({
  targetSelector = ".scroll-container-ios",
  threshold = 500,
  bottomOffsetClass = "bottom-20 md:bottom-6",
}: Props) {
  const [visible, setVisible] = useState(false)
  const scrollerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof document === "undefined") return
    // Reintenta encontrar el contenedor durante 1.5s tras el mount/route
    // change para cubrir el caso de animaciones de transición de página.
    let attempts = 0
    let raf = 0
    const find = () => {
      const el = document.querySelector(targetSelector) as HTMLElement | null
      if (el) {
        attach(el)
        return
      }
      if (++attempts < 30) {
        raf = window.setTimeout(find, 50)
      }
    }

    const onScroll = () => {
      const el = scrollerRef.current
      if (!el) return
      setVisible(el.scrollTop > threshold)
    }

    const attach = (el: HTMLElement) => {
      // Si ya estaba pegado al mismo, no rehacemos.
      if (scrollerRef.current === el) return
      detach()
      scrollerRef.current = el
      el.addEventListener("scroll", onScroll, { passive: true })
      // Evalúa inicial por si abrió la pantalla ya scrolleada.
      onScroll()
    }

    const detach = () => {
      const el = scrollerRef.current
      if (el) el.removeEventListener("scroll", onScroll)
      scrollerRef.current = null
      setVisible(false)
    }

    find()
    // Reintenta cuando el browser navega (popstate cubre back/forward, y
    // un MutationObserver atrapa cambios de ruta SPA).
    const onPop = () => {
      detach()
      attempts = 0
      find()
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (raf) window.clearTimeout(raf)
      detach()
    }
  }, [targetSelector, threshold])

  function handleClick() {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="scroll-top"
          type="button"
          onClick={handleClick}
          aria-label="Volver arriba"
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={`fixed right-4 ${bottomOffsetClass} z-40 w-11 h-11 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-primary flex items-center justify-center shadow-lg press backdrop-blur-md`}
        >
          <ArrowUp size={18} strokeWidth={2.5} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { Package, ChevronLeft, ChevronRight } from "lucide-react"

/**
 * Cada variante aporta sus propias fotos al carrusel. El componente
 * "aplana" todas las fotos en una sola tira pero recuerda a qué variante
 * pertenece cada foto. Al hacer swipe se mueve foto-a-foto y, cuando
 * cruza el borde de una variante, dispara `onVariantChange`.
 *
 * También se puede cambiar la variante "desde afuera" (clic en un chip)
 * y el carrusel hace scroll automático a la primera foto de esa variante.
 */
export interface CarouselVariant {
  id: string
  name: string
  images: string[]
}

interface Props {
  variants: CarouselVariant[]
  /** Variante activa controlada por el padre (clic en chip) */
  selectedVariantId: string | null
  /** Se dispara cuando el swipe cambia de variante */
  onVariantChange: (variantId: string) => void
  /** Aspect ratio CSS (default 1/1). Ej: "4/5" */
  aspect?: string
  /** Tap en imagen (opcional, p.ej. abrir fullscreen) */
  onTap?: () => void
  className?: string
}

/**
 * Carrusel agrupado por variantes. Estilo Shein/Instagram:
 * - Foto a foto con scroll-snap (gestos nativos del navegador, súper fluidos)
 * - El indicador inferior tipo "pill" muestra qué variante está visible
 * - Click en chip externo → scroll suave a esa variante
 * - Swipe que cruza variantes actualiza el chip activo en tiempo real
 */
export default function VariantImageCarousel({
  variants,
  selectedVariantId,
  onVariantChange,
  aspect = "1/1",
  onTap,
  className = "",
}: Props) {
  // Aplanamos a una lista única con la pista de qué variante es cada foto
  const slides = useMemo(() => {
    const out: { url: string; variantId: string; variantName: string; localIndex: number; total: number }[] = []
    for (const v of variants) {
      const imgs = v.images.filter(Boolean)
      if (imgs.length === 0) continue
      imgs.forEach((url, i) => {
        out.push({
          url,
          variantId: v.id,
          variantName: v.name,
          localIndex: i,
          total: imgs.length,
        })
      })
    }
    return out
  }, [variants])

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // Para no entrar en bucle cuando nosotros mismos hacemos scroll programático
  const programmaticScrollRef = useRef(false)

  /* --- Cuando cambia selectedVariantId desde afuera → scroll suave --- */
  useEffect(() => {
    if (!selectedVariantId) return
    const targetIdx = slides.findIndex((s) => s.variantId === selectedVariantId)
    if (targetIdx < 0) return
    const node = scrollerRef.current
    if (!node) return
    const child = node.children[targetIdx] as HTMLElement | undefined
    if (!child) return
    // Si ya estamos ahí, no hacemos nada
    if (Math.abs(node.scrollLeft - child.offsetLeft) < 4) return
    programmaticScrollRef.current = true
    node.scrollTo({ left: child.offsetLeft, behavior: "smooth" })
    setActiveIndex(targetIdx)
    // Soltamos el flag cuando el scroll suave termina
    setTimeout(() => {
      programmaticScrollRef.current = false
    }, 450)
  }, [selectedVariantId, slides])

  /* --- Listener nativo: cuando el usuario desliza, detectamos la foto activa --- */
  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = node.clientWidth
        if (w === 0) return
        const idx = Math.round(node.scrollLeft / w)
        if (idx === activeIndex) return
        setActiveIndex(idx)
        // Solo notificamos cambio de variante si NO fue scroll programático
        if (!programmaticScrollRef.current) {
          const next = slides[idx]
          if (next && next.variantId !== selectedVariantId) {
            onVariantChange(next.variantId)
          }
        }
      })
    }
    node.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      node.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [activeIndex, slides, selectedVariantId, onVariantChange])

  /* --- Flechas desktop --- */
  function goTo(i: number) {
    if (i < 0) i = 0
    if (i >= slides.length) i = slides.length - 1
    const node = scrollerRef.current
    if (!node) return
    const child = node.children[i] as HTMLElement | undefined
    if (!child) return
    programmaticScrollRef.current = true
    node.scrollTo({ left: child.offsetLeft, behavior: "smooth" })
    setActiveIndex(i)
    const next = slides[i]
    if (next && next.variantId !== selectedVariantId) {
      onVariantChange(next.variantId)
    }
    setTimeout(() => {
      programmaticScrollRef.current = false
    }, 450)
  }

  // Estado vacío
  if (slides.length === 0) {
    return (
      <div
        className={`relative w-full overflow-hidden bg-gradient-to-br from-pink-50 to-purple-50 dark:from-slate-800 dark:to-slate-800/60 flex items-center justify-center text-primary/40 ${className}`}
        style={{ aspectRatio: aspect }}
      >
        <Package size={36} />
      </div>
    )
  }

  const current = slides[activeIndex] ?? slides[0]

  return (
    <div className={`relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}
      style={{ aspectRatio: aspect }}
    >
      {/* SCROLLER nativo con scroll-snap horizontal (gestos súper fluidos en móvil) */}
      <div
        ref={scrollerRef}
        className="flex h-full overflow-x-auto snap-x snap-mandatory scroll-smooth"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {slides.map((s, i) => (
          <div
            key={`${s.variantId}-${i}`}
            className="relative shrink-0 w-full h-full snap-center"
          >
            <img
              src={s.url}
              alt={s.variantName}
              loading="lazy"
              draggable={false}
              className="w-full h-full object-cover cursor-pointer"
              onClick={onTap}
            />
          </div>
        ))}
      </div>

      {/* Hide scrollbar webkit */}
      <style>{`
        .${"snap-x"}::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Flechas desktop */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              goTo(activeIndex - 1)
            }}
            disabled={activeIndex === 0}
            className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur items-center justify-center text-slate-700 dark:text-slate-200 shadow disabled:opacity-30 z-10"
            aria-label="Anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              goTo(activeIndex + 1)
            }}
            disabled={activeIndex === slides.length - 1}
            className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur items-center justify-center text-slate-700 dark:text-slate-200 shadow disabled:opacity-30 z-10"
            aria-label="Siguiente"
          >
            <ChevronRight size={14} />
          </button>
        </>
      )}

      {/* Etiqueta flotante con el nombre de la variante visible */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.variantId}
          initial={{ opacity: 0, y: 6, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="absolute top-2 left-2 z-10 px-2.5 py-1 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow"
          style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
        >
          {current.variantName}
        </motion.div>
      </AnimatePresence>

      {/* Indicadores tipo pill (uno por variante, no por foto) */}
      {variants.length > 1 && (
        <LayoutGroup id={`vc-${variants.map((v) => v.id).join("-")}`}>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 pointer-events-none">
            {variants.map((v) => {
              const active = v.id === current.variantId
              return (
                <motion.span
                  key={v.id}
                  layout
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className={`h-1.5 rounded-full ${
                    active ? "w-5 bg-white shadow" : "w-1.5 bg-white/60"
                  }`}
                />
              )
            })}
          </div>
        </LayoutGroup>
      )}

      {/* Contador de fotos por variante (pequeño, arriba a la derecha) */}
      {current.total > 1 && (
        <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur text-white text-[9px] font-black tabular-nums">
          {current.localIndex + 1}/{current.total}
        </span>
      )}
    </div>
  )
}

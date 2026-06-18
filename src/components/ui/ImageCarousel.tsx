import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import {
  motion,
  AnimatePresence,
  PanInfo,
  useMotionValue,
  useTransform,
} from "framer-motion"
import { Package, X, ChevronLeft, ChevronRight } from "lucide-react"
import { imageMedium, imageLarge, imageAvatar } from "../../lib/imageTransform"

interface Props {
  /** Lista ordenada de URLs. La primera es la portada. */
  images: string[]
  /** Texto alternativo */
  alt?: string
  /** Aspect ratio CSS (default 1/1). Ej: "4/5" */
  aspect?: string
  /** Mostrar miniaturas debajo (default false) */
  showThumbs?: boolean
  /** Habilita tap → fullscreen (default true) */
  enableFullscreen?: boolean
  /** Click en imagen sin habilitar fullscreen */
  onTap?: () => void
  className?: string
}

/**
 * Carrusel Pro:
 *  - Swipe horizontal con spring physics (framer-motion drag)
 *  - Indicadores tipo "pill" (el activo se estira)
 *  - Tap para abrir en pantalla completa con fondo blureado
 *  - En fullscreen: pinch-to-zoom (1-4×), pan en zoom, swipe para cambiar,
 *    swipe vertical para cerrar (drag-to-dismiss)
 */
export default function ImageCarousel({
  images,
  alt = "",
  aspect = "1/1",
  showThumbs = false,
  enableFullscreen = true,
  onTap,
  className = "",
}: Props) {
  const [index, setIndex] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  const valid = images.filter(Boolean)
  const total = valid.length

  // Si el índice quedó fuera por cambio de array, ajustar
  useEffect(() => {
    if (index >= total) setIndex(0)
  }, [total, index])

  // Empty state
  if (total === 0) {
    return (
      <div
        className={`relative w-full overflow-hidden bg-gradient-to-br from-pink-50 to-purple-50 dark:from-slate-800 dark:to-slate-800/60 flex items-center justify-center text-primary/40 ${className}`}
        style={{ aspectRatio: aspect }}
      >
        <Package size={36} />
      </div>
    )
  }

  // Una sola imagen: render simple
  if (total === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            if (onTap) onTap()
            else if (enableFullscreen) setFullscreen(true)
          }}
          className={`relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}
          style={{ aspectRatio: aspect }}
        >
          <img
            src={imageMedium(valid[0]) || valid[0]}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </button>
        {enableFullscreen && (
          <FullscreenViewer
            open={fullscreen}
            images={valid}
            startIndex={0}
            onClose={() => setFullscreen(false)}
          />
        )}
      </>
    )
  }

  function goTo(i: number) {
    if (i < 0) i = 0
    if (i >= total) i = total - 1
    setIndex(i)
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const SWIPE_THRESHOLD = 50
    const VEL = 300
    if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -VEL) {
      goTo(index + 1)
    } else if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > VEL) {
      goTo(index - 1)
    }
  }

  return (
    <>
      <div
        className={`relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800 select-none ${className}`}
        style={{ aspectRatio: aspect }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.img
            key={index}
            src={imageMedium(valid[index]) || valid[index]}
            alt={alt}
            className="absolute inset-0 w-full h-full object-cover cursor-pointer"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            onClick={() => {
              if (onTap) onTap()
              else if (enableFullscreen) setFullscreen(true)
            }}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </AnimatePresence>

        {/* Flechas (desktop) */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                goTo(index - 1)
              }}
              disabled={index === 0}
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur items-center justify-center text-slate-700 dark:text-slate-200 shadow disabled:opacity-30 z-10"
              aria-label="Anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                goTo(index + 1)
              }}
              disabled={index === total - 1}
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur items-center justify-center text-slate-700 dark:text-slate-200 shadow disabled:opacity-30 z-10"
              aria-label="Siguiente"
            >
              <ChevronRight size={14} />
            </button>
          </>
        )}

        {/* Indicadores pill */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 pointer-events-none">
          {valid.map((_, i) => (
            <motion.span
              key={i}
              layout
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={`h-1.5 rounded-full ${
                i === index
                  ? "w-5 bg-white shadow"
                  : "w-1.5 bg-white/60"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Miniaturas opcionales */}
      {showThumbs && total > 1 && (
        <div className="flex gap-1.5 mt-2 overflow-x-auto scroll-container-ios">
          {valid.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => goTo(i)}
              className={`shrink-0 w-12 h-12 rounded-xl overflow-hidden border-2 transition-colors ${
                i === index
                  ? "border-primary"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={imageAvatar(u) || u} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen viewer */}
      {enableFullscreen && (
        <FullscreenViewer
          open={fullscreen}
          images={valid}
          startIndex={index}
          onClose={() => setFullscreen(false)}
          onIndexChange={setIndex}
        />
      )}
    </>
  )
}

/* ==================================================================== */
/* FULLSCREEN VIEWER (pinch zoom + swipe-to-dismiss)                    */
/* ==================================================================== */

function FullscreenViewer({
  open,
  images,
  startIndex,
  onClose,
  onIndexChange,
}: {
  open: boolean
  images: string[]
  startIndex: number
  onClose: () => void
  onIndexChange?: (i: number) => void
}) {
  const [index, setIndex] = useState(startIndex)
  const [scale, setScale] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const dismissY = useMotionValue(0)
  const overlayOpacity = useTransform(dismissY, [-300, 0, 300], [0, 1, 0])
  const imgScale = useTransform(dismissY, [-300, 0, 300], [0.7, 1, 0.7])

  useEffect(() => {
    if (open) setIndex(startIndex)
  }, [open, startIndex])

  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") goPrev()
      if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, index])

  const goPrev = useCallback(() => {
    setScale(1)
    setIndex((i) => {
      const n = Math.max(0, i - 1)
      onIndexChange?.(n)
      return n
    })
  }, [onIndexChange])

  const goNext = useCallback(() => {
    setScale(1)
    setIndex((i) => {
      const n = Math.min(images.length - 1, i + 1)
      onIndexChange?.(n)
      return n
    })
  }, [images.length, onIndexChange])

  /* Pinch zoom nativo: trackeamos touches */
  const lastDist = useRef<number | null>(null)
  const baseScale = useRef(1)

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastDist.current = Math.hypot(dx, dy)
      baseScale.current = scale
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const next = baseScale.current * (dist / lastDist.current)
      setScale(Math.max(1, Math.min(4, next)))
      e.preventDefault()
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastDist.current = null
      // Si está casi en 1, snap a 1
      if (scale < 1.05) setScale(1)
    }
  }

  const onDoubleTap = () => {
    setScale((s) => (s > 1 ? 1 : 2.5))
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    if (scale > 1) return // si está zoomeado, no cerrar
    if (Math.abs(info.offset.y) > 120 || Math.abs(info.velocity.y) > 600) {
      onClose()
    }
  }

  function onHorizDragEnd(_: unknown, info: PanInfo) {
    if (scale > 1) return
    const SWIPE = 50
    if (info.offset.x < -SWIPE || info.velocity.x < -300) goNext()
    else if (info.offset.x > SWIPE || info.velocity.x > 300) goPrev()
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center touch-none"
        >
          {/* Backdrop blureado */}
          <motion.div
            style={{ opacity: overlayOpacity }}
            className="absolute inset-0 bg-black/90 backdrop-blur-2xl"
            onClick={onClose}
          />

          {/* Botón cerrar */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center pb-safe"
            style={{ marginTop: "env(safe-area-inset-top)" }}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>

          {/* Contador */}
          {images.length > 1 && (
            <span
              className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[11px] font-black tabular-nums"
              style={{ marginTop: "env(safe-area-inset-top)" }}
            >
              {index + 1} / {images.length}
            </span>
          )}

          {/* Imagen (drag vertical para cerrar, drag horizontal para cambiar) */}
          <motion.div
            drag={scale === 1 ? true : false}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            dragElastic={0.4}
            style={{ y: dismissY, scale: imgScale }}
            onDragEnd={(e, info) => {
              if (Math.abs(info.offset.y) > Math.abs(info.offset.x)) {
                onDragEnd(e, info)
              } else {
                onHorizDragEnd(e, info)
              }
            }}
            className="relative w-full h-full max-w-3xl flex items-center justify-center px-4"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onDoubleClick={onDoubleTap}
          >
            <AnimatePresence mode="popLayout">
              <motion.img
                key={index}
                src={imageLarge(images[index]) || images[index]}
                alt=""
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
                className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl pointer-events-none"
                draggable={false}
              />
            </AnimatePresence>
          </motion.div>

          {/* Flechas */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur text-white items-center justify-center disabled:opacity-30 z-20"
                aria-label="Anterior"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={index === images.length - 1}
                className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur text-white items-center justify-center disabled:opacity-30 z-20"
                aria-label="Siguiente"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          {/* Indicadores */}
          {images.length > 1 && (
            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 z-20"
              style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            >
              {images.map((_, i) => (
                <motion.span
                  key={i}
                  layout
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className={`h-1.5 rounded-full ${
                    i === index
                      ? "w-6 bg-white"
                      : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Pista pinch (solo primera vez, mobile) */}
          <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/40 z-10">
            Pellizca para acercar · arrastra abajo para cerrar
          </p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

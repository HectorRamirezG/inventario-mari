import { useEffect, useState, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, PanInfo } from "framer-motion"
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

export interface LightboxSlide {
  url: string
  variantId: string
  variantName: string
}

interface Props {
  open: boolean
  slides: LightboxSlide[]
  /** Índice inicial a mostrar (0-based) */
  startIndex: number
  /** Notifica cuando el usuario navega a otra variante por swipe/flecha */
  onVariantChange?: (variantId: string) => void
  /** Botón flotante "+" que dispara la apertura del BuySheet */
  onOpenBuy?: () => void
  onClose: () => void
}

/**
 * Lightbox fullscreen para fotos de producto. Soporta:
 *  - Swipe horizontal táctil → cambia foto (solo si scale === 1)
 *  - Swipe vertical → cierra (drag-to-dismiss, solo si scale === 1)
 *  - Pinch (2 dedos) → zoom continuo (1×–4×)
 *  - Double-tap → toggle 1× ↔ 2.5×
 *  - Doble click desktop / rueda → zoom step
 *  - Drag con 1 dedo cuando scale > 1 → pan dentro de la foto
 *  - Botones desktop +/-
 * El zoom se resetea al cambiar de slide.
 */
export default function ProductLightbox({
  open,
  slides,
  startIndex,
  onVariantChange,
  onOpenBuy,
  onClose,
}: Props) {
  const [index, setIndex] = useState(startIndex)
  const total = slides.length

  // ─────── Estado de zoom/pan ───────
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const zoomed = scale > 1.05
  const MIN_SCALE = 1
  const MAX_SCALE = 4

  const pinchStartDist = useRef<number | null>(null)
  const pinchStartScale = useRef(1)
  const lastTapAt = useRef(0)
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  function resetZoom() {
    setScale(1)
    setTx(0)
    setTy(0)
  }

  // Reset index + zoom cuando se abre con un nuevo producto
  useEffect(() => {
    if (open) {
      setIndex(startIndex)
      resetZoom()
    }
  }, [open, startIndex])

  // Bloquear scroll body
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // Teclado
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") go(-1)
      else if (e.key === "ArrowRight") go(+1)
      else if (e.key === "+" || e.key === "=") stepZoom(+0.5)
      else if (e.key === "-" || e.key === "_") stepZoom(-0.5)
      else if (e.key === "0") resetZoom()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, total, scale])

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(total - 1, i + delta))
        const slide = slides[next]
        if (slide && slide.variantId !== slides[i]?.variantId) {
          onVariantChange?.(slide.variantId)
        }
        // Reset zoom al cambiar de slide
        setScale(1)
        setTx(0)
        setTy(0)
        return next
      })
    },
    [total, slides, onVariantChange]
  )

  function stepZoom(delta: number) {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta))
      if (next === MIN_SCALE) {
        setTx(0)
        setTy(0)
      }
      return next
    })
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    // Si está zoomeado, el drag es pan — no cambiar slide ni cerrar.
    if (zoomed) return
    // Swipe vertical largo → cerrar
    if (Math.abs(info.offset.y) > Math.abs(info.offset.x)) {
      if (Math.abs(info.offset.y) > 120 || Math.abs(info.velocity.y) > 600) {
        onClose()
      }
      return
    }
    // Swipe horizontal → cambiar foto
    if (info.offset.x < -50 || info.velocity.x < -300) go(+1)
    else if (info.offset.x > 50 || info.velocity.x > 300) go(-1)
  }

  // ─────── Gestos táctiles (pinch + double-tap + pan) ───────
  function distanceBetweenTouches(touches: React.TouchList) {
    const [a, b] = [touches[0], touches[1]]
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  function onTouchStartImg(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchStartDist.current = distanceBetweenTouches(e.touches)
      pinchStartScale.current = scale
      panStart.current = null
      return
    }
    if (e.touches.length === 1 && zoomed) {
      panStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        tx,
        ty,
      }
    }
    if (e.touches.length === 1) {
      const now = Date.now()
      if (now - lastTapAt.current < 280) {
        // Double-tap → toggle zoom
        if (zoomed) resetZoom()
        else setScale(2.5)
        lastTapAt.current = 0
      } else {
        lastTapAt.current = now
      }
    }
  }

  function onTouchMoveImg(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStartDist.current) {
      const d = distanceBetweenTouches(e.touches)
      const ratio = d / pinchStartDist.current
      const next = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, pinchStartScale.current * ratio)
      )
      setScale(next)
      if (next === MIN_SCALE) {
        setTx(0)
        setTy(0)
      }
      return
    }
    if (e.touches.length === 1 && zoomed && panStart.current) {
      const dx = e.touches[0].clientX - panStart.current.x
      const dy = e.touches[0].clientY - panStart.current.y
      setTx(panStart.current.tx + dx)
      setTy(panStart.current.ty + dy)
    }
  }

  function onTouchEndImg(e: React.TouchEvent) {
    if (e.touches.length < 2) pinchStartDist.current = null
    if (e.touches.length === 0) panStart.current = null
  }

  function onWheelImg(e: React.WheelEvent) {
    e.preventDefault()
    stepZoom(e.deltaY < 0 ? +0.2 : -0.2)
  }

  function onDoubleClickImg() {
    if (zoomed) resetZoom()
    else setScale(2.5)
  }

  if (typeof document === "undefined") return null
  if (!open || total === 0) return null

  const current = slides[index]

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[260] flex items-center justify-center touch-none"
        >
          {/* Backdrop oscuro — click: si zoom→reset; si no→cierra */}
          <motion.div
            className="absolute inset-0 bg-black/95 backdrop-blur-2xl"
            onClick={() => {
              if (zoomed) resetZoom()
              else onClose()
            }}
          />

          {/* Header */}
          <div
            className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-2 p-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest truncate">
                {current?.variantName}
              </span>
              {total > 1 && (
                <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[11px] font-black tabular-nums shrink-0">
                  {index + 1}/{total}
                </span>
              )}
              {zoomed && (
                <span className="px-2 py-1 rounded-full bg-primary/80 backdrop-blur text-white text-[10px] font-black tabular-nums shrink-0">
                  {scale.toFixed(1)}×
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Imagen con swipe + pinch zoom */}
          <motion.div
            key={index}
            drag={zoomed ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="relative w-full h-full max-w-3xl flex items-center justify-center px-4 overflow-hidden"
          >
            <img
              src={current?.url}
              alt={current?.variantName}
              draggable={false}
              onTouchStart={onTouchStartImg}
              onTouchMove={onTouchMoveImg}
              onTouchEnd={onTouchEndImg}
              onWheel={onWheelImg}
              onDoubleClick={onDoubleClickImg}
              style={{
                transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
                transition:
                  pinchStartDist.current || panStart.current
                    ? "none"
                    : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
                touchAction: "none",
                cursor: zoomed ? "grab" : "zoom-in",
              }}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl select-none"
            />
          </motion.div>

          {/* Flechas desktop — ocultas al estar zoomeado */}
          {total > 1 && !zoomed && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                aria-label="Anterior"
                className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur text-white items-center justify-center disabled:opacity-30 z-10"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => go(+1)}
                disabled={index === total - 1}
                aria-label="Siguiente"
                className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 backdrop-blur text-white items-center justify-center disabled:opacity-30 z-10"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          {/* Controles de zoom (desktop/tablet) */}
          <div
            className="absolute right-6 z-20 hidden sm:flex flex-col gap-2"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 6rem)" }}
          >
            <button
              type="button"
              onClick={() => stepZoom(+0.5)}
              aria-label="Acercar"
              disabled={scale >= MAX_SCALE}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center disabled:opacity-30"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              onClick={() => (zoomed ? resetZoom() : stepZoom(-0.5))}
              aria-label="Alejar"
              disabled={!zoomed}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center disabled:opacity-30"
            >
              <ZoomOut size={16} />
            </button>
          </div>

          {/* Indicadores tipo pill — ocultos al estar zoomeado */}
          {total > 1 && !zoomed && (
            <div
              className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 pointer-events-none"
              style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            >
              {slides.map((_, i) => (
                <motion.span
                  key={i}
                  layout
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? "w-5 bg-white" : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Hint inicial — desaparece al zoomear */}
          {!zoomed && (
            <p
              className="absolute left-1/2 -translate-x-1/2 text-white/45 text-[10px] font-black uppercase tracking-widest pointer-events-none select-none"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 2.5rem)" }}
            >
              Pellizca · doble tap para zoom
            </p>
          )}

          {/* CTA + Agregar al carrito (flotante en lightbox) */}
          {onOpenBuy && !zoomed && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenBuy()
              }}
              aria-label="Agregar al carrito"
              className="absolute bottom-6 right-6 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-bloom z-20 active:scale-90 transition-transform"
              style={{
                background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                marginBottom: "env(safe-area-inset-bottom)",
              }}
            >
              <Plus size={22} strokeWidth={3} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

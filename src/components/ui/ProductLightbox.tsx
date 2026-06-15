import { useEffect, useState, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, PanInfo } from "framer-motion"
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
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
 * Lightbox fullscreen para fotos de producto. Swipe horizontal táctil
 * para cambiar de foto, swipe vertical para cerrar (drag-to-dismiss).
 * Solo se monta cuando el usuario hace clic en la imagen de la card,
 * así nunca interfiere con el scroll vertical del catálogo.
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
  const startRef = useRef({ x: 0, y: 0 })
  const total = slides.length

  // Reset index cuando se abre con un nuevo producto
  useEffect(() => {
    if (open) setIndex(startIndex)
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
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, total])

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(total - 1, i + delta))
        const slide = slides[next]
        if (slide && slide.variantId !== slides[i]?.variantId) {
          onVariantChange?.(slide.variantId)
        }
        return next
      })
    },
    [total, slides, onVariantChange]
  )

  function onDragEnd(_: unknown, info: PanInfo) {
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
          {/* Backdrop oscuro */}
          <motion.div
            className="absolute inset-0 bg-black/95 backdrop-blur-2xl"
            onClick={onClose}
          />

          {/* Header */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-4 pb-safe">
            <span
              className="px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest"
              style={{ marginTop: "env(safe-area-inset-top)" }}
            >
              {current?.variantName}
            </span>
            <span
              className="px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[11px] font-black tabular-nums"
              style={{ marginTop: "env(safe-area-inset-top)" }}
            >
              {index + 1}/{total}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center"
              style={{ marginTop: "env(safe-area-inset-top)" }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Imagen con swipe táctil */}
          <motion.div
            key={index}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            onTouchStart={(e) => {
              startRef.current.x = e.touches[0].clientX
              startRef.current.y = e.touches[0].clientY
            }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="relative w-full h-full max-w-3xl flex items-center justify-center px-4"
          >
            <img
              src={current?.url}
              alt={current?.variantName}
              draggable={false}
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl pointer-events-none select-none"
            />
          </motion.div>

          {/* Flechas desktop */}
          {total > 1 && (
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

          {/* Indicadores tipo pill */}
          {total > 1 && (
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

          {/* CTA + Agregar al carrito (flotante en lightbox) */}
          {onOpenBuy && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenBuy()
              }}
              aria-label="Agregar al carrito"
              className="absolute bottom-6 right-6 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-bloom z-20 active:scale-90 transition-transform"
              style={{
                background: "linear-gradient(135deg,#e6007e,#a855f7)",
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

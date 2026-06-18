import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronLeft, ChevronRight, ExternalLink, Eye } from "lucide-react"

import { registerStoryView, isVideoUrl, type Story } from "./storiesService"

interface Props {
  stories: Story[]
  startIndex: number
  onClose: () => void
  /** Duración por story en ms (default 5s). */
  durationMs?: number
}

/**
 * Lightbox fullscreen para ver stories. Auto-avanza con barra de progreso
 * arriba (estilo Instagram). Soporta:
 *   - tap izquierda / derecha → anterior / siguiente
 *   - tap centro → pausa
 *   - swipe down → cerrar
 *   - tecla Esc / flechas
 */
export default function StoryViewer({
  stories,
  startIndex,
  onClose,
  durationMs = 5000,
}: Props) {
  const [index, setIndex] = useState(startIndex)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const lastTickRef = useRef<number>(Date.now())

  const current = stories[index]
  const total = stories.length

  const goNext = useCallback(() => {
    setProgress(0)
    setIndex((i) => {
      if (i + 1 >= total) {
        onClose()
        return i
      }
      return i + 1
    })
  }, [total, onClose])

  const goPrev = useCallback(() => {
    setProgress(0)
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  // Auto-progress timer
  useEffect(() => {
    if (paused) {
      lastTickRef.current = Date.now()
      return
    }
    lastTickRef.current = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - lastTickRef.current
      lastTickRef.current = Date.now()
      setProgress((p) => {
        const next = p + (elapsed / durationMs) * 100
        if (next >= 100) {
          // microtask para mover al siguiente sin race
          queueMicrotask(goNext)
          return 100
        }
        return next
      })
    }, 50)
    return () => clearInterval(id)
  }, [paused, index, durationMs, goNext])

  // Registrar vista al cambiar de story
  useEffect(() => {
    if (current?.id) registerStoryView(current.id)
  }, [current?.id])

  // Bloqueo de scroll body
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") goNext()
      else if (e.key === "ArrowLeft") goPrev()
      else if (e.key === " ") {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goNext, goPrev, onClose])

  if (!current || typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="story-viewer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* Media actual (foto o video) */}
        {isVideoUrl(current.image_url) ? (
          <motion.video
            key={current.id}
            src={current.image_url}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="max-h-full max-w-full object-contain select-none"
            autoPlay
            playsInline
            loop
            muted
          />
        ) : (
          <motion.img
            key={current.id}
            src={current.image_url}
            alt={current.caption || ""}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="max-h-full max-w-full object-contain select-none"
            draggable={false}
          />
        )}

        {/* Barras de progreso arriba */}
        <div className="absolute top-0 inset-x-0 z-10 pt-safe px-3 pt-3 flex gap-1">
          {stories.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden"
            >
              <div
                className="h-full bg-white"
                style={{
                  width:
                    i < index
                      ? "100%"
                      : i === index
                      ? `${progress}%`
                      : "0%",
                  transition:
                    i === index && !paused ? "width 50ms linear" : "none",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header — close + caption */}
        <div className="absolute top-0 inset-x-0 z-10 pt-safe px-3 pt-8 flex items-start justify-between gap-3 text-white pointer-events-none">
          <div className="flex-1 min-w-0">
            {current.caption && (
              <p className="text-sm font-bold drop-shadow leading-snug line-clamp-2">
                {current.caption}
              </p>
            )}
            <p className="text-[10px] font-bold opacity-70 mt-0.5 flex items-center gap-2">
              <Eye size={10} /> {current.view_count} vistas
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center pointer-events-auto press"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Zonas de tap para nav (debajo del header, encima del CTA) */}
        <button
          type="button"
          aria-label="Anterior"
          onClick={(e) => {
            e.stopPropagation()
            goPrev()
          }}
          className="absolute left-0 top-16 bottom-16 w-1/3 z-[5] cursor-pointer"
        />
        <button
          type="button"
          aria-label="Siguiente"
          onClick={(e) => {
            e.stopPropagation()
            goNext()
          }}
          className="absolute right-0 top-16 bottom-16 w-1/3 z-[5] cursor-pointer"
        />

        {/* Flechas en desktop */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goPrev()
          }}
          disabled={index === 0}
          className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 text-white items-center justify-center disabled:opacity-30 press"
          aria-label="Anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goNext()
          }}
          className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/15 text-white items-center justify-center press"
          aria-label="Siguiente"
        >
          <ChevronRight size={18} />
        </button>

        {/* CTA — link a producto / externo */}
        {current.link_url && (
          <a
            href={current.link_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 h-12 px-5 rounded-full bg-white text-slate-900 text-[12px] font-black uppercase tracking-widest flex items-center gap-2 shadow-2xl press-hard"
          >
            <ExternalLink size={13} />
            Ver más
          </a>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

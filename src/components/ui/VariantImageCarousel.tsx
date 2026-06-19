import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { Package, ChevronLeft, ChevronRight } from "lucide-react"
import { imageMedium } from "../../lib/imageTransform"

export interface CarouselVariant {
  id: string
  name: string
  images: string[]
}

interface Props {
  variants: CarouselVariant[]
  /** Variante activa (controlada por el padre — chips externos) */
  selectedVariantId: string | null
  /** Aspect ratio CSS (default 1/1) */
  aspect?: string
  /** Click en imagen → abre lightbox fullscreen */
  onTap?: () => void
  className?: string
  /**
   * Mostrar la pill flotante con el nombre de la variante activa.
   * Default: true. El padre puede pasarlo en false cuando TODAS las
   * variantes están usando la misma imagen fallback (porque ninguna
   * subió foto propia) — en ese caso la pill solo confunde al cliente.
   */
  showVariantBadge?: boolean
  /**
   * Si true, la primera imagen carga eager + fetchPriority="high".
   * Usar SOLO en el primer card visible del listado para mejorar LCP.
   */
  priority?: boolean
}

/**
 * Carrusel de la imagen activa. La VARIANTE la controla el padre
 * (chips externos); el ÍNDICE de la foto dentro de esa variante lo
 * maneja este componente con flechas + dots.
 *
 * Reglas:
 *  - Si el selectedVariantId no matchea, usa la primera variante.
 *  - Si la variante activa tiene 0 fotos, el padre debe pasarle fallback
 *    en `images` para que no se vea vacía.
 *  - Las flechas y dots solo aparecen si la variante activa tiene >1 fotos.
 */
export default function VariantImageCarousel({
  variants,
  selectedVariantId,
  aspect = "1/1",
  onTap,
  className = "",
  showVariantBadge = true,
  priority = false,
}: Props) {
  const active = useMemo(() => {
    if (variants.length === 0) return null
    return variants.find((vv) => vv.id === selectedVariantId) ?? variants[0]
  }, [variants, selectedVariantId])

  const images = active?.images ?? []
  const totalInActive = images.length

  // Índice de la foto dentro de la variante activa
  const [idx, setIdx] = useState(0)

  // Reset al cambiar de variante
  useEffect(() => {
    setIdx(0)
  }, [active?.id])

  function go(delta: number) {
    if (totalInActive < 2) return
    setIdx((i) => (i + delta + totalInActive) % totalInActive)
  }

  // Swipe horizontal en móvil (umbral 40px). Si el swipe vertical es mayor
  // dejamos pasar el gesto para que la página pueda hacer scroll normal.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // Si el movimiento fue más vertical que horizontal, no es swipe de fotos
    if (Math.abs(dy) > Math.abs(dx)) return
    if (Math.abs(dx) < 40) return
    if (dx > 0) go(-1)
    else go(1)
  }

  // Estado vacío
  if (!active || images.length === 0) {
    return (
      <div
        className={`relative w-full overflow-hidden bg-gradient-to-br from-pink-50 to-purple-50 dark:from-slate-800 dark:to-slate-800/60 flex items-center justify-center text-primary/40 ${className}`}
        style={{ aspectRatio: aspect }}
      >
        <Package size={36} />
      </div>
    )
  }

  const safeIdx = Math.min(idx, totalInActive - 1)
  const activeUrl = images[safeIdx]
  const hasMany = totalInActive > 1

  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800 select-none ${className}`}
      style={{ aspectRatio: aspect, touchAction: hasMany ? "pan-y" : undefined }}
      onTouchStart={hasMany ? onTouchStart : undefined}
      onTouchEnd={hasMany ? onTouchEnd : undefined}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={`${active.id}-${safeIdx}`}
          src={imageMedium(activeUrl) || activeUrl}
          alt={active.name}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable={false}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          onClick={onTap}
          className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
        />
      </AnimatePresence>

      {/* Etiqueta flotante con el nombre de la variante activa.
          Se posiciona BOTTOM-LEFT para no chocar con los badges promocionales
          (Nuevo / Oferta) que ProductCardClient pinta en top-left.
          Si hay múltiples fotos (dots visibles abajo) la subimos un piso
          para no chocar contra los dots.
          La pill se OCULTA cuando showVariantBadge=false (caso típico:
          todas las variantes comparten la misma imagen fallback — la pill
          solo confundiría al cliente). */}
      {variants.length > 1 && showVariantBadge && (
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className={`absolute left-2 z-10 max-w-[55%] truncate px-2.5 py-1 rounded-full bg-black/55 backdrop-blur text-white text-[9px] font-black uppercase tracking-widest shadow pointer-events-none ${
              hasMany ? "bottom-7" : "bottom-2"
            }`}
          >
            {active.name}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Contador X/N (esquina superior derecha — top-left lo ocupan los
          badges promocionales NUEVO/OFERTA que pinta ProductCardClient) */}
      {hasMany && (
        <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-black/45 backdrop-blur text-white text-[9px] font-black tabular-nums pointer-events-none">
          {safeIdx + 1}/{totalInActive}
        </span>
      )}

      {/* Flechas laterales — solo en desktop. En móvil el cliente desliza
          con el dedo (handlers de swipe arriba) para no tener que apuntar
          a botones chicos. */}
      {hasMany && (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            className="hidden md:flex absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/65 dark:bg-slate-900/65 backdrop-blur text-slate-700 dark:text-slate-100 items-center justify-center shadow active:scale-90 transition-transform"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Foto siguiente"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            className="hidden md:flex absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/65 dark:bg-slate-900/65 backdrop-blur text-slate-700 dark:text-slate-100 items-center justify-center shadow active:scale-90 transition-transform"
          >
            <ChevronRight size={14} />
          </button>
        </>
      )}

      {/* Dots de fotos dentro de la variante activa */}
      {hasMany && (
        <LayoutGroup id={`vic-photos-${active.id}`}>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
            {images.map((_, i) => {
              const isActive = i === safeIdx
              return (
                <motion.button
                  key={i}
                  type="button"
                  layout
                  onClick={(e) => {
                    e.stopPropagation()
                    setIdx(i)
                  }}
                  aria-label={`Foto ${i + 1}`}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className={`h-1.5 rounded-full transition-colors ${
                    isActive ? "w-5 bg-white shadow" : "w-1.5 bg-white/60"
                  }`}
                />
              )
            })}
          </div>
        </LayoutGroup>
      )}
    </div>
  )
}

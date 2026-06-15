import { useMemo } from "react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { Package } from "lucide-react"

export interface CarouselVariant {
  id: string
  name: string
  images: string[]
}

interface Props {
  variants: CarouselVariant[]
  /** Variante activa (controlada por el padre — chips abajo de la card) */
  selectedVariantId: string | null
  /** Aspect ratio CSS (default 1/1) */
  aspect?: string
  /** Click en imagen → abre lightbox fullscreen */
  onTap?: () => void
  className?: string
}

/**
 * Muestra UNA imagen de la variante seleccionada, con animación de fade
 * al cambiar. Sin swipe táctil ni scroll horizontal — eso rompía el
 * scroll vertical nativo en móvil. El swipe ENTRE fotos se delega al
 * componente `ProductLightbox` que se abre al hacer tap.
 *
 * Si hay una sola foto, simplemente la muestra.
 */
export default function VariantImageCarousel({
  variants,
  selectedVariantId,
  aspect = "1/1",
  onTap,
  className = "",
}: Props) {
  // Foto principal de la variante seleccionada (la primera)
  const activeUrl = useMemo(() => {
    if (variants.length === 0) return null
    const v = variants.find((vv) => vv.id === selectedVariantId) ?? variants[0]
    return v.images[0] ?? null
  }, [variants, selectedVariantId])

  const activeId = useMemo(() => {
    if (variants.length === 0) return null
    const v = variants.find((vv) => vv.id === selectedVariantId) ?? variants[0]
    return v.id
  }, [variants, selectedVariantId])

  const activeName = useMemo(() => {
    if (variants.length === 0) return null
    const v = variants.find((vv) => vv.id === selectedVariantId) ?? variants[0]
    return v.name
  }, [variants, selectedVariantId])

  // Total de fotos disponibles para mostrar el contador
  const totalImages = useMemo(
    () => variants.reduce((acc, v) => acc + v.images.length, 0),
    [variants]
  )

  // Estado vacío
  if (!activeUrl || variants.length === 0) {
    return (
      <div
        className={`relative w-full overflow-hidden bg-gradient-to-br from-pink-50 to-purple-50 dark:from-slate-800 dark:to-slate-800/60 flex items-center justify-center text-primary/40 ${className}`}
        style={{ aspectRatio: aspect }}
      >
        <Package size={36} />
      </div>
    )
  }

  return (
    <div
      className={`relative w-full overflow-hidden bg-slate-100 dark:bg-slate-800 select-none ${className}`}
      style={{ aspectRatio: aspect }}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={activeId}
          src={activeUrl}
          alt={activeName ?? ""}
          loading="lazy"
          draggable={false}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          onClick={onTap}
          className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
        />
      </AnimatePresence>

      {/* Etiqueta flotante con el nombre de la variante activa */}
      {variants.length > 1 && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId}
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="absolute top-2 left-2 z-10 px-2.5 py-1 rounded-full text-white text-[9px] font-black uppercase tracking-widest shadow pointer-events-none"
            style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
          >
            {activeName}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Contador de fotos (si hay varias) */}
      {totalImages > 1 && (
        <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-black/45 backdrop-blur text-white text-[9px] font-black tabular-nums pointer-events-none">
          1/{totalImages}
        </span>
      )}

      {/* Pills indicadoras (una por variante) */}
      {variants.length > 1 && (
        <LayoutGroup id={`vic-${variants.map((v) => v.id).join("-")}`}>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 pointer-events-none">
            {variants.map((v) => {
              const active = v.id === activeId
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
    </div>
  )
}

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Camera from "lucide-react/dist/esm/icons/camera"
import X from "lucide-react/dist/esm/icons/x"

import {
  listApprovedReviewsByProduct,
  type Review,
} from "../reviews/reviewsService"
import { formatRelative } from "../../lib/format"
import OverlayShell from "../../components/ui/OverlayShell"
import Avatar from "../../components/ui/Avatar"

/**
 * Galería de fotos REALES de clientas — strip horizontal de las reviews
 * con `image_url` aprobadas para un producto. Tap → lightbox con el
 * autor, su rating y su comentario.
 *
 * Es más convincente que la foto de estudio porque muestra el producto
 * "en uso" por personas reales. Filosofía: trust visual sin pagar por
 * fotos de modelos.
 *
 * Si no hay fotos: render = null (no ensucia el sheet).
 */

interface Props {
  productId: string
  /** Máx fotos a mostrar en el strip (default 8) */
  limit?: number
}

export default function CustomerPhotosGallery({
  productId,
  limit = 8,
}: Props) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<Review | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listApprovedReviewsByProduct(productId, 30)
      .then((rs) => {
        if (!cancelled) {
          const withPhoto = rs
            .filter((r) => r.image_url)
            .slice(0, limit)
          setReviews(withPhoto)
        }
      })
      .catch(() => {
        if (!cancelled) setReviews([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [productId, limit])

  if (loading) return null
  if (reviews.length === 0) return null

  return (
    <section className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
      <div className="flex items-center gap-2">
        <Camera
          size={12}
          className="text-emerald-600 dark:text-emerald-300"
        />
        <h4 className="text-[10px] uppercase tracking-widest font-black text-emerald-700 dark:text-emerald-300">
          Fotos reales de clientas
        </h4>
        <span className="text-[9px] text-slate-400 italic">
          ({reviews.length})
        </span>
      </div>

      <div className="overflow-x-auto scroll-container-ios -mx-1 px-1">
        <div className="flex gap-2 pb-1">
          {reviews.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setLightbox(r)}
              className="shrink-0 relative group press"
              aria-label={`Foto de ${r.customer_name ?? "clienta"}`}
            >
              <img
                src={r.image_url ?? ""}
                alt=""
                loading="lazy"
                className="w-20 h-20 rounded-2xl object-cover bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-800 shadow-sm group-hover:scale-105 transition-transform"
              />
              {r.rating >= 5 && (
                <span className="absolute -top-1 -right-1 text-base">⭐</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {lightbox && (
          <OverlayShell
            open={!!lightbox}
            variant="modal"
            onClose={() => setLightbox(null)}
            panelClassName="rounded-3xl bg-white dark:bg-slate-950 max-w-md w-full max-h-[90vh] overflow-hidden shadow-xl mx-auto"
          >
            <div className="relative">
              <img
                src={lightbox.image_url ?? ""}
                alt=""
                className="w-full aspect-square object-cover bg-slate-200 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute top-2 right-2 w-9 h-9 rounded-full bg-slate-900/60 backdrop-blur-sm text-white grid place-items-center"
                aria-label="Cerrar"
              >
                <X size={14} />
              </button>
              {lightbox.rating > 0 && (
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-amber-500/95 text-white text-[10px] font-black flex items-center gap-1">
                  {"★".repeat(lightbox.rating)}
                </div>
              )}
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Avatar name={lightbox.customer_name ?? "C"} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                    {lightbox.customer_name ?? "Clienta verificada"}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {formatRelative(lightbox.created_at)}
                  </p>
                </div>
              </div>
              {lightbox.comment && (
                <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed italic">
                  "{lightbox.comment}"
                </p>
              )}
            </div>
          </OverlayShell>
        )}
      </AnimatePresence>
    </section>
  )
}

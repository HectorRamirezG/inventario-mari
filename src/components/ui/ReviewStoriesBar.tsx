/**
 * ReviewStoriesBar — Mini-banda horizontal estilo "Stories" con las
 * mejores reseñas con foto del catálogo.
 *
 * Marketing orgánico: las clientas ven el producto USADO REAL por otras
 * clientas, con estrella y nombre. Click → abre el producto en la
 * tienda (`/?p=ID`).
 *
 * Solo se renderiza si hay ≥ 3 reseñas top (con menos no da impacto
 * visual y la banda se ve floja).
 */
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Star } from "lucide-react"

import {
  listTopReviewsWithPhoto,
  type TopReviewStory,
} from "../../features/reviews/reviewsService"
import { useBusinessRules } from "../../features/settings/businessRulesService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"

const MIN_TO_SHOW = 3

export default function ReviewStoriesBar() {
  const navigate = useNavigate()
  const bRules = useBusinessRules()
  const [items, setItems] = useState<TopReviewStory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bRules.reviews_enabled) {
      setLoading(false)
      return
    }
    let alive = true
    listTopReviewsWithPhoto(12)
      .then((rows) => {
        if (alive) setItems(rows)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [bRules.reviews_enabled])

  // Refresca cuando llega una nueva reseña aprobada via realtime.
  const refresh = useDebouncedCallback(() => {
    if (!bRules.reviews_enabled) return
    listTopReviewsWithPhoto(12).then(setItems).catch(() => {})
  }, 800)
  useRealtimeSubscription("reviews", refresh, {
    enabled: bRules.reviews_enabled,
    match: (row: any) => row?.status === "approved" && !!row?.image_url,
  })

  if (loading) return null
  if (!bRules.reviews_enabled) return null
  if (items.length < MIN_TO_SHOW) return null

  function openProduct(productId: string) {
    navigate(`/?p=${encodeURIComponent(productId)}`)
  }

  return (
    <section className="my-4">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Star size={11} className="fill-amber-400 text-amber-400" />
          Lo que están diciendo
        </h2>
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
          {items.length} reseña{items.length === 1 ? "" : "s"}
        </span>
      </div>

      <div
        className="-mx-4 px-4 flex gap-2.5 overflow-x-auto scroll-container-ios snap-x snap-mandatory"
        style={{ scrollPaddingInline: 16 }}
      >
        {items.map((r, i) => (
          <motion.button
            key={r.id}
            type="button"
            onClick={() => openProduct(r.product_id)}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.18) }}
            className="relative shrink-0 w-28 h-40 rounded-2xl overflow-hidden press snap-start group"
            aria-label={`Reseña de ${r.product_name} - ${r.rating} estrellas`}
            title={r.product_name}
          >
            {/* Imagen de la reseña como fondo */}
            <img
              src={r.image_url}
              alt={r.product_name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform group-active:scale-[1.04]"
            />
            {/* Overlay gradient para legibilidad */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />

            {/* Rating arriba */}
            <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur text-[9px] font-black text-amber-700 dark:text-amber-300">
                <Star size={8} className="fill-amber-400 text-amber-400" />
                {r.rating}
              </span>
            </div>

            {/* Pie con nombre del producto + nombre del cliente */}
            <div className="absolute bottom-1.5 left-1.5 right-1.5 text-white">
              <p className="text-[10px] font-black leading-tight line-clamp-2 drop-shadow">
                {r.product_name}
              </p>
              {r.customer_name && (
                <p className="text-[8px] font-bold opacity-90 leading-tight mt-0.5 truncate">
                  — {r.customer_name.split(" ")[0]}
                </p>
              )}
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  )
}

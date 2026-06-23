/**
 * ProductConversation — Sección unificada de Q&A + Reseñas dentro del
 * BuySheet del cliente.
 *
 * Antes vivían como dos secciones separadas (Q&A inline + reseñas en
 * otra parte). Ahora compartimos un espacio con sub-tabs internos:
 *   - Preguntas (Q&A público existente)
 *   - Reseñas (lecturas + estrellas + foto)
 *
 * Mari pidió: "preguntas y reseñas que estuviera como esas 2 cosas en
 * algo". Esto reduce la saturación visual del drawer y mejora
 * descubrimiento (cliente ve ambas conversaciones sin scrollear).
 *
 * La tab de Reseñas se oculta automáticamente cuando rules.reviews_enabled
 * está apagada. Q&A siempre está disponible.
 */
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  HelpCircle,
  Star,
  Loader2,
  ImageIcon,
} from "lucide-react"

import ProductQA from "./ProductQA"
import Avatar from "./Avatar"
import ReviewStars from "../../features/reviews/ReviewStars"
import { listApprovedReviewsByProduct } from "../../features/reviews/reviewsService"
import type { Review } from "../../features/reviews/reviewsService"
import { useBusinessRules } from "../../features/settings/businessRulesService"

interface Props {
  productId: string
  productName: string
}

type SubTab = "questions" | "reviews"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function ProductConversation({ productId, productName }: Props) {
  const rules = useBusinessRules()
  const reviewsOn = !!rules.reviews_enabled
  const [tab, setTab] = useState<SubTab>("questions")
  const [reviews, setReviews] = useState<Review[]>([])
  const [loadingReviews, setLoadingReviews] = useState(false)

  // Cargar reseñas la primera vez que el cliente abre la tab "Reseñas".
  useEffect(() => {
    if (!reviewsOn) return
    if (tab !== "reviews") return
    if (reviews.length > 0 || loadingReviews) return
    setLoadingReviews(true)
    listApprovedReviewsByProduct(productId, 30)
      .then((rows) => setReviews(rows))
      .catch(() => setReviews([]))
      .finally(() => setLoadingReviews(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reviewsOn, productId])

  // Si no hay reviews_enabled, mostramos solo Q&A (sin sub-tabs).
  if (!reviewsOn) {
    return <ProductQA productId={productId} productName={productName} />
  }

  return (
    <div className="space-y-3">
      {/* Sub-tabs internos minimalistas (no usamos TabBar global porque
          aquí queremos un look chico, dentro del flow del drawer). */}
      <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-0.5 text-[10px] font-black uppercase tracking-widest">
        <button
          type="button"
          onClick={() => setTab("questions")}
          className={`px-3 h-8 rounded-xl flex items-center gap-1.5 transition-colors ${
            tab === "questions"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <HelpCircle size={11} /> Preguntas
        </button>
        <button
          type="button"
          onClick={() => setTab("reviews")}
          className={`px-3 h-8 rounded-xl flex items-center gap-1.5 transition-colors ${
            tab === "reviews"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <Star size={11} /> Reseñas
          {reviews.length > 0 && (
            <span className="text-[9px] tabular-nums opacity-70">
              ({reviews.length})
            </span>
          )}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === "questions" ? (
          <motion.div
            key="qa"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <ProductQA productId={productId} productName={productName} />
          </motion.div>
        ) : (
          <motion.div
            key="rv"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {loadingReviews ? (
              <div className="py-6 text-center">
                <Loader2 size={18} className="mx-auto animate-spin text-slate-300" />
              </div>
            ) : reviews.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-slate-400 italic">
                Aún no hay reseñas de este producto.
                <br />
                <span className="text-[10px] opacity-70">
                  Sé la primera en compartir tu experiencia ⭐
                </span>
              </div>
            ) : (
              <ul className="space-y-2">
                {reviews.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3"
                  >
                    <header className="flex items-start gap-2.5">
                      <Avatar
                        name={r.customer_name || r.customer_email}
                        size={28}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 truncate">
                            {r.customer_name || r.customer_email.split("@")[0]}
                          </p>
                          <span className="text-[9px] font-bold text-slate-400 shrink-0">
                            {timeAgo(r.created_at)}
                          </span>
                        </div>
                        <ReviewStars value={r.rating} size={11} />
                      </div>
                    </header>
                    {r.comment && (
                      <p className="mt-2 text-[11px] leading-snug text-slate-700 dark:text-slate-300">
                        {r.comment}
                      </p>
                    )}
                    {r.image_url && (
                      <a
                        href={r.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary"
                      >
                        <ImageIcon size={10} /> Ver foto del cliente
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

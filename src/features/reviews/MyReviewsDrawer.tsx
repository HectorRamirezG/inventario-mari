import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import {
  X,
  Star,
  MessageSquare,
  Camera,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react"

import { useAuth } from "../../lib/useAuth"
import {
  listMyReviews,
  type Review,
  type ReviewStatus,
} from "./reviewsService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import { formatRelative } from "../../lib/format"

interface Props {
  open: boolean
  onClose: () => void
}

const STATUS_META: Record<
  ReviewStatus,
  { label: string; icon: typeof CheckCircle2; cls: string }
> = {
  pending: {
    label: "En revisión",
    icon: Clock,
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  approved: {
    label: "Publicada",
    icon: CheckCircle2,
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  rejected: {
    label: "No aprobada",
    icon: AlertCircle,
    cls: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
}

/**
 * Drawer "Mis reseñas" para que el cliente vea TODAS las reseñas que
 * ha dejado (cualquier status). Realtime via hub multiplex.
 */
export default function MyReviewsDrawer({ open, onClose }: Props) {
  const { email } = useAuth()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useBodyScrollLock(open)

  const refresh = useCallback(async () => {
    if (!email) {
      setReviews([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await listMyReviews(email)
      setReviews(data)
    } catch {
      setReviews([])
    } finally {
      setLoading(false)
    }
  }, [email])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  useRealtimeSubscription("reviews", refresh, {
    enabled: open && !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60"
          />

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={OVERLAY_PANEL_TRANSITION}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            style={OVERLAY_PANEL_STYLE}
            className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-premium overflow-hidden"
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>

            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-bloom"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                }}
              >
                <Star size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black tracking-tight">Mis reseñas</p>
                <p className="text-[10px] font-bold text-slate-500">
                  Tu opinión sobre los productos que probaste
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scroll-container-ios">
              {loading ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-400 italic py-6 justify-center">
                  <Loader2 size={12} className="animate-spin" /> Cargando…
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 rounded-3xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto mb-3">
                    <MessageSquare size={22} />
                  </div>
                  <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                    Aún no has dejado reseñas
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Después de probar tus productos, califícalos para que
                    otras clientas sepan qué tan rico es 💖
                  </p>
                </div>
              ) : (
                reviews.map((r) => {
                  const meta = STATUS_META[r.status as ReviewStatus] ?? STATUS_META.pending
                  const StatusIcon = meta.icon
                  return (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              size={11}
                              className={
                                i < r.rating
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-slate-200 dark:text-slate-700"
                              }
                            />
                          ))}
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${meta.cls}`}
                        >
                          <StatusIcon size={9} />
                          {meta.label}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug">
                          {r.comment}
                        </p>
                      )}
                      {r.image_url && (
                        <div className="mt-2 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <img
                            src={r.image_url}
                            alt=""
                            className="w-full h-32 object-cover"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <p className="text-[9px] text-slate-400 mt-1.5 flex items-center gap-1">
                        <Camera size={9} className="opacity-60" />
                        {formatRelative(r.created_at)}
                      </p>
                      {r.status === "rejected" && r.admin_note && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 italic">
                          Motivo: {r.admin_note}
                        </p>
                      )}
                    </div>
                  )
                })
              )}

              {/* Hint pedagógico final */}
              {reviews.length > 0 && (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 p-3 mt-2">
                  <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 leading-snug">
                    ¡Gracias por compartir tu opinión!
                  </p>
                  <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5 leading-snug">
                    Cada reseña aprobada te suma puntos a tu programa de
                    premios. Para escribir una nueva, entra al producto desde
                    la tienda y toca el botón ★.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

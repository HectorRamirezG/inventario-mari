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
  Package,
  ChevronRight,
} from "lucide-react"

import { useAuth } from "../../lib/useAuth"
import {
  listMyReviews,
  listMyProductsToReview,
  type Review,
  type ReviewStatus,
  type ProductToReview,
} from "./reviewsService"
import ReviewsDrawer from "./ReviewsDrawer"
import { useBusinessRules } from "../settings/businessRulesService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import TabBar, { type TabItem } from "../../components/ui/TabBar"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import { formatRelative } from "../../lib/format"

interface Props {
  open: boolean
  onClose: () => void
  /** Tab inicial. Por default abre en 'pendientes' (las que faltan
   *  por reseñar — accion). Si abre desde "Mis reseñas" del Home,
   *  abre en 'hechas' (historial). */
  initialTab?: "pendientes" | "hechas"
}

type Tab = "pendientes" | "hechas"

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
 * Drawer "Mis reseñas" con tabs:
 *   - Pendientes: productos comprados sin reseñar todavía. Toca uno y
 *     se abre el ReviewsDrawer para escribir.
 *   - Hechas: historial de reseñas del cliente (cualquier status).
 *
 * Realtime: se refresca cuando llegan eventos de la tabla `reviews`.
 */
export default function MyReviewsDrawer({
  open,
  onClose,
  initialTab = "pendientes",
}: Props) {
  const { email } = useAuth()
  const bRules = useBusinessRules()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [reviews, setReviews] = useState<Review[]>([])
  const [pending, setPending] = useState<ProductToReview[]>([])
  const [loading, setLoading] = useState(true)
  /** Producto activo en sub-drawer para escribir reseña. */
  const [activeProduct, setActiveProduct] = useState<ProductToReview | null>(
    null,
  )

  useBodyScrollLock(open)

  const refresh = useCallback(async () => {
    if (!email) {
      setReviews([])
      setPending([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [r, p] = await Promise.all([
        listMyReviews(email).catch(() => []),
        listMyProductsToReview(email, {
          onPaidEnabled: bRules.reviews_on_paid_enabled,
        }).catch(() => []),
      ])
      setReviews(r)
      setPending(p)
    } finally {
      setLoading(false)
    }
  }, [email, bRules.reviews_on_paid_enabled])

  useEffect(() => {
    if (open) {
      setTab(initialTab)
      refresh()
    }
  }, [open, initialTab, refresh])

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
                  {pending.length > 0
                    ? `Tienes ${pending.length} producto${pending.length === 1 ? "" : "s"} por reseñar`
                    : "Califica los productos que probaste"}
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

            {/* Tabs Pendientes / Hechas */}
            <div className="px-5 pt-3 pb-1 shrink-0">
              <TabBar<Tab>
                layoutId="myreviews-tab"
                active={tab}
                onChange={setTab}
                tabs={[
                  {
                    id: "pendientes",
                    label: "Por reseñar",
                    badge: pending.length || undefined,
                    badgeTone: pending.length > 0 ? "primary" : "slate",
                  } as TabItem<Tab>,
                  {
                    id: "hechas",
                    label: "Hechas",
                    badge: reviews.length || undefined,
                    badgeTone: "slate",
                  } as TabItem<Tab>,
                ]}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scroll-container-ios">
              {loading ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-400 italic py-6 justify-center">
                  <Loader2 size={12} className="animate-spin" /> Cargando…
                </div>
              ) : tab === "pendientes" ? (
                /* ───────── TAB PENDIENTES ───────── */
                pending.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-14 h-14 rounded-3xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 size={22} />
                    </div>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                      ¡Estás al día!
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      No tienes productos pendientes por reseñar.
                      {reviews.length === 0
                        ? " Cuando recibas tus compras aparecerán aquí."
                        : ""}
                    </p>
                  </div>
                ) : (
                  pending.map((p) => (
                    <button
                      key={p.product_id}
                      type="button"
                      onClick={() => setActiveProduct(p)}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 hover:border-amber-300/60 dark:hover:border-amber-500/40 press text-left"
                    >
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center text-slate-300 shrink-0 p-1">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt=""
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Package size={18} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 truncate">
                          {p.product_name}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                          Comprado {formatRelative(p.last_purchase_at)}
                        </p>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        <Star size={10} /> Calificar
                      </span>
                      <ChevronRight size={14} className="text-slate-300 shrink-0" />
                    </button>
                  ))
                )
              ) : reviews.length === 0 ? (
                /* ───────── TAB HECHAS (vacío) ───────── */
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
                /* ───────── TAB HECHAS ───────── */
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

              {/* Hint pedagógico final — solo en la tab Hechas con contenido */}
              {tab === "hechas" && reviews.length > 0 && (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/30 p-3 mt-2">
                  <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 leading-snug">
                    ¡Gracias por compartir tu opinión!
                  </p>
                  <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5 leading-snug">
                    Cada reseña aprobada te suma puntos a tu programa de
                    premios.
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Sub-drawer para escribir reseña del producto activo. */}
          {activeProduct && (
            <ReviewsDrawer
              open={!!activeProduct}
              onClose={() => {
                setActiveProduct(null)
                refresh()
              }}
              productId={activeProduct.product_id}
              productName={activeProduct.product_name}
              productImage={activeProduct.image_url}
              variantId={null}
              defaultEmail={email ?? undefined}
            />
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

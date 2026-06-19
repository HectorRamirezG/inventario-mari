import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Star,
  Camera,
  Loader2,
  MessageCircle,
  Trash2,
  Image as ImageIcon,
  PlusCircle,
  Calendar,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  createReview,
  listApprovedReviewsByProduct,
  uploadReviewImage,
  hasReviewed,
  type Review,
} from "./reviewsService"
import ReviewStars from "./ReviewStars"
import { useAuth } from "../../lib/useAuth"
import Skeleton from "../../components/ui/Skeleton"
import Avatar from "../../components/ui/Avatar"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"

interface Props {
  open: boolean
  onClose: () => void
  /** ID del producto que se reseña. */
  productId: string
  /** Nombre del producto (para encabezado del drawer). */
  productName: string
  /** Foto del producto (opcional, para encabezado). */
  productImage?: string | null
  /** Variant opcional para guardar contexto. */
  variantId?: string | null
  /** Default email si el cliente no está logueado. */
  defaultEmail?: string
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

/**
 * Drawer bottom-sheet compacto para ver y crear reseñas de un producto.
 * Pestañas: "Ver reseñas" | "Escribir la mía".
 */
export default function ReviewsDrawer({
  open,
  onClose,
  productId,
  productName,
  productImage,
  variantId,
  defaultEmail,
}: Props) {
  const { session, email: authEmail, fullName } = useAuth()
  const isLogged = !!session

  const [tab, setTab] = useState<"view" | "write">("view")
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)

  // Form state
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [name, setName] = useState(fullName ?? "")
  const [email, setEmail] = useState(defaultEmail ?? authEmail ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const data = await listApprovedReviewsByProduct(productId)
      setReviews(data)
      const emailForCheck = (defaultEmail || authEmail || "").trim()
      if (emailForCheck) {
        try {
          const already = await hasReviewed(productId, emailForCheck)
          setAlreadyReviewed(already)
        } catch {
          setAlreadyReviewed(false)
        }
      } else {
        setAlreadyReviewed(false)
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar las reseñas")
    } finally {
      setLoading(false)
    }
  }, [open, productId, defaultEmail, authEmail])

  useEffect(() => {
    if (open) {
      setTab("view")
      setRating(5)
      setComment("")
      setName(fullName ?? "")
      setEmail(defaultEmail ?? authEmail ?? "")
      setFile(null)
      setPreview(null)
      load()
    }
  }, [open, load, fullName, authEmail, defaultEmail])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function handleFile(f: File | null) {
    if (!f) {
      setFile(null)
      setPreview(null)
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("La imagen pesa más de 5MB")
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      toast.error("Necesitamos tu email")
      return
    }
    if (rating < 1) {
      toast.error("Selecciona una calificación")
      return
    }
    setSubmitting(true)
    const tid = toast.loading("Enviando tu reseña...")
    try {
      let imageUrl: string | null = null
      if (file) {
        imageUrl = await uploadReviewImage(file, email)
      }
      await createReview({
        product_id: productId,
        variant_id: variantId ?? null,
        customer_email: email,
        customer_name: name || null,
        rating,
        comment: comment || null,
        image_url: imageUrl,
      })
      toast.success("¡Gracias! BEAUTY'S ME revisará tu reseña 💛", { id: tid })
      setAlreadyReviewed(true)
      setTab("view")
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar", { id: tid })
    } finally {
      setSubmitting(false)
    }
  }

  if (typeof document === "undefined") return null

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
      : 0

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="reviews-drawer-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[160] flex items-end justify-center"
          style={{ isolation: "isolate" }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={() => !submitting && onClose()}
            className="absolute inset-0 bg-slate-900/65 z-0"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={OVERLAY_PANEL_TRANSITION}
            className="relative z-10 w-full max-w-lg max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl"
            style={OVERLAY_PANEL_STYLE}
          >
            {/* Handle */}
            <div className="shrink-0 pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-5 pt-2 pb-3 flex items-start gap-3 border-b border-slate-100 dark:border-slate-800">
              {productImage ? (
                <img
                  src={productImage}
                  alt={productName}
                  className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Star
                    size={20}
                    className="text-primary"
                    fill="currentColor"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Reseñas
                </p>
                <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
                  {productName}
                </h2>
                {reviews.length > 0 ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ReviewStars value={avgRating} size={11} showValue />
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      · {reviews.length}{" "}
                      {reviews.length === 1 ? "reseña" : "reseñas"}
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                    Sé la primera en reseñar
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press shrink-0 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="shrink-0 px-5 pt-3">
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl gap-1">
                <TabBtn
                  active={tab === "view"}
                  onClick={() => setTab("view")}
                  label={`Ver (${reviews.length})`}
                />
                <TabBtn
                  active={tab === "write"}
                  onClick={() => setTab("write")}
                  label={alreadyReviewed ? "Ya reseñaste" : "Escribir"}
                  disabled={alreadyReviewed}
                />
              </div>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {tab === "view" ? (
                <ViewTab reviews={reviews} loading={loading} />
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Rating */}
                  <div className="flex flex-col items-center gap-2 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Tu calificación
                    </p>
                    <ReviewStars
                      value={rating}
                      onChange={setRating}
                      size={32}
                    />
                  </div>

                  {/* Comment */}
                  <Field label="¿Qué te pareció?">
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      maxLength={400}
                      placeholder="Cuéntales a otras clientas tu experiencia..."
                      className="settings-input resize-none py-2"
                    />
                  </Field>

                  {/* Imagen */}
                  {preview ? (
                    <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img
                        src={preview}
                        alt="preview"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleFile(null)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow press"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <label className="block rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-4 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all">
                      <Camera
                        size={18}
                        className="mx-auto mb-1 text-slate-400 dark:text-slate-500"
                      />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Sube una foto (opcional)
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleFile(e.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  )}

                  {/* Datos cliente (si no está logueado) */}
                  {!isLogged && (
                    <div className="grid grid-cols-1 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <Field label="Tu nombre">
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Tu nombre"
                          className="settings-input"
                          maxLength={60}
                        />
                      </Field>
                      <Field label="Email">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          placeholder="tu@email.com"
                          className="settings-input"
                        />
                      </Field>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || rating < 1}
                    className="w-full h-12 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-60 press-hard"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <PlusCircle size={14} />
                    )}
                    Publicar reseña
                  </button>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center italic">
                    Revisamos antes de publicar para asegurar contenido sano 💛
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function TabBtn({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
        active
          ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
          : disabled
          ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  )
}

function ViewTab({
  reviews,
  loading,
}: {
  reviews: Review[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" rounded="xl" />
        ))}
      </div>
    )
  }
  if (reviews.length === 0) {
    return (
      <div className="py-12 text-center">
        <Star
          size={32}
          className="mx-auto mb-2 text-slate-300 dark:text-slate-600"
        />
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Sin reseñas todavía
        </p>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1">
          Cuando alguien reseñe este producto aparecerá aquí
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <article
          key={r.id}
          className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3"
        >
          <header className="flex items-center gap-2.5 mb-2">
            <Avatar
              name={r.customer_name || r.customer_email}
              size={32}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
                {r.customer_name || r.customer_email.split("@")[0]}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <ReviewStars value={r.rating} size={10} />
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <Calendar size={9} /> {fmtDate(r.created_at)}
                </span>
              </div>
            </div>
          </header>

          {r.comment && (
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-snug whitespace-pre-line">
              {r.comment}
            </p>
          )}

          {r.image_url && (
            <a
              href={r.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700"
            >
              <img
                src={r.image_url}
                alt="reseña"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </a>
          )}
        </article>
      ))}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  )
}

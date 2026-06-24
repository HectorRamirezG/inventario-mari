import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  RefreshCw,
  Calendar,
  Heart,
  MessageCircle,
  Clock,
  Trash2,
  ShoppingBag,
  Loader2,
} from "lucide-react"
import toast from "react-hot-toast"

import { useAuth } from "../../lib/useAuth"
import { useFeedback } from "../../lib/useFeedback"
import {
  listWishesByEmail,
  cancelMyWish,
  WISH_STATUS_LABEL,
  WISH_STATUS_TONE,
  type Wish,
} from "./wishesService"
import WishesDrawer from "./WishesDrawer"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import PageHeader from "../../components/ui/PageHeader"
import { WishCardSkeleton } from "../../components/ui/Skeletons"
import { confirmAction } from "../../lib/confirm"

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

export default function MyWishesPage() {
  const { email } = useAuth()
  const navigate = useNavigate()
  const { strong, success, error } = useFeedback()
  const [items, setItems] = useState<Wish[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Tracking de cancelaciones en curso para deshabilitar el botón.
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!email) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await listWishesByEmail(email)
      setItems(data)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar tus deseos")
    } finally {
      setLoading(false)
    }
  }, [email])

  useEffect(() => {
    load()
  }, [load])

  // Cliente cancela su propio deseo. UI optimista — quitamos de la lista
  // al instante; si falla, restauramos. La policy DELETE viene de
  // `supabase/fix_wishes_client_cancel.sql`. Sin esa policy, falla con
  // mensaje claro y restauramos.
  async function handleCancel(w: Wish) {
    const ok = await confirmAction({
      title: "¿Cancelar este deseo?",
      description: `Quitaremos «${w.title}» de tu lista. Beauty's Me ya no recibirá tu petición.`,
      confirmLabel: "Sí, cancelar",
      tone: "danger",
    })
    if (!ok) return
    strong()
    setCancelingId(w.id)
    const prev = items
    setItems((cur) => cur.filter((x) => x.id !== w.id))
    try {
      await cancelMyWish(w.id)
      success()
      toast.success("Deseo cancelado")
    } catch (e: any) {
      error()
      setItems(prev) // revert
      toast.error(e?.message ?? "No se pudo cancelar")
    } finally {
      setCancelingId(null)
    }
  }

  const pendingCount = items.filter(
    (w) => w.status === "pending" || w.status === "reviewing",
  ).length
  const readyCount = items.filter((w) => w.status === "available").length

  return (
    <div className="flex flex-col gap-4 pb-44">
      <PageHeader
        icon={Heart}
        iconTone="rose"
        title="Mis deseos"
        subtitle={
          items.length === 0
            ? "Pídele a Beauty's Me lo que aún no tiene"
            : `${items.length} ${items.length === 1 ? "petición" : "peticiones"}${
                pendingCount > 0 ? ` · ${pendingCount} en espera` : ""
              }`
        }
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              aria-label="Refrescar"
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center press"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              className="h-9 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom press-hard"
            >
              <Plus size={12} /> Nuevo
            </button>
          </div>
        }
      />

      {/* Banner si hay disponibles */}
      {readyCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 px-4 py-3 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-base shrink-0">
            ✨
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-emerald-900 dark:text-emerald-100 leading-tight">
              ¡Beauty's Me ya tiene {readyCount} de tus deseos!
            </p>
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 leading-tight mt-0.5">
              Pásalo a tu carrito antes de que se acabe.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="shrink-0 h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom press-hard"
          >
            <ShoppingBag size={12} /> Ver en tienda
          </button>
        </motion.div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          <WishCardSkeleton count={3} />
        ) : items.length === 0 ? (
          <EmptyStateIllustration
            variant="cart-empty"
            title="Aún no has pedido nada"
            subtitle="Cuéntale a Beauty's Me qué buscas — talla, color, modelo — y te avisa cuando lo tenga."
            cta={
              <button
                onClick={() => setDrawerOpen(true)}
                className="h-10 px-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom press-hard mx-auto"
              >
                <Plus size={13} /> Crear mi primer deseo
              </button>
            }
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {items.map((w, i) => {
              const tone = WISH_STATUS_TONE[w.status]
              return (
                <motion.article
                  key={w.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: Math.min(i * 0.04, 0.2) }}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-all"
                >
                  <div className="flex gap-3 p-3">
                    {/* Imagen */}
                    {w.image_url ? (
                      <div className="w-24 h-24 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                        <img
                          src={w.image_url}
                          alt={w.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-primary/15 to-purple-500/15 flex items-center justify-center shrink-0">
                        <Heart
                          size={26}
                          className="text-primary/50"
                          strokeWidth={1.5}
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 leading-tight line-clamp-2">
                          {w.title}
                        </h3>
                        <span
                          className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
                        >
                          {WISH_STATUS_LABEL[w.status]}
                        </span>
                      </div>

                      {(w.size || w.color) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {w.size && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              Talla {w.size}
                            </span>
                          )}
                          {w.color && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {w.color}
                            </span>
                          )}
                        </div>
                      )}

                      {w.description && (
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug line-clamp-2 mt-1">
                          {w.description}
                        </p>
                      )}

                      <div className="mt-auto pt-2 flex items-center gap-3 text-[9px] font-bold text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={9} /> {fmtDate(w.created_at)}
                        </span>
                        {w.resolved_at && (
                          <span className="flex items-center gap-1">
                            <Clock size={9} /> Resuelto{" "}
                            {fmtDate(w.resolved_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Nota de Beauty's Me (admin) */}
                  {w.admin_note && (
                    <div className="mx-3 mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 flex items-start gap-2">
                      <MessageCircle
                        size={12}
                        className="text-primary shrink-0 mt-0.5"
                      />
                      <p className="text-[11px] font-bold text-primary leading-snug">
                        <span className="font-black uppercase tracking-widest text-[9px] block mb-0.5">
                          Mensaje de Beauty's Me
                        </span>
                        {w.admin_note}
                      </p>
                    </div>
                  )}

                  {/* Footer con acciones — solo cancelar mientras esté
                      pendiente o en revisión. Si ya se resolvió, no tiene
                      sentido cancelarlo. */}
                  {(w.status === "pending" || w.status === "reviewing") && (
                    <div className="mx-3 mb-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleCancel(w)}
                        disabled={cancelingId === w.id}
                        aria-label="Ya no lo quiero"
                        className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-[10px] font-black uppercase tracking-widest press disabled:opacity-50"
                      >
                        {cancelingId === w.id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Trash2 size={10} />
                        )}
                        Ya no lo quiero
                      </button>
                    </div>
                  )}
                </motion.article>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      <WishesDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={load}
      />
    </div>
  )
}

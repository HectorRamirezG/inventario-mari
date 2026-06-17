import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  Plus,
  RefreshCw,
  Calendar,
  Heart,
  MessageCircle,
  Clock,
} from "lucide-react"
import toast from "react-hot-toast"

import { useAuth } from "../../lib/useAuth"
import {
  listWishesByEmail,
  WISH_STATUS_LABEL,
  WISH_STATUS_TONE,
  type Wish,
} from "./wishesService"
import WishesDrawer from "./WishesDrawer"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import Skeleton from "../../components/ui/Skeleton"

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

export default function MyWishesPage() {
  const { email } = useAuth()
  const [items, setItems] = useState<Wish[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)

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

  const pendingCount = items.filter(
    (w) => w.status === "pending" || w.status === "reviewing",
  ).length
  const readyCount = items.filter((w) => w.status === "available").length

  return (
    <div className="flex flex-col gap-4 pb-44">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Sparkles size={14} className="text-primary" /> Mis deseos
          </h2>
          <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {items.length} {items.length === 1 ? "petición" : "peticiones"}
            {pendingCount > 0 && ` · ${pendingCount} esperando respuesta`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            aria-label="Refrescar"
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center press"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="h-10 px-4 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom press-hard"
          >
            <Plus size={13} /> Nuevo
          </button>
        </div>
      </div>

      {/* Banner si hay disponibles */}
      {readyCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 px-4 py-3 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-base">
            ✨
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-emerald-900 dark:text-emerald-100 leading-tight">
              ¡Mari ya tiene {readyCount} de tus deseos!
            </p>
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 leading-tight mt-0.5">
              Pasa a buscarlos o pídelos por WhatsApp.
            </p>
          </div>
        </motion.div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" rounded="xl" />
          ))
        ) : items.length === 0 ? (
          <EmptyStateIllustration
            variant="cart-empty"
            title="Aún no has pedido nada"
            subtitle="Cuéntale a Mari qué buscas — talla, color, modelo — y te avisa cuando lo tenga."
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

                  {/* Nota de Mari (admin) */}
                  {w.admin_note && (
                    <div className="mx-3 mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 flex items-start gap-2">
                      <MessageCircle
                        size={12}
                        className="text-primary shrink-0 mt-0.5"
                      />
                      <p className="text-[10px] font-bold text-primary leading-snug">
                        <span className="font-black uppercase tracking-widest text-[8px] block mb-0.5">
                          Mensaje de Mari
                        </span>
                        {w.admin_note}
                      </p>
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

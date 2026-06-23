import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  RefreshCw,
  Search,
  Heart,
  Calendar,
  Phone,
  Mail,
  MessageCircle,
  Check,
  X as XIcon,
  Eye,
  Clock,
  TrendingUp,
  Trash2,
  ExternalLink,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  listAllWishes,
  getWishStats,
  getTopWishedTitles,
  updateWishStatus,
  deleteWish,
  WISH_STATUS_LABEL,
  WISH_STATUS_TONE,
  type Wish,
  type WishStatus,
} from "./wishesService"
import { useBusinessRules } from "../settings/businessRulesService"
import PageHeader from "../../components/ui/PageHeader"
import KpiCard from "../../components/ui/KpiCard"
import TabBar, { type TabItem } from "../../components/ui/TabBar"
import Avatar from "../../components/ui/Avatar"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import { WishCardSkeleton } from "../../components/ui/Skeletons"
import { confirmAction } from "../../lib/confirm"
import { promptDialog } from "../../lib/prompt"

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })

type FilterStatus = WishStatus | "all"

export default function WishAdminPage() {
  const rules = useBusinessRules()
  const [items, setItems] = useState<Wish[]>([])
  const [stats, setStats] = useState<Record<WishStatus, number>>({
    pending: 0,
    reviewing: 0,
    available: 0,
    unavailable: 0,
    fulfilled: 0,
  })
  const [top, setTop] = useState<Array<{ title: string; count: number }>>([])
  const [filter, setFilter] = useState<FilterStatus>("pending")
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)
  // Highlight desde notif: cuando llega `wishes:highlight-wish` con un
  // wish_id, marcamos esa card 3.5s con ring animado + scrollIntoView.
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const pendingHighlightRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, st, t] = await Promise.all([
        listAllWishes({ status: filter, limit: 200 }),
        getWishStats(),
        getTopWishedTitles(5),
      ])
      setItems(list)
      setStats(st)
      setTop(t)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cargar sugerencias")
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  // Listener `wishes:highlight-wish` desde NotificationBell. Si el wish
  // ya está en el listado, lo marcamos al instante. Si no (filtro
  // distinto o aún no se ha refrescado), guardamos el id en pendingRef
  // y lo aplicamos cuando `items` se actualice.
  useEffect(() => {
    const handler = (e: Event) => {
      const wishId = (e as CustomEvent).detail?.wish_id as string | undefined
      if (!wishId) return
      const exists = items.some((w) => w.id === wishId)
      if (exists) {
        applyHighlight(wishId)
      } else {
        pendingHighlightRef.current = wishId
        // Si el filtro actual no es 'all', cambiamos a 'all' para que
        // aparezca; de lo contrario un refresh debería traerlo.
        if (filter !== "all") setFilter("all")
        else load()
      }
    }
    window.addEventListener("wishes:highlight-wish", handler)
    return () => window.removeEventListener("wishes:highlight-wish", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filter])

  // Cuando llega un wish pendiente vía refresh, lo aplicamos.
  useEffect(() => {
    if (!pendingHighlightRef.current) return
    const id = pendingHighlightRef.current
    if (items.some((w) => w.id === id)) {
      pendingHighlightRef.current = null
      applyHighlight(id)
    }
  }, [items])

  function applyHighlight(id: string) {
    setHighlightedId(id)
    setTimeout(() => {
      document
        .getElementById(`wish-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 80)
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 3600)
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return items
    return items.filter(
      (w) =>
        w.title.toLowerCase().includes(query) ||
        (w.customer_name || "").toLowerCase().includes(query) ||
        (w.customer_email || "").toLowerCase().includes(query) ||
        (w.description || "").toLowerCase().includes(query),
    )
  }, [items, q])

  /** Agrupado por día */
  const grouped = useMemo(() => {
    const map = new Map<string, Wish[]>()
    filtered.forEach((w) => {
      const k = dayKey(w.created_at)
      const arr = map.get(k) ?? []
      arr.push(w)
      map.set(k, arr)
    })
    return Array.from(map.entries())
  }, [filtered])

  async function setStatus(
    w: Wish,
    status: WishStatus,
    askNote = false,
  ) {
    let note: string | null | undefined
    if (askNote) {
      const r = await promptDialog({
        title:
          status === "available"
            ? "¿Qué mensaje le mandas?"
            : status === "unavailable"
            ? "Explícale por qué no lo conseguiste"
            : "Nota para el cliente (opcional)",
        defaultValue: w.admin_note || "",
        placeholder:
          status === "available"
            ? "¡Lo tengo! Ven cuando quieras 💛"
            : "No lo encontré por ahora...",
        multiline: true,
        confirmLabel: "Guardar y notificar",
      })
      if (r === null) return
      note = r
    }
    const tid = toast.loading("Actualizando...")
    try {
      await updateWishStatus(w.id, status, note)
      toast.success("Listo ✓", { id: tid })
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló", { id: tid })
    }
  }

  async function handleDelete(w: Wish) {
    if (
      !(await confirmAction({
        title: "¿Eliminar sugerencia?",
        description: `Se borrará "${w.title}" de ${w.customer_name || w.customer_email}.`,
        confirmLabel: "Sí, eliminar",
        tone: "danger",
      }))
    )
      return
    const tid = toast.loading("Eliminando...")
    try {
      await deleteWish(w.id)
      toast.success("Eliminado", { id: tid })
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló", { id: tid })
    }
  }

  function whatsappLink(w: Wish) {
    if (!w.customer_phone) return null
    const phone = w.customer_phone.replace(/\D/g, "")
    if (phone.length < 10) return null
    const text = encodeURIComponent(
      `¡Hola ${w.customer_name || ""}! Sobre tu petición "${w.title}"...`,
    )
    return `https://wa.me/${phone.length === 10 ? "52" + phone : phone}?text=${text}`
  }

  const totalActive = stats.pending + stats.reviewing
  const conversionRate =
    stats.fulfilled + stats.unavailable > 0
      ? (stats.fulfilled / (stats.fulfilled + stats.unavailable)) * 100
      : 0

  return (
    <div className="relative max-w-3xl mx-auto pb-32">
      {/* Decoración */}
      <span className="deco-orb deco-orb-pink top-10 -left-16 w-64 h-64" />
      <span className="deco-orb deco-orb-violet top-32 -right-16 w-72 h-72" />

      <PageHeader
        icon={Sparkles}
        iconTone="primary"
        title="Sugerencias del cliente"
        subtitle="Lo que la gente te pide — productos del catálogo o nuevos"
        right={
          <button
            onClick={load}
            className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center press"
            title="Refrescar"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : ""}
            />
          </button>
        }
      />

      {/* Banner si está desactivado */}
      {!rules.wishes_enabled && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-base">
            ⚠️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-amber-900 dark:text-amber-100 leading-tight">
              El módulo de deseos está apagado para el cliente
            </p>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-tight mt-0.5">
              Aún puedes ver las que ya recibiste, pero la PWA del cliente no
              muestra el botón. Actívalo desde Reglas → Módulos del cliente.
            </p>
          </div>
        </motion.div>
      )}

      {/* KPI STRIP */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <KpiCard
          label="Activas"
          value={totalActive}
          tone={totalActive > 0 ? "primary" : "default"}
          icon={<Heart size={9} />}
        />
        <KpiCard
          label="Disponibles"
          value={stats.available}
          tone={stats.available > 0 ? "success" : "default"}
          icon={<Check size={9} />}
        />
        <KpiCard
          label="Cerradas"
          value={stats.fulfilled}
          tone="default"
          icon={<Clock size={9} />}
        />
        <KpiCard
          label="Cumplimiento"
          value={`${conversionRate.toFixed(0)}%`}
          tone={conversionRate >= 60 ? "success" : "warn"}
          icon={<TrendingUp size={9} />}
        />
      </div>

      {/* Top más pedidos */}
      {top.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 surface-card p-4"
        >
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
            <TrendingUp size={11} className="text-primary" /> Lo más pedido
          </p>
          <div className="flex flex-wrap gap-2">
            {top.map((t, i) => (
              <span
                key={t.title}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-[11px] font-bold text-primary"
              >
                <span className="text-[9px] font-black opacity-50">
                  #{i + 1}
                </span>
                <span className="capitalize">{t.title}</span>
                <span className="text-[9px] font-black bg-primary/15 px-1.5 py-0.5 rounded-md">
                  {t.count}
                </span>
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Buscador */}
      <div className="relative mb-3">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          size={16}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="BUSCAR CLIENTE, PRODUCTO O EMAIL..."
          className="w-full h-12 pl-12 pr-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 outline-none shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-slate-400"
        />
      </div>

      {/* Filtros por status — TabBar unificado (igual al resto de la app). */}
      <div className="mb-4">
        <TabBar<FilterStatus>
          tabs={[
            {
              id: "pending",
              label: "Pendientes",
              badge: stats.pending,
              badgeTone: "warn",
            } as TabItem<FilterStatus>,
            {
              id: "reviewing",
              label: "Análisis",
              badge: stats.reviewing,
              badgeTone: "primary",
            } as TabItem<FilterStatus>,
            {
              id: "available",
              label: "Listos",
              badge: stats.available,
              badgeTone: "success",
            } as TabItem<FilterStatus>,
            {
              id: "all",
              label: "Todos",
            } as TabItem<FilterStatus>,
          ]}
          active={filter}
          onChange={setFilter}
          layoutId="wishes-admin-tab"
        />
      </div>

      {/* Lista */}
      <div className="space-y-5">
        {loading ? (
          <WishCardSkeleton count={4} />
        ) : filtered.length === 0 ? (
          <EmptyStateIllustration
            variant="no-orders"
            title="Sin sugerencias"
            subtitle={
              q
                ? "No hay coincidencias con tu búsqueda"
                : filter === "pending"
                ? "¡Vas al día! No hay peticiones nuevas."
                : "Cuando los clientes te pidan algo, aparecerá aquí"
            }
          />
        ) : (
          grouped.map(([day, rows]) => (
            <section key={day}>
              <div className="sticky top-0 z-10 -mx-2 px-3 py-1.5 mb-2 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-md flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {day}
                </span>
                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500">
                  · {rows.length}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-slate-200 dark:from-slate-700 to-transparent" />
              </div>

              <AnimatePresence mode="popLayout">
                <div className="space-y-3">
                  {rows.map((w, i) => {
                    const tone = WISH_STATUS_TONE[w.status]
                    const wa = whatsappLink(w)
                    const isHighlighted = highlightedId === w.id
                    return (
                      <motion.article
                        key={w.id}
                        id={`wish-${w.id}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ delay: Math.min(i * 0.03, 0.2) }}
                        className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden transition-all ${
                          isHighlighted
                            ? "ring-4 ring-primary/40 ring-offset-2 dark:ring-offset-slate-950 animate-pulse"
                            : ""
                        }`}
                      >
                        <div className="flex gap-3 p-3">
                          {/* Imagen */}
                          {w.image_url ? (
                            <a
                              href={w.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-24 h-24 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 relative group"
                            >
                              <img
                                src={w.image_url}
                                alt={w.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Eye className="text-white" size={18} />
                              </div>
                            </a>
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
                                {w.product_id && (
                                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                                    En catálogo
                                  </span>
                                )}
                              </div>
                            )}

                            {w.description && (
                              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-snug line-clamp-2 mt-1">
                                {w.description}
                              </p>
                            )}

                            <div className="mt-auto pt-2 flex items-center gap-2 flex-wrap">
                              <Avatar
                                name={w.customer_name || w.customer_email}
                                size={20}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-slate-700 dark:text-slate-200 truncate leading-tight">
                                  {w.customer_name || w.customer_email}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 truncate flex items-center gap-1">
                                  <Calendar size={8} />
                                  {fmtDate(w.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Nota previa */}
                        {w.admin_note && (
                          <div className="mx-3 mb-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 flex items-start gap-2">
                            <MessageCircle
                              size={11}
                              className="text-primary shrink-0 mt-0.5"
                            />
                            <p className="text-[10px] font-bold text-primary leading-snug">
                              {w.admin_note}
                            </p>
                          </div>
                        )}

                        {/* Contacto */}
                        <div className="px-3 pb-2 flex items-center gap-2 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                          {w.customer_phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={9} /> {w.customer_phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1 truncate">
                            <Mail size={9} />
                            <span className="truncate">{w.customer_email}</span>
                          </span>
                        </div>

                        {/* Acciones */}
                        <div className="border-t border-slate-100 dark:border-slate-800 px-2 py-2 flex items-center justify-between gap-1 flex-wrap">
                          <div className="flex items-center gap-1 flex-wrap">
                            {w.status === "pending" && (
                              <ActionBtn
                                tone="sky"
                                icon={<Eye size={11} />}
                                label="Analizar"
                                onClick={() => setStatus(w, "reviewing")}
                              />
                            )}
                            {(w.status === "pending" ||
                              w.status === "reviewing") && (
                              <>
                                <ActionBtn
                                  tone="emerald"
                                  icon={<Check size={11} />}
                                  label="¡Lo tengo!"
                                  onClick={() =>
                                    setStatus(w, "available", true)
                                  }
                                />
                                <ActionBtn
                                  tone="rose"
                                  icon={<XIcon size={11} />}
                                  label="No puedo"
                                  onClick={() =>
                                    setStatus(w, "unavailable", true)
                                  }
                                />
                              </>
                            )}
                            {w.status === "available" && (
                              <ActionBtn
                                tone="slate"
                                icon={<Check size={11} />}
                                label="Cerrar (entregado)"
                                onClick={() => setStatus(w, "fulfilled")}
                              />
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-8 px-3 rounded-lg bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-600 press"
                              >
                                <ExternalLink size={10} /> WhatsApp
                              </a>
                            )}
                            <button
                              onClick={() => handleDelete(w)}
                              className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center press"
                              title="Eliminar"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    )
                  })}
                </div>
              </AnimatePresence>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

function ActionBtn({
  tone,
  icon,
  label,
  onClick,
}: {
  tone: "emerald" | "rose" | "sky" | "slate"
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  const cls: Record<typeof tone, string> = {
    emerald:
      "bg-emerald-500 text-white hover:bg-emerald-600",
    rose: "bg-rose-500 text-white hover:bg-rose-600",
    sky: "bg-sky-500 text-white hover:bg-sky-600",
    slate:
      "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700",
  }
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1 press ${cls[tone]}`}
    >
      {icon}
      {label}
    </button>
  )
}

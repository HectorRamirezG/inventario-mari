import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Star,
  RefreshCw,
  Search,
  Check,
  X as XIcon,
  Eye,
  Trash2,
  Calendar,
  Mail,
  TrendingUp,
  MessageSquare,
  Package,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  listAllReviews,
  getReviewStatusStats,
  moderateReview,
  deleteReview,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_TONE,
  type Review,
  type ReviewStatus,
} from "./reviewsService"
import ReviewStars from "./ReviewStars"
import { useBusinessRules } from "../settings/businessRulesService"
import { supabase } from "../../lib/supabase"
import PageHeader from "../../components/ui/PageHeader"
import KpiCard from "../../components/ui/KpiCard"
import Avatar from "../../components/ui/Avatar"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import Skeleton from "../../components/ui/Skeleton"
import TabBar, { type TabItem } from "../../components/ui/TabBar"
import { confirmAction } from "../../lib/confirm"
import { promptDialog } from "../../lib/prompt"

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

type FilterStatus = ReviewStatus | "all"

export default function ReviewsAdminPage() {
  const rules = useBusinessRules()
  const [items, setItems] = useState<Review[]>([])
  const [productNames, setProductNames] = useState<Map<string, string>>(
    new Map(),
  )
  const [stats, setStats] = useState<Record<ReviewStatus, number>>({
    pending: 0,
    approved: 0,
    rejected: 0,
  })
  const [filter, setFilter] = useState<FilterStatus>("pending")
  const [q, setQ] = useState("")
  const [loading, setLoading] = useState(true)
  // Highlight desde notif: cuando llega `reviews:highlight-review` con
  // un review_id, marcamos esa card 3.5s con ring animado + scroll.
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const pendingHighlightRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, st] = await Promise.all([
        listAllReviews({ status: filter, limit: 200 }),
        getReviewStatusStats(),
      ])
      setItems(list)
      setStats(st)

      // Resolver nombres de productos en una sola query
      const ids = Array.from(new Set(list.map((r) => r.product_id)))
      if (ids.length) {
        const { data } = await supabase
          .from("products")
          .select("id, name")
          .in("id", ids)
        const map = new Map<string, string>()
        ;(data ?? []).forEach((p: any) => map.set(p.id, p.name))
        setProductNames(map)
      } else {
        setProductNames(new Map())
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar reseñas")
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  // Listener `reviews:highlight-review` desde NotificationBell.
  useEffect(() => {
    const handler = (e: Event) => {
      const reviewId = (e as CustomEvent).detail?.review_id as string | undefined
      if (!reviewId) return
      const exists = items.some((r) => r.id === reviewId)
      if (exists) {
        applyHighlight(reviewId)
      } else {
        pendingHighlightRef.current = reviewId
        if (filter !== "all") setFilter("all")
        else load()
      }
    }
    window.addEventListener("reviews:highlight-review", handler)
    return () =>
      window.removeEventListener("reviews:highlight-review", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filter])

  useEffect(() => {
    if (!pendingHighlightRef.current) return
    const id = pendingHighlightRef.current
    if (items.some((r) => r.id === id)) {
      pendingHighlightRef.current = null
      applyHighlight(id)
    }
  }, [items])

  function applyHighlight(id: string) {
    setHighlightedId(id)
    setTimeout(() => {
      document
        .getElementById(`review-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 80)
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 3600)
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) return items
    return items.filter((r) => {
      const productName = productNames.get(r.product_id) ?? ""
      return (
        productName.toLowerCase().includes(query) ||
        (r.customer_name || "").toLowerCase().includes(query) ||
        (r.customer_email || "").toLowerCase().includes(query) ||
        (r.comment || "").toLowerCase().includes(query)
      )
    })
  }, [items, productNames, q])

  const avgRating = useMemo(() => {
    const approved = items.filter((r) => r.status === "approved")
    if (!approved.length) return 0
    return approved.reduce((a, r) => a + r.rating, 0) / approved.length
  }, [items])

  async function handleModerate(
    r: Review,
    status: ReviewStatus,
    askNote = false,
  ) {
    let note: string | null | undefined
    if (askNote) {
      const res = await promptDialog({
        title:
          status === "rejected"
            ? "¿Por qué rechazas esta reseña?"
            : "Nota interna (opcional)",
        defaultValue: r.admin_note || "",
        placeholder:
          status === "rejected"
            ? "Contenido inapropiado / no relacionado..."
            : "",
        multiline: true,
        confirmLabel: "Guardar",
      })
      if (res === null) return
      note = res
    }
    const tid = toast.loading("Actualizando...")
    try {
      await moderateReview(r.id, status, note)
      toast.success("Listo ✓", { id: tid })
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló", { id: tid })
    }
  }

  async function handleDelete(r: Review) {
    if (
      !(await confirmAction({
        title: "¿Eliminar reseña?",
        description: "Esto borra permanentemente la reseña y su imagen.",
        confirmLabel: "Sí, eliminar",
        tone: "danger",
      }))
    )
      return
    const tid = toast.loading("Eliminando...")
    try {
      await deleteReview(r.id)
      toast.success("Eliminada", { id: tid })
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló", { id: tid })
    }
  }

  const total = stats.pending + stats.approved + stats.rejected

  return (
    <div className="relative max-w-3xl mx-auto pb-32">
      <span className="deco-orb deco-orb-amber top-10 -left-16 w-64 h-64" />
      <span className="deco-orb deco-orb-violet top-32 -right-16 w-72 h-72" />

      <PageHeader
        icon={Star}
        iconTone="amber"
        title="Reseñas"
        subtitle="Modera lo que el cliente publica en cada producto"
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
      {!rules.reviews_enabled && (
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
              Reseñas apagadas en la tienda
            </p>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-tight mt-0.5">
              Los clientes no pueden escribir nuevas hasta que actives{" "}
              <b>reviews_enabled</b> en Reglas → Módulos del cliente.
            </p>
          </div>
        </motion.div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <KpiCard
          label="Por moderar"
          value={stats.pending}
          tone={stats.pending > 0 ? "primary" : "default"}
          icon={<Eye size={9} />}
        />
        <KpiCard
          label="Publicadas"
          value={stats.approved}
          tone="success"
          icon={<Check size={9} />}
        />
        <KpiCard
          label="Rechazadas"
          value={stats.rejected}
          tone="default"
          icon={<XIcon size={9} />}
        />
        <KpiCard
          label="Promedio"
          value={`${avgRating.toFixed(1)}★`}
          tone={avgRating >= 4 ? "success" : "warn"}
          icon={<TrendingUp size={9} />}
        />
      </div>

      {/* Buscador */}
      <div className="relative mb-3">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          size={16}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="BUSCAR PRODUCTO, CLIENTE, COMENTARIO..."
          className="w-full h-12 pl-12 pr-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 outline-none shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-slate-400"
        />
      </div>

      {/* Filtros — TabBar unificado para que se vea igual que el resto. */}
      <div className="mb-4">
        <TabBar<FilterStatus>
          tabs={[
            {
              id: "pending",
              label: "Por moderar",
              badge: stats.pending,
              badgeTone: "warn",
            } as TabItem<FilterStatus>,
            {
              id: "approved",
              label: "Publicadas",
              badge: stats.approved,
              badgeTone: "success",
            } as TabItem<FilterStatus>,
            {
              id: "rejected",
              label: "Rechazadas",
              badge: stats.rejected,
              badgeTone: "danger",
            } as TabItem<FilterStatus>,
            {
              id: "all",
              label: "Todas",
              badge: total,
            } as TabItem<FilterStatus>,
          ]}
          active={filter}
          onChange={setFilter}
          layoutId="reviews-admin-tab"
        />
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" rounded="xl" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyStateIllustration
            variant="no-orders"
            title="Sin reseñas"
            subtitle={
              q
                ? "No hay coincidencias con tu búsqueda"
                : filter === "pending"
                ? "¡Vas al día! Sin reseñas por moderar."
                : "Cuando los clientes reseñen aparecerán aquí"
            }
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((r, i) => {
              const tone = REVIEW_STATUS_TONE[r.status]
              const productName =
                productNames.get(r.product_id) ?? "Producto eliminado"
              const isHighlighted = highlightedId === r.id
              return (
                <motion.article
                  key={r.id}
                  id={`review-${r.id}`}
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
                  {/* Header */}
                  <header className="p-3 flex items-start gap-3 border-b border-slate-100 dark:border-slate-800">
                    <Avatar
                      name={r.customer_name || r.customer_email}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
                          {r.customer_name || r.customer_email.split("@")[0]}
                        </p>
                        <span
                          className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
                        >
                          {REVIEW_STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <ReviewStars value={r.rating} size={11} />
                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1">
                          <Calendar size={9} /> {fmtDate(r.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[9px] font-bold text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Package size={9} className="text-primary" />
                          <span className="text-primary truncate max-w-[180px]">
                            {productName}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 truncate">
                          <Mail size={9} />
                          <span className="truncate">{r.customer_email}</span>
                        </span>
                      </div>
                    </div>
                  </header>

                  {/* Contenido */}
                  <div className="p-3 space-y-2">
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
                        className="block aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 max-w-sm relative group"
                      >
                        <img
                          src={r.image_url}
                          alt="reseña"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="text-white" size={18} />
                        </div>
                      </a>
                    )}
                    {r.admin_note && (
                      <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 flex items-start gap-2">
                        <MessageSquare
                          size={11}
                          className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                        />
                        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-snug">
                          {r.admin_note}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="border-t border-slate-100 dark:border-slate-800 px-2 py-2 flex items-center gap-1 flex-wrap">
                    {r.status === "pending" && (
                      <>
                        <ActionBtn
                          tone="emerald"
                          icon={<Check size={11} />}
                          label="Aprobar"
                          onClick={() => handleModerate(r, "approved")}
                        />
                        <ActionBtn
                          tone="rose"
                          icon={<XIcon size={11} />}
                          label="Rechazar"
                          onClick={() =>
                            handleModerate(r, "rejected", true)
                          }
                        />
                      </>
                    )}
                    {r.status === "approved" && (
                      <ActionBtn
                        tone="slate"
                        icon={<XIcon size={11} />}
                        label="Quitar del público"
                        onClick={() => handleModerate(r, "rejected", true)}
                      />
                    )}
                    {r.status === "rejected" && (
                      <ActionBtn
                        tone="emerald"
                        icon={<Check size={11} />}
                        label="Reactivar"
                        onClick={() => handleModerate(r, "approved")}
                      />
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={() => handleDelete(r)}
                      className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center press"
                      title="Eliminar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </motion.article>
              )
            })}
          </AnimatePresence>
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
  tone: "emerald" | "rose" | "slate"
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  const cls: Record<typeof tone, string> = {
    emerald: "bg-emerald-500 text-white hover:bg-emerald-600",
    rose: "bg-rose-500 text-white hover:bg-rose-600",
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

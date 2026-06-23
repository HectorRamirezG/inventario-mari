/**
 * DeliveriesAdminPage — Módulo dedicado de Comandas (entregas).
 *
 * Antes vivía mezclado dentro de "Pendientes". Ahora es su propio módulo
 * en el sidebar admin para tener foco y reducir saturación.
 *
 * Estructura:
 *   - Hero con KPIs (Activas, Hoy, Esta semana).
 *   - Tabs por estatus (Activas, Listas, Entregadas, Canceladas, Todas).
 *   - Buscador (folio, repartidor, zona).
 *   - Lista de cards con acciones inline: llamar repartidor, abrir
 *     comanda pública, marcar entregada, ir al apartado.
 *
 * Realtime: escucha `delivery_notes` y refresca la lista.
 */
import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Truck,
  Search,
  Phone,
  MapPin,
  CheckCircle2,
  ExternalLink,
  Clock,
  Package,
  XCircle,
  ArrowRight,
} from "lucide-react"
import toast from "react-hot-toast"

import PageHeader from "../../components/ui/PageHeader"
import KpiCard from "../../components/ui/KpiCard"
import TabBar, { type TabItem } from "../../components/ui/TabBar"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import Skeleton from "../../components/ui/Skeleton"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { formatRelative, shortId } from "../../lib/format"
import {
  listAllDeliveryNotes,
  updateDeliveryStatus,
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  publicDeliveryUrl,
  type DeliveryNote,
  type DeliveryStatus,
} from "./deliveryService"

type FilterTab = "active" | "ready" | "delivered" | "cancelled" | "all"

const FILTER_TO_STATUSES: Record<FilterTab, DeliveryStatus[] | undefined> = {
  active: ["sent", "picked_up"],
  ready: ["draft"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
  all: undefined,
}

const QUERY_KEY = ["deliveries-admin"] as const

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfWeek(): number {
  const d = new Date()
  const day = d.getDay() // 0 = domingo
  const diff = (day + 6) % 7 // lunes como inicio
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export default function DeliveriesAdminPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<FilterTab>("active")
  const [q, setQ] = useState("")

  // Traemos TODAS las comandas (limit 200 default) y filtramos local.
  // Así un cambio de tab no causa nueva query, y el search es instantáneo.
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listAllDeliveryNotes({ limit: 300 }),
    staleTime: 60_000,
  })

  useRealtimeSubscription("delivery_notes", () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  })

  const list = data ?? []

  // KPIs
  const kpis = useMemo(() => {
    const active = list.filter((n) => n.status === "sent" || n.status === "picked_up").length
    const today0 = startOfToday()
    const week0 = startOfWeek()
    const todayDeliv = list.filter((n) => {
      const t = new Date(n.created_at).getTime()
      return t >= today0
    }).length
    const weekDeliv = list.filter((n) => {
      const t = new Date(n.created_at).getTime()
      return t >= week0
    }).length
    return { active, today: todayDeliv, week: weekDeliv }
  }, [list])

  // Filtrado por tab + búsqueda
  const filtered = useMemo(() => {
    const targetStatuses = FILTER_TO_STATUSES[tab]
    const base = targetStatuses
      ? list.filter((n) => targetStatuses.includes(n.status))
      : list
    const search = q.trim().toLowerCase()
    if (!search) return base
    return base.filter((n) => {
      return (
        n.id.toLowerCase().includes(search) ||
        n.sale_id.toLowerCase().includes(search) ||
        (n.driver_name ?? "").toLowerCase().includes(search) ||
        (n.delivery_zone ?? "").toLowerCase().includes(search) ||
        (n.driver_phone ?? "").includes(search)
      )
    })
  }, [list, tab, q])

  async function handleMarkDelivered(note: DeliveryNote) {
    const prev = queryClient.getQueryData<DeliveryNote[]>(QUERY_KEY)
    queryClient.setQueryData<DeliveryNote[]>(QUERY_KEY, (rows) =>
      (rows ?? []).map((r) =>
        r.id === note.id ? { ...r, status: "delivered" as DeliveryStatus } : r,
      ),
    )
    try {
      await updateDeliveryStatus(note.id, "delivered")
      toast.success("Comanda entregada")
    } catch (e: any) {
      if (prev) queryClient.setQueryData(QUERY_KEY, prev)
      toast.error(e?.message ?? "No se pudo actualizar")
    }
  }

  const TABS: TabItem<FilterTab>[] = [
    {
      id: "active",
      label: "Activas",
      badge: kpis.active || undefined,
      badgeTone: "primary",
    } as TabItem<FilterTab>,
    { id: "ready", label: "Por enviar" } as TabItem<FilterTab>,
    { id: "delivered", label: "Entregadas" } as TabItem<FilterTab>,
    { id: "cancelled", label: "Canceladas" } as TabItem<FilterTab>,
    { id: "all", label: "Todas" } as TabItem<FilterTab>,
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Comandas"
        subtitle="Entregas activas y su historial — en un solo lugar"
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <KpiCard
          label="Activas"
          value={String(kpis.active)}
          icon={<Truck size={14} />}
          tone="primary"
        />
        <KpiCard
          label="Hoy"
          value={String(kpis.today)}
          icon={<Clock size={14} />}
          tone="default"
        />
        <KpiCard
          label="Esta semana"
          value={String(kpis.week)}
          icon={<Package size={14} />}
          tone="success"
        />
      </div>

      {/* Search + tabs */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-2xl px-3 h-11 border border-slate-200 dark:border-slate-800 focus-within:border-primary/40 transition-colors">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar folio, repartidor o zona…"
            className="bg-transparent outline-none flex-1 text-sm dark:text-slate-100 placeholder:text-slate-400"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 press"
            >
              Limpiar
            </button>
          )}
        </label>

        <TabBar<FilterTab>
          tabs={TABS}
          active={tab}
          onChange={setTab}
          layoutId="deliveries-tabs"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" rounded="2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyStateIllustration
          variant="no-orders"
          title={
            q
              ? "Sin resultados"
              : tab === "active"
              ? "No hay entregas activas"
              : "Sin comandas en este filtro"
          }
          subtitle={
            q
              ? "Prueba con otro folio, nombre o zona."
              : tab === "active"
              ? "Cuando envíes una comanda aparecerá aquí en tiempo real."
              : "Cambia el filtro arriba para ver otros estados."
          }
        />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((note) => (
              <DeliveryRow
                key={note.id}
                note={note}
                onMarkDelivered={handleMarkDelivered}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

interface DeliveryRowProps {
  note: DeliveryNote
  onMarkDelivered: (note: DeliveryNote) => void
}

function DeliveryRow({ note, onMarkDelivered }: DeliveryRowProps) {
  const tone = DELIVERY_STATUS_TONE[note.status]
  const phone = (note.driver_phone ?? "").replace(/\D/g, "")
  const fullPhone = phone.length === 10 ? `52${phone}` : phone
  const isActive = note.status === "sent" || note.status === "picked_up"
  const isCancelled = note.status === "cancelled"
  const isDelivered = note.status === "delivered"

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={`rounded-2xl border p-3 transition-colors ${
        isActive
          ? "bg-white dark:bg-slate-900 border-sky-200/70 dark:border-sky-500/30"
          : isCancelled
          ? "bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80"
          : isDelivered
          ? "bg-emerald-50/40 dark:bg-emerald-500/5 border-emerald-200/40 dark:border-emerald-500/20"
          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-black text-slate-900 dark:text-slate-100">
              Folio {shortId(note.sale_id)}
            </span>
            <span
              className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
            >
              {DELIVERY_STATUS_LABEL[note.status]}
            </span>
            <span className="text-[9px] font-bold text-slate-400">
              {formatRelative(note.created_at)}
            </span>
          </div>

          {/* Detalle */}
          <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 flex-wrap">
            {note.driver_name && (
              <span className="flex items-center gap-1">
                <Truck size={10} /> {note.driver_name}
              </span>
            )}
            {note.delivery_zone && (
              <span className="flex items-center gap-1">
                <MapPin size={10} /> {note.delivery_zone}
              </span>
            )}
            {isCancelled && note.cancellation_reason && (
              <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400">
                <XCircle size={10} /> {note.cancellation_reason}
              </span>
            )}
          </div>

          {/* Notas opcionales */}
          {note.notes && (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 italic line-clamp-2">
              {note.notes}
            </p>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            {fullPhone && (
              <a
                href={`tel:${fullPhone}`}
                title="Llamar al repartidor"
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center press"
              >
                <Phone size={12} />
              </a>
            )}
            <a
              href={publicDeliveryUrl(note.public_token)}
              target="_blank"
              rel="noreferrer"
              title="Abrir comanda pública"
              className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center press"
            >
              <ExternalLink size={12} />
            </a>
            <button
              type="button"
              onClick={() => {
                // Navegar a Pendientes con highlight en esa venta.
                window.dispatchEvent(
                  new CustomEvent("mari:navigate", { detail: { section: "pendientes" } }),
                )
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("apartados:highlight-sale", {
                      detail: { sale_id: note.sale_id },
                    }),
                  )
                }, 200)
              }}
              title="Ir al apartado"
              className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center press"
            >
              <ArrowRight size={12} />
            </button>
          </div>
          {isActive && (
            <button
              type="button"
              onClick={() => onMarkDelivered(note)}
              className="h-8 px-3 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press shadow-sm"
            >
              <CheckCircle2 size={11} /> Listo
            </button>
          )}
        </div>
      </div>
    </motion.li>
  )
}

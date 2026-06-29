import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LifeBuoy,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react"

import { useAuth } from "../../lib/useAuth"
import {
  listMyTickets,
  SUPPORT_CATEGORIES,
  type SupportTicket,
  type SupportStatus,
} from "../support/supportService"
import { formatDateTime, formatRelative, shortId } from "../../lib/format"
import SupportModal from "../support/SupportModal"
import PageHeader from "../../components/ui/PageHeader"
import { ReportCardSkeleton } from "../../components/ui/Skeletons"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"

const STATUS_META: Record<
  SupportStatus,
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  open: {
    label: "Pendiente",
    tone: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/40 dark:text-rose-300",
    icon: AlertCircle,
  },
  in_progress: {
    label: "En revisión",
    tone: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/40 dark:text-sky-300",
    icon: Clock,
  },
  resolved: {
    label: "Solucionado",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-300",
    icon: CheckCircle2,
  },
}

function categoryLabel(cat: string) {
  return SUPPORT_CATEGORIES.find((c) => c.id === cat)?.label ?? cat
}

export default function MyReportsPage() {
  const { email } = useAuth()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [openSupport, setOpenSupport] = useState(false)
  // Timestamp del último refetch — para mostrar "actualizado hace X"
  // y dar confianza al cliente de que la data es fresca.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function load() {
    if (!email) {
      setTickets([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await listMyTickets(email)
      setTickets(data)
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  // Heurística de subtítulo: si hay pendientes/en revisión, los
  // destacamos arriba; si no, solo el total.
  const pendingCount = tickets.filter(
    (t) => t.status === "open" || t.status === "in_progress",
  ).length
  const subtitle = (() => {
    if (tickets.length === 0) return "Sin reportes enviados"
    if (pendingCount > 0) {
      return `${tickets.length} reporte${tickets.length === 1 ? "" : "s"} · ${pendingCount} pendiente${
        pendingCount === 1 ? "" : "s"
      }`
    }
    return `${tickets.length} reporte${tickets.length === 1 ? "" : "s"} · todos resueltos ✓`
  })()

  return (
    <div className="space-y-3 pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <PageHeader
        icon={LifeBuoy}
        title="Mis reportes"
        subtitle={subtitle}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              aria-label="Refrescar reportes"
              title="Refrescar"
              className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center press disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => setOpenSupport(true)}
              className="h-10 px-3 rounded-full bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom active:scale-95"
            >
              <Plus size={12} strokeWidth={3} /> Nuevo
            </button>
          </div>
        }
      />

      {lastUpdated && tickets.length > 0 && (
        <p className="text-[10px] font-bold text-slate-400 italic text-right -mt-1 mb-2 px-1">
          Actualizado {formatRelative(lastUpdated.toISOString())}
        </p>
      )}

      {loading ? (
        <ReportCardSkeleton count={4} />
      ) : tickets.length === 0 ? (
        <EmptyState onCreate={() => setOpenSupport(true)} />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {tickets.map((t) => (
              <TicketCard key={t.id} ticket={t} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <SupportModal
        open={openSupport}
        saleId={null}
        onClose={() => {
          setOpenSupport(false)
          load()
        }}
      />
    </div>
  )
}

/* ════════════════════════ Sub-componentes ════════════════════════ */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyStateIllustration
      variant="no-orders"
      title="Aún no tienes reportes"
      subtitle="Si algo no salió como esperabas, házselo saber a Beauty's Me aquí para resolverlo rápido."
      cta={
        <button
          type="button"
          onClick={onCreate}
          className="h-11 px-5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 shadow-bloom press-hard"
        >
          <Plus size={12} strokeWidth={3} /> Crear reporte
        </button>
      }
    />
  )
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const status = STATUS_META[ticket.status as SupportStatus] ?? STATUS_META.open
  const Icon = status.icon
  const resolution = (ticket as any).resolution_message as string | undefined
  const resolvedAt = (ticket as any).resolved_at as string | undefined

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="surface-card p-4"
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {formatDateTime(ticket.created_at)}
            {ticket.sale_id && (
              <>
                {" · Folio "}
                <span className="tabular-nums text-slate-600 dark:text-slate-300">
                  {shortId(ticket.sale_id)}
                </span>
              </>
            )}
          </p>
          <p className="text-sm font-black truncate mt-0.5">
            {categoryLabel(ticket.category)}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-[10px] font-black uppercase tracking-widest border ${status.tone}`}
        >
          <Icon size={11} /> {status.label}
        </span>
      </header>

      {ticket.description && (
        <p className="text-[12px] text-slate-700 dark:text-slate-300 italic leading-snug">
          "{ticket.description}"
        </p>
      )}

      {ticket.image_url && (
        <a
          href={ticket.image_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-primary"
        >
          <ImageIcon size={11} /> Ver foto adjunta
        </a>
      )}

      {/* Mini timeline: Creado → En revisión → Resuelto. Cada punto se
          activa según el status actual. El tercer punto solo si está
          resuelto. Esto baja la ansiedad al ver el progreso visual. */}
      <StatusTimeline
        status={ticket.status as SupportStatus}
        createdAt={ticket.created_at}
        resolvedAt={resolvedAt ?? null}
      />

      {ticket.status === "resolved" && resolution && (
        <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/40 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
            <CheckCircle2 size={11} /> Respuesta de Beauty's Me
          </p>
          <p className="text-[12px] text-emerald-900 dark:text-emerald-100 leading-snug">
            {resolution}
          </p>
        </div>
      )}

      {ticket.status === "resolved" && !resolution && (
        <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300 font-bold">
          Beauty's Me marcó tu reporte como resuelto.
        </p>
      )}
    </motion.article>
  )
}

/**
 * Línea visual de 3 puntos: Creado → En revisión → Resuelto.
 * El punto activo es el que coincide con el status actual; los
 * anteriores aparecen completos, los posteriores en gris.
 */
function StatusTimeline({
  status,
  createdAt,
  resolvedAt,
}: {
  status: SupportStatus
  createdAt: string
  resolvedAt: string | null
}) {
  const step = status === "open" ? 1 : status === "in_progress" ? 2 : 3
  const steps = [
    { id: 1, label: "Recibido", ts: createdAt },
    { id: 2, label: "En revisión", ts: null as string | null },
    { id: 3, label: "Resuelto", ts: resolvedAt },
  ]
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-1">
        {steps.map((s, i) => {
          const isDone = step >= s.id
          const isActive = step === s.id
          return (
            <div key={s.id} className="flex-1 flex items-center gap-1">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`w-3 h-3 rounded-full transition-colors ${
                    isDone
                      ? "bg-primary"
                      : "bg-slate-200 dark:bg-slate-700"
                  } ${isActive && status !== "resolved" ? "ring-2 ring-primary/30 animate-pulse" : ""}`}
                />
              </div>
              {i < steps.length - 1 && (
                <span
                  className={`flex-1 h-0.5 rounded-full transition-colors ${
                    step > s.id ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="flex items-start gap-1 mt-1.5">
        {steps.map((s) => {
          const isDone = step >= s.id
          return (
            <div key={s.id} className="flex-1 text-center">
              <p
                className={`text-[10px] font-black uppercase tracking-widest leading-tight ${
                  isDone
                    ? "text-slate-700 dark:text-slate-200"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {s.label}
              </p>
              {s.ts && (
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                  {formatRelative(s.ts)}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LifeBuoy,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Inbox,
  Image as ImageIcon,
} from "lucide-react"

import { useAuth } from "../../lib/useAuth"
import {
  listMyTickets,
  SUPPORT_CATEGORIES,
  type SupportTicket,
  type SupportStatus,
} from "../support/supportService"
import { formatDateTime, shortId } from "../../lib/format"
import SupportModal from "../support/SupportModal"
import PageHeader from "../../components/ui/PageHeader"
import Skeleton from "../../components/ui/Skeleton"

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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email])

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <PageHeader
        icon={LifeBuoy}
        title="Mis reportes"
        subtitle={
          tickets.length === 0
            ? "Sin reportes enviados"
            : `${tickets.length} ${tickets.length === 1 ? "reporte" : "reportes"}`
        }
        right={
          <button
            type="button"
            onClick={() => setOpenSupport(true)}
            className="h-10 px-3 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom active:scale-95"
          >
            <Plus size={12} strokeWidth={3} /> Nuevo
          </button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" rounded="lg" />
          ))}
        </div>
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
    <div className="surface-card p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
        <Inbox size={22} />
      </div>
      <p className="font-black text-slate-700 dark:text-slate-200">
        Aún no tienes reportes
      </p>
      <p className="text-[11px] text-slate-500 mt-1">
        Cuando algo no salga como esperabas, házselo saber a Mari aquí.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 h-11 px-5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 shadow-bloom active:scale-95"
      >
        <Plus size={12} strokeWidth={3} /> Crear reporte
      </button>
    </div>
  )
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const status = STATUS_META[ticket.status as SupportStatus] ?? STATUS_META.open
  const Icon = status.icon
  const resolution = (ticket as any).resolution_message as string | undefined

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
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            {formatDateTime(ticket.created_at)}
            {ticket.sale_id && (
              <>
                {" · Folio "}
                <span className="tabular-nums text-slate-500">
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
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-[9px] font-black uppercase tracking-widest border ${status.tone}`}
        >
          <Icon size={10} /> {status.label}
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
          className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary"
        >
          <ImageIcon size={11} /> Ver foto adjunta
        </a>
      )}

      {ticket.status === "resolved" && resolution && (
        <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/40 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
            <CheckCircle2 size={10} /> Respuesta de Mari
          </p>
          <p className="text-[12px] text-emerald-900 dark:text-emerald-100 leading-snug">
            {resolution}
          </p>
        </div>
      )}

      {ticket.status === "resolved" && !resolution && (
        <p className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">
          Mari marcó tu reporte como resuelto.
        </p>
      )}
    </motion.article>
  )
}

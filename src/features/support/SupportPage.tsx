import { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LifeBuoy,
  RefreshCw,
  Loader2,
  ImageOff,
  Image as ImageIcon,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  MessageCircle,
  X,
  ExternalLink,
  AlertCircle,
  Activity,
  ThumbsUp,
} from "lucide-react"
import { toast } from "react-hot-toast"

import {
  listSupportTickets,
  updateSupportStatus,
  supportTableReady,
  buildSupportWhatsApp,
  buildSupportResolutionWhatsApp,
  resolveTicket,
  SUPPORT_CATEGORIES,
  type SupportTicket,
  type SupportStatus,
} from "./supportService"
import { formatDateTime, shortId } from "../../lib/format"
import KpiCard from "../../components/ui/KpiCard"
import Avatar from "../../components/ui/Avatar"
import { isVideoUrl } from "../../lib/media"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import PageHeader from "../../components/ui/PageHeader"
import { useLocalStorageState } from "../../lib/useLocalStorageState"

const STATUS_TABS: { id: SupportStatus | "all"; label: string }[] = [
  { id: "open", label: "Abiertas" },
  { id: "in_progress", label: "En curso" },
  { id: "resolved", label: "Resueltas" },
  { id: "all", label: "Todas" },
]

function categoryMeta(cat: string) {
  return (
    SUPPORT_CATEGORIES.find((c) => c.id === cat) ?? {
      id: cat,
      label: cat,
      emoji: "💬",
      hint: "",
    }
  )
}

function statusTone(s: SupportStatus): string {
  if (s === "resolved") return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
  if (s === "in_progress") return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30"
  return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
}

function statusLabel(s: SupportStatus): string {
  if (s === "resolved") return "Resuelta"
  if (s === "in_progress") return "En curso"
  return "Nueva"
}

export default function SupportPage() {
  const [tab, setTab] = useLocalStorageState<SupportStatus | "all">("support:tab", "open")
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [allTickets, setAllTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SupportTicket | null>(null)
  const [tableReady, setTableReady] = useState<boolean | null>(null)

  // Counts globales (para KPIs + badges en tabs)
  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, total: allTickets.length }
    allTickets.forEach((t) => {
      if (t.status === "open") c.open++
      else if (t.status === "in_progress") c.in_progress++
      else if (t.status === "resolved") c.resolved++
    })
    return c
  }, [allTickets])

  // Detectar si la tabla existe en la DB (única vez al montar)
  useEffect(() => {
    let alive = true
    supportTableReady().then((ok) => alive && setTableReady(ok))
    return () => {
      alive = false
    }
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      // Pedimos lista filtrada + global en paralelo para alimentar tabs y KPIs
      const [data, all] = await Promise.all([
        listSupportTickets({ status: tab }),
        tab === "all" ? Promise.resolve(null) : listSupportTickets({ status: "all", limit: 200 }),
      ])
      setTickets(data)
      if (all) setAllTickets(all)
      else setAllTickets(data) // si pediste "all", ya viene completo
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar las incidencias")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tableReady === false) {
      setLoading(false)
      setTickets([])
      return
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tableReady])

  const groups = useMemo(() => {
    // Agrupar por día para legibilidad
    const map = new Map<string, SupportTicket[]>()
    tickets.forEach((t) => {
      const key = new Date(t.created_at).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    })
    return Array.from(map.entries())
  }, [tickets])

  async function changeStatus(id: string, status: SupportStatus) {
    try {
      await updateSupportStatus(id, status)
      toast.success("Estatus actualizado")
      setSelected((s) => (s && s.id === id ? { ...s, status } : s))
      refresh()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar")
    }
  }

  async function handleResolve(ticket: SupportTicket, message: string) {
    try {
      await resolveTicket(ticket, message)
      toast.success(
        ticket.customer_email
          ? "Resuelta · cliente notificado"
          : "Resuelta"
      )
      setSelected((s) =>
        s && s.id === ticket.id ? { ...s, status: "resolved" } : s
      )
      refresh()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo resolver")
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-1 pb-12">
      {/* HEADER */}
      <PageHeader
        icon={LifeBuoy}
        title="Incidencias"
        subtitle="Buzón de soporte a clientes"
        right={
          <button
            onClick={refresh}
            aria-label="Refrescar"
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center press"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      {/* KPI STRIP */}
      <div className="grid grid-cols-3 gap-2 mb-3 px-1">
        <KpiCard
          label="Abiertas"
          value={counts.open}
          tone={counts.open > 0 ? "danger" : "default"}
          icon={<AlertCircle size={9} />}
        />
        <KpiCard
          label="En curso"
          value={counts.in_progress}
          tone={counts.in_progress > 0 ? "primary" : "default"}
          icon={<Activity size={9} />}
        />
        <KpiCard
          label="Resueltas"
          value={counts.resolved}
          tone="success"
          icon={<ThumbsUp size={9} />}
        />
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-2xl mb-4 border border-slate-200/60 dark:border-slate-700/60">
        {STATUS_TABS.map((t) => {
          const active = tab === t.id
          const badge =
            t.id === "open" ? counts.open :
            t.id === "in_progress" ? counts.in_progress :
            t.id === "resolved" ? counts.resolved : counts.total
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 ${
                active ? "text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="support-tab-pill"
                  className="absolute inset-0 rounded-xl shadow-bloom"
                  style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
              {badge > 0 && (
                <span
                  className={`relative z-10 min-w-4 h-4 px-1 rounded-full text-[8px] font-black tabular-nums flex items-center justify-center ${
                    active ? "bg-white/25 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* LISTA */}
      {tableReady === false ? (
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 dark:bg-amber-500/10 p-6 text-center">
          <LifeBuoy size={28} className="mx-auto mb-2 text-amber-500" />
          <p className="text-sm font-black text-amber-800 dark:text-amber-200">
            Falta correr la migración SQL
          </p>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 max-w-md mx-auto mt-1">
            Abre Supabase → SQL Editor y corre{" "}
            <code className="text-[10px] bg-white/60 dark:bg-slate-900/60 px-1.5 py-0.5 rounded">
              migration_0017_rejection_reason_and_cash_proofs.sql
            </code>{" "}
            para activar el módulo de soporte.
          </p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyStateIllustration
          variant="no-orders"
          title={tab === "open" ? "Sin incidencias abiertas" : "Sin incidencias"}
          subtitle={
            tab === "open"
              ? "Excelente: ninguna clienta está esperando una respuesta"
              : tab === "resolved"
              ? "Aquí aparecerán los casos cerrados"
              : "No hay reportes en este filtro"
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div className="sticky top-0 z-10 -mx-1 px-3 py-1.5 mb-2 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-md flex items-center gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {day}
                </p>
                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500">· {items.length}</span>
                <div className="flex-1 h-px bg-gradient-to-r from-slate-200 dark:from-slate-700 to-transparent" />
              </div>
              <div className="space-y-2">
                {items.map((t) => {
                  const meta = categoryMeta(t.category)
                  const isOpen = t.status === "open"
                  return (
                    <motion.button
                      key={t.id}
                      type="button"
                      layout
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelected(t)}
                      className="relative w-full text-left bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-primary/30 dark:hover:border-primary/40 hover:shadow-md transition-all rounded-2xl p-3 shadow-sm overflow-hidden"
                    >
                      {/* Barra lateral de color por estatus */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 ${
                          isOpen
                            ? "bg-rose-400"
                            : t.status === "in_progress"
                            ? "bg-sky-400"
                            : "bg-emerald-400"
                        }`}
                      />
                      <div className="flex items-start gap-3 pl-2">
                        <div className="relative shrink-0">
                          <Avatar name={t.customer_name || "Cliente"} size={40} />
                          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[11px]">
                            {meta.emoji}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <p className="text-sm font-black truncate text-slate-900 dark:text-slate-100">
                              {t.customer_name || "Cliente"}
                            </p>
                            <span
                              className={`text-[8px] font-black uppercase tracking-widest border px-1.5 py-0.5 rounded-full shrink-0 ${statusTone(t.status)}`}
                            >
                              {statusLabel(t.status)}
                            </span>
                          </div>
                          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                            {meta.label}
                          </p>
                          {t.description && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate italic">
                              "{t.description}"
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-400 dark:text-slate-500 font-bold flex-wrap">
                            {t.sale_id && (
                              <span className="tabular-nums">Folio {shortId(t.sale_id)}</span>
                            )}
                            {t.sale_id && <span>·</span>}
                            <span className="flex items-center gap-1">
                              {t.image_url ? (
                                <>
                                  <ImageIcon size={9} className="text-emerald-500" />{" "}
                                  {isVideoUrl(t.image_url) ? "con video" : "con foto"}
                                </>
                              ) : (
                                <>
                                  <ImageOff size={9} /> sin foto
                                </>
                              )}
                            </span>
                            <span>·</span>
                            <span>{formatDateTime(t.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DRAWER */}
      <TicketDrawer
        ticket={selected}
        onClose={() => setSelected(null)}
        onStatus={changeStatus}
        onResolve={handleResolve}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────
 * DRAWER de evidencia
 * ───────────────────────────────────────────────────── */
function TicketDrawer({
  ticket,
  onClose,
  onStatus,
  onResolve,
}: {
  ticket: SupportTicket | null
  onClose: () => void
  onStatus: (id: string, status: SupportStatus) => void
  onResolve: (ticket: SupportTicket, message: string) => void | Promise<void>
}) {
  const [resolveMessage, setResolveMessage] = useState("")

  useEffect(() => {
    setResolveMessage("")
  }, [ticket?.id])
  // Bloquear scroll body
  useEffect(() => {
    if (!ticket) return
    const o = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = o
    }
  }, [ticket])

  useEffect(() => {
    if (!ticket) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [ticket, onClose])

  const meta = ticket ? categoryMeta(ticket.category) : null
  const waHref = ticket ? buildSupportWhatsApp(ticket) : ""

  return (
    <AnimatePresence>
      {ticket && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex justify-end"
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.35)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-2xl shrink-0">
                  {meta?.emoji}
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                    Reporte de soporte
                  </p>
                  <p className="text-sm font-black truncate">{meta?.label}</p>
                  <p className="text-[10px] text-slate-500 font-bold">
                    {formatDateTime(ticket.created_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scroll-container-ios">
              {/* Cliente */}
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Cliente
                </p>
                <p className="text-sm font-black">
                  {ticket.customer_name || "Cliente sin nombre"}
                </p>
                {ticket.sale_id && (
                  <p className="text-[10px] text-slate-500 font-bold tabular-nums">
                    Folio: {shortId(ticket.sale_id)}
                  </p>
                )}
                <div className="flex flex-col gap-1 text-[11px]">
                  {ticket.customer_phone && (
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-bold">
                      <Phone size={11} /> {ticket.customer_phone}
                    </span>
                  )}
                  {ticket.customer_email && (
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-bold truncate">
                      <Mail size={11} /> {ticket.customer_email}
                    </span>
                  )}
                </div>
              </div>

              {/* Descripción */}
              {ticket.description && (
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-3 border border-slate-100 dark:border-slate-700">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Descripción
                  </p>
                  <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                    "{ticket.description}"
                  </p>
                </div>
              )}

              {/* Foto */}
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                  <ImageIcon size={11} /> Evidencia
                </p>
                {ticket.image_url ? (
                  <a
                    href={ticket.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 relative group"
                  >
                    {isVideoUrl(ticket.image_url) ? (
                      <video
                        src={ticket.image_url}
                        className="w-full max-h-72 object-cover"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={ticket.image_url}
                        alt="Evidencia"
                        className="w-full max-h-72 object-cover"
                        loading="lazy"
                      />
                    )}
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur text-white text-[9px] font-black uppercase flex items-center gap-1">
                      <ExternalLink size={9} /> Abrir
                    </span>
                  </a>
                ) : (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-10 text-center text-slate-400">
                    <ImageOff size={22} className="mx-auto mb-1" />
                    <p className="text-[11px] font-bold">Sin foto adjunta</p>
                  </div>
                )}
              </div>

              {/* Estatus actual */}
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest border px-2 py-1 rounded-full ${statusTone(ticket.status)}`}
                >
                  {ticket.status === "open" && "Nueva"}
                  {ticket.status === "in_progress" && "En curso"}
                  {ticket.status === "resolved" && "Resuelta"}
                </span>
              </div>
            </div>

            {/* Footer acciones */}
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 space-y-2">
              {/* Campo de respuesta (visible mientras NO está resuelta) */}
              {ticket.status !== "resolved" && (
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    Respuesta para el cliente (opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={resolveMessage}
                    onChange={(e) => setResolveMessage(e.target.value)}
                    placeholder="Ej. Te enviamos pieza de reemplazo, llega el jueves."
                    className="field-input h-auto py-2 text-[11px] resize-none"
                  />
                </div>
              )}

              {/* CTA principal (abrir caso por WA) */}
              {ticket.customer_phone ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 shadow-bloom active:scale-[0.98] transition-transform"
                  style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}
                  onClick={() => {
                    // Marcamos en curso al abrir WA
                    if (ticket.status === "open") onStatus(ticket.id, "in_progress")
                  }}
                >
                  <MessageCircle size={16} />
                  Abrir caso por WhatsApp
                </a>
              ) : (
                <p className="text-[10px] text-center text-slate-400 italic">
                  Sin teléfono del cliente registrado
                </p>
              )}

              {/* Cambios de estatus rápidos */}
              <div className="grid grid-cols-2 gap-2">
                {ticket.status !== "in_progress" && ticket.status !== "resolved" && (
                  <button
                    type="button"
                    onClick={() => onStatus(ticket.id, "in_progress")}
                    className="h-10 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/40 dark:text-sky-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    <Clock size={11} /> Marcar en curso
                  </button>
                )}
                {ticket.status !== "resolved" && (
                  <button
                    type="button"
                    onClick={() => onResolve(ticket, resolveMessage)}
                    className="h-10 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-[0_10px_30px_-8px_rgba(16,185,129,0.5)] active:scale-95"
                  >
                    <CheckCircle2 size={11} /> Resolver y notificar
                  </button>
                )}
                {ticket.customer_phone && resolveMessage.trim().length > 0 && ticket.status !== "resolved" && (
                  <a
                    href={buildSupportResolutionWhatsApp(ticket, resolveMessage)}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-2 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/40 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle size={11} /> Enviar resolución por WhatsApp
                  </a>
                )}
                {ticket.status === "resolved" && (
                  <button
                    type="button"
                    onClick={() => onStatus(ticket.id, "open")}
                    className="col-span-2 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                  >
                    Reabrir incidencia
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

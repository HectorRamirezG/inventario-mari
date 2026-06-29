import { useEffect, useState, useMemo, useRef } from "react"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
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
  SUPPORT_QUICK_REPLIES,
  fillQuickReply,
  type SupportTicket,
  type SupportStatus,
} from "./supportService"
import { formatDateTime, shortId } from "../../lib/format"
import KpiCard from "../../components/ui/KpiCard"
import Avatar from "../../components/ui/Avatar"
import { isVideoUrl } from "../../lib/media"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import PageHeader from "../../components/ui/PageHeader"
import TabBar, { type TabItem } from "../../components/ui/TabBar"
import { useLocalStorageState } from "../../lib/useLocalStorageState"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import { promptDialog } from "../../lib/prompt"
import { confirmAction } from "../../lib/confirm"

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

  // Escuchar notificación "abrir ticket específico" → encuentra el
  // ticket por id en `allTickets` y abre el drawer. Si todavía no llegó
  // del fetch inicial, guarda el id pendiente y abre cuando llegue.
  const pendingTicketIdRef = useRef<string | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      const ticketId = (e as CustomEvent).detail?.ticketId as string | undefined
      if (!ticketId) return
      const t = allTickets.find((x) => x.id === ticketId)
      if (t) {
        setSelected(t)
      } else {
        pendingTicketIdRef.current = ticketId
      }
    }
    window.addEventListener("support:open-ticket", handler)
    return () => window.removeEventListener("support:open-ticket", handler)
  }, [allTickets])

  // Cuando allTickets se refresca, si hay un ticket pendiente lo abrimos
  useEffect(() => {
    const id = pendingTicketIdRef.current
    if (!id) return
    const t = allTickets.find((x) => x.id === id)
    if (t) {
      setSelected(t)
      pendingTicketIdRef.current = null
    }
  }, [allTickets])

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
    // Optimistic: actualizamos ambas listas YA. Si la BD truena, revertimos.
    const snapshot = { tickets, allTickets }
    const applyLocal = (arr: SupportTicket[]) =>
      arr.map((t) => (t.id === id ? { ...t, status } : t))
    setTickets((prev) => applyLocal(prev))
    setAllTickets((prev) => applyLocal(prev))
    setSelected((s) => (s && s.id === id ? { ...s, status } : s))
    try {
      await updateSupportStatus(id, status)
    } catch (e: any) {
      setTickets(snapshot.tickets)
      setAllTickets(snapshot.allTickets)
      toast.error(e?.message ?? "No se pudo actualizar")
    }
  }

  async function handleQuickResolve(t: SupportTicket) {
    // Confirmación + mensaje opcional para el cliente. NO abre el drawer.
    const ok = await confirmAction({
      title: "¿Marcar como resuelta?",
      description: t.customer_email
        ? "Le mandaremos una notificación al cliente con tu mensaje (opcional)."
        : "Sin email del cliente no podemos notificarlo, pero el ticket queda cerrado.",
      confirmLabel: "Sí, cerrar",
      tone: "success",
    })
    if (!ok) return
    const msg =
      (await promptDialog({
        title: "Mensaje para el cliente (opcional)",
        placeholder: "Ej. Listo, ya quedo resuelto. ¡Gracias por avisar!",
        confirmLabel: "Cerrar ticket",
        cancelLabel: "Sin mensaje",
        multiline: true,
        maxLength: 280,
      })) ?? ""
    await handleResolve(t, msg)
  }

  async function handleResolve(ticket: SupportTicket, message: string) {
    // Optimistic: marcamos resuelta YA. Si la BD truena, revertimos.
    const snapshot = { tickets, allTickets }
    const apply = (arr: SupportTicket[]) =>
      arr.map((t) => (t.id === ticket.id ? { ...t, status: "resolved" as SupportStatus } : t))
    setTickets((prev) => apply(prev))
    setAllTickets((prev) => apply(prev))
    setSelected((s) =>
      s && s.id === ticket.id ? { ...s, status: "resolved" } : s,
    )
    try {
      await resolveTicket(ticket, message)
      toast.success(
        ticket.customer_email ? "Resuelta · cliente notificado" : "Resuelta",
      )
    } catch (e: any) {
      setTickets(snapshot.tickets)
      setAllTickets(snapshot.allTickets)
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

      {/* TABS unificados */}
      <div className="mb-4">
        <TabBar
          tabs={STATUS_TABS.map<TabItem<SupportStatus | "all">>((t) => ({
            id: t.id,
            label: t.label,
            badge:
              t.id === "open" ? counts.open :
              t.id === "in_progress" ? counts.in_progress :
              t.id === "resolved" ? counts.resolved : counts.total,
          }))}
          active={tab}
          onChange={setTab}
          layoutId="support-tab-pill"
        />
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
                <AnimatePresence initial={false}>
                  {items.map((t) => {
                    const meta = categoryMeta(t.category)
                    const isOpen = t.status === "open"
                    const isResolved = t.status === "resolved"
                    return (
                      <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -120, scale: 0.96, height: 0, marginTop: 0 }}
                        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => setSelected(t)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelected(t)
                        }}
                      drag={!isResolved ? "x" : false}
                      dragConstraints={{ left: -200, right: 0 }}
                      dragElastic={{ left: 0.3, right: 0 }}
                      onDragEnd={(_e, info: PanInfo) => {
                        if (info.offset.x < -100 || info.velocity.x < -500) {
                          handleQuickResolve(t)
                        }
                      }}
                      className="relative w-full text-left bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-primary/30 dark:hover:border-primary/40 hover:shadow-md transition-all rounded-2xl p-3 shadow-sm overflow-hidden cursor-pointer touch-pan-y"
                    >
                      {/* Hint visual del swipe-to-resolve: chip flotante al
                          lado derecho que aparece cuando se está arrastrando. */}
                      {!isResolved && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[8px] font-black uppercase tracking-widest pointer-events-none opacity-0 transition-opacity">
                          Swipe = Resolver
                        </span>
                      )}
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

                      {/* Acciones rápidas inline (no abren el drawer). Solo
                          aparecen si el ticket NO está resuelto. */}
                      {!isResolved && (
                        <div
                          className="flex items-center gap-1.5 mt-2 pl-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isOpen && (
                            <button
                              type="button"
                              onClick={() => changeStatus(t.id, "in_progress")}
                              className="h-7 px-2.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-200 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 press"
                              title="Marcar en curso (yo me hago cargo)"
                            >
                              <Activity size={10} /> Tomar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleQuickResolve(t)}
                            className="h-7 px-2.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-200 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 press"
                            title="Cerrar el ticket directamente"
                          >
                            <CheckCircle2 size={10} /> Resolver
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )
                  })}
                </AnimatePresence>
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
  // Bloquear scroll body (centralizado)
  useBodyScrollLock(!!ticket)

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
            className="absolute inset-0 bg-slate-950/70"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
                  {/* Quick replies: contextual a la categoría + universales al final */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scroll-container-ios">
                    {SUPPORT_QUICK_REPLIES.filter(
                      (q) => !q.category || q.category === ticket.category,
                    ).map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() =>
                          setResolveMessage(fillQuickReply(q.body, ticket))
                        }
                        className="shrink-0 h-7 px-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary press"
                        title={q.body}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
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

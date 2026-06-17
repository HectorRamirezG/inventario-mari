import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, PanInfo } from "framer-motion"
import {
  X,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageCircle,
  ArrowRight,
  Sparkles,
  Share2,
  Copy,
  ExternalLink,
  Receipt as ReceiptIcon,
  Wallet,
  History as HistoryIcon,
  Loader2,
  AlertCircle,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDateTime, shortId, formatRelative } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { useAuth } from "../../lib/useAuth"
import Skeleton, { SkeletonText } from "./Skeleton"
import ReportPaymentButton, { ProofsHistory } from "./ReportPaymentButton"
import {
  listProofsForSale,
  type PaymentProof,
} from "../../features/payments/paymentProofsService"

interface TicketItem {
  id: string
  product_name: string
  variant_name: string | null
  qty: number
  unit_price: number
  tier: string
}

interface PublicTicket {
  id: string
  public_token: string
  customer_name: string | null
  customer_phone: string | null
  customer_avatar?: string | null
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  payment_url: string | null
  notes: string | null
  adjustment_amount?: number | null
  adjustment_reason?: string | null
  shipping_amount?: number | null
  is_foreign_shipping?: boolean | null
  created_at: string
  items: TicketItem[]
  payments: { amount: number; method: string | null; created_at: string }[]
}

interface Props {
  open: boolean
  token: string | null
  onClose: () => void
}

type TabId = "summary" | "pay" | "history"

/**
 * TicketDrawer — Vista in-app del ticket público. Cortina inferior con
 * drag-to-dismiss y TABS INTERNAS para no scrollear infinito:
 *   - Resumen: meta, productos, totales, estado
 *   - Pagar: opciones de pago (sólo si hay balance)
 *   - Historial: comprobantes enviados
 *
 * Para compartir por WhatsApp seguimos usando la ruta pública
 * `/ticket/:token` (link permanente, sin sesión).
 */
export default function TicketDrawer({ open, token, onClose }: Props) {
  const [ticket, setTicket] = useState<PublicTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>("summary")
  const [proofs, setProofs] = useState<PaymentProof[]>([])
  const [loadingProofs, setLoadingProofs] = useState(false)
  const { email: authEmail } = useAuth()
  const store = getStoreInfo()

  // Carga el ticket
  useEffect(() => {
    if (!open || !token) return
    let alive = true
    setLoading(true)
    setError(null)
    setTicket(null)
    setTab("summary")
    ;(async () => {
      const { data, error } = await supabase.rpc("get_public_ticket", {
        p_token: token,
      })
      if (!alive) return
      if (error) {
        setError(error.message)
      } else if (!data) {
        setError("Ticket no encontrado")
      } else {
        const raw = data as any
        const flat: any = raw?.sale ? { ...raw.sale } : { ...raw }
        flat.items = raw?.items ?? raw?.sale?.items ?? flat.items ?? []
        flat.payments = raw?.payments ?? raw?.sale?.payments ?? flat.payments ?? []
        if (!flat.id) setError("Ticket inválido")
        else setTicket(flat as PublicTicket)
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [open, token])

  // Carga proofs cuando hay ticket
  useEffect(() => {
    if (!ticket?.id) {
      setProofs([])
      return
    }
    let alive = true
    setLoadingProofs(true)
    listProofsForSale(ticket.id)
      .then((list) => alive && setProofs(list))
      .catch(() => alive && setProofs([]))
      .finally(() => alive && setLoadingProofs(false))
    return () => {
      alive = false
    }
  }, [ticket?.id])

  // Bloquear scroll del body
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  async function copyLink() {
    if (!ticket) return
    const url = `${window.location.origin}/ticket/${ticket.public_token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado")
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  async function shareNative() {
    if (!ticket) return
    const url = `${window.location.origin}/ticket/${ticket.public_token}`
    const text = `Mi ticket en ${store.name} · Total ${formatMoney(ticket.total)}`
    if (navigator.share) {
      try {
        await navigator.share({ title: "Ticket Mari", text, url })
      } catch {
        /* user cancelled */
      }
    } else {
      copyLink()
    }
  }

  if (typeof document === "undefined") return null

  const pct =
    ticket && ticket.total > 0
      ? Math.min(100, (ticket.paid / ticket.total) * 100)
      : 0
  const isPaid = ticket ? ticket.balance <= 0 : false

  // Banner del estado más reciente de proofs (para mostrar en cualquier tab)
  const lastProof = useMemo(() => {
    const pending = proofs.find((p) => {
      const s = String(p.status)
      return s === "pending" || s === "pending_verification"
    })
    if (pending) return { proof: pending, kind: "pending" as const }
    const approved = proofs.find((p) => p.status === "approved")
    if (approved) return { proof: approved, kind: "approved" as const }
    const rejected = proofs.find((p) => p.status === "rejected")
    if (rejected) return { proof: rejected, kind: "rejected" as const }
    return null
  }, [proofs])

  // Cuenta de comprobantes para mostrar badge en tab
  const proofsCount = proofs.length

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end justify-center"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[92vh] flex flex-col touch-pan-y"
          >
            {/* Handle drag */}
            <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shadow-bloom shrink-0"
                  style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
                >
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                    Ticket digital
                  </p>
                  <p className="text-sm font-black truncate text-slate-900 dark:text-slate-100">
                    {ticket ? shortId(ticket.id) : "Cargando..."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 press"
              >
                <X size={14} />
              </button>
            </div>

            {/* Loading / error */}
            {loading && (
              <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios">
                <TicketSkeleton />
              </div>
            )}
            {error && !loading && (
              <div className="flex-1 px-5 pb-6 flex flex-col items-center justify-center text-center">
                <AlertCircle size={32} className="text-rose-500 mb-2" />
                <p className="text-sm font-bold text-rose-600 mb-1">{error}</p>
                <p className="text-[10px] text-slate-400">
                  Cierra y vuelve a intentar.
                </p>
              </div>
            )}

            {!loading && !error && ticket && (
              <>
                {/* Resumen sticky con estado + total */}
                <div className="px-5 pb-2 shrink-0">
                  <div
                    className={`relative rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 ${
                      isPaid
                        ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30"
                        : "bg-gradient-to-br from-amber-50 to-rose-50/40 dark:from-amber-500/10 dark:to-rose-500/5 border border-amber-200/70 dark:border-amber-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isPaid
                            ? "bg-emerald-500 text-white"
                            : "bg-amber-500 text-white"
                        }`}
                      >
                        {isPaid ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-[10px] font-black uppercase tracking-widest leading-none ${
                            isPaid
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {isPaid ? "Pagado" : "Pendiente"}
                        </p>
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                          {isPaid
                            ? `Pagaste ${formatMoney(ticket.paid)}`
                            : `Falta ${formatMoney(ticket.balance)} de ${formatMoney(ticket.total)}`}
                        </p>
                      </div>
                    </div>
                    {!isPaid && (
                      <div className="shrink-0 text-right">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                          Progreso
                        </p>
                        <p className="text-sm font-black text-primary tabular-nums leading-none">
                          {pct.toFixed(0)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* TABS internas */}
                <div className="px-5 pb-2 shrink-0">
                  <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                    <InnerTab
                      active={tab === "summary"}
                      onClick={() => setTab("summary")}
                      icon={<ReceiptIcon size={11} />}
                      label="Resumen"
                    />
                    {!isPaid && (
                      <InnerTab
                        active={tab === "pay"}
                        onClick={() => setTab("pay")}
                        icon={<Wallet size={11} />}
                        label="Pagar"
                        highlight={!proofs.length}
                      />
                    )}
                    <InnerTab
                      active={tab === "history"}
                      onClick={() => setTab("history")}
                      icon={<HistoryIcon size={11} />}
                      label="Historial"
                      badge={proofsCount > 0 ? proofsCount : undefined}
                    />
                  </div>
                </div>

                {/* Contenido por tab */}
                <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios">
                  <AnimatePresence mode="wait">
                    {tab === "summary" && (
                      <motion.div
                        key="summary"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4 pt-2"
                      >
                        <SummaryTab
                          ticket={ticket}
                          isPaid={isPaid}
                          store={store}
                          onShare={shareNative}
                          onCopy={copyLink}
                        />
                      </motion.div>
                    )}

                    {tab === "pay" && !isPaid && (
                      <motion.div
                        key="pay"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4 pt-2"
                      >
                        {/* Banner del último proof (siempre visible aquí) */}
                        {lastProof && <ProofStatusBanner data={lastProof} />}

                        {/* CTA pagar online */}
                        {ticket.payment_url && (
                          <a
                            href={ticket.payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 h-12 rounded-2xl font-black text-white text-sm shadow-bloom press-hard"
                            style={{
                              background:
                                "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)",
                            }}
                          >
                            <CreditCard size={16} />
                            Pagar saldo en línea
                            <ArrowRight size={14} />
                          </a>
                        )}

                        {/* Componente de reportar — compact: sin banners propios ni historial duplicado */}
                        <ReportPaymentButton
                          saleId={ticket.id}
                          balance={Number(ticket.balance) || 0}
                          customerEmail={authEmail ?? null}
                          compact
                          onUploaded={() => {
                            // Tras subir, salta a Historial
                            setTab("history")
                            listProofsForSale(ticket.id)
                              .then(setProofs)
                              .catch(() => {})
                          }}
                        />
                      </motion.div>
                    )}

                    {tab === "history" && (
                      <motion.div
                        key="history"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4 pt-2"
                      >
                        <HistoryTab
                          payments={ticket.payments}
                          proofs={proofs}
                          loadingProofs={loadingProofs}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer fijo con WhatsApp + acciones secundarias */}
                <div className="shrink-0 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  {store.phone && (
                    <a
                      href={`https://wa.me/${store.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Hola, sobre mi ticket ${shortId(ticket.id)}...`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-500 text-white font-black text-[11px] uppercase tracking-widest press"
                    >
                      <MessageCircle size={13} />
                      Contactar a la tienda
                    </a>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={shareNative}
                      className="flex-1 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
                    >
                      <Share2 size={11} /> Compartir
                    </button>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="flex-1 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
                    >
                      <Copy size={11} /> Link
                    </button>
                    <a
                      href={`/ticket/${ticket.public_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
                    >
                      <ExternalLink size={11} /> Abrir
                    </a>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ────────────────────────────────────────────────────────
 * Pestaña: Resumen
 * ──────────────────────────────────────────────────────── */
function SummaryTab({
  ticket,
  isPaid,
  store,
  onShare,
  onCopy,
}: {
  ticket: PublicTicket
  isPaid: boolean
  store: ReturnType<typeof getStoreInfo>
  onShare: () => void
  onCopy: () => void
}) {
  // Suprimimos lint — props que pasamos pero no usamos directo aquí
  void onShare
  void onCopy

  const subtotal = ticket.items.reduce(
    (a, it) => a + Number(it.qty) * Number(it.unit_price),
    0,
  )
  const adj = Number(ticket.adjustment_amount) || 0
  const ship = Number(ticket.shipping_amount) || 0
  const isForeign = !!ticket.is_foreign_shipping

  return (
    <>
      {/* Meta */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-widest text-slate-400">Fecha</p>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {formatDateTime(ticket.created_at)}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest text-slate-400">Cliente</p>
          <p className="text-xs font-bold truncate text-slate-700 dark:text-slate-200">
            {ticket.customer_name ?? "—"}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {ticket.items.map((it) => (
          <div key={it.id} className="py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight truncate text-slate-800 dark:text-slate-100">
                {it.product_name}
              </p>
              {it.variant_name && (
                <p className="text-xs text-slate-500 truncate">{it.variant_name}</p>
              )}
              <p className="text-[10px] text-slate-400 mt-0.5">
                {it.qty} × {formatMoney(it.unit_price)}
              </p>
            </div>
            <p className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">
              {formatMoney(it.qty * it.unit_price)}
            </p>
          </div>
        ))}
      </div>

      {/* Totales */}
      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-1.5">
        <Row label="Subtotal" value={formatMoney(subtotal)} />
        {(isForeign || ship > 0) && (
          <Row
            label={isForeign ? "Envío foráneo" : "Envío"}
            value={ship > 0 ? formatMoney(ship) : "¡Gratis! 🎉"}
            success={ship === 0 && isForeign}
          />
        )}
        {adj > 0 && (
          <Row
            label={ticket.adjustment_reason || "Descuento Mari"}
            value={`- ${formatMoney(adj)}`}
            discount
          />
        )}
        {adj < 0 && (
          <Row
            label={ticket.adjustment_reason || "Cargo extra"}
            value={`+ ${formatMoney(Math.abs(adj))}`}
          />
        )}
        <Row label="Total" value={formatMoney(ticket.total)} bold />
        {ticket.paid > 0 && (
          <Row label="Pagado" value={formatMoney(ticket.paid)} success />
        )}
        {ticket.balance > 0 && (
          <Row label="Pendiente" value={formatMoney(ticket.balance)} danger bold />
        )}
      </div>

      {/* Festivo descuento manual */}
      {adj > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 text-emerald-700 dark:text-emerald-300"
        >
          <span className="text-base" aria-hidden>
            🎉
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest leading-tight">
              ¡Se aplicó un descuento manual!
            </p>
            <p className="text-[10px] font-bold leading-tight opacity-80">
              Mari te apoyó con {formatMoney(adj)} ✨
            </p>
          </div>
        </motion.div>
      )}

      {/* Estado banner secundario */}
      {!isPaid && (
        <p className="text-center text-[10px] font-bold text-slate-400 italic">
          Ve a la pestaña <span className="text-primary">Pagar</span> para
          enviar tu comprobante.
        </p>
      )}

      <p className="text-center text-[10px] uppercase tracking-widest text-slate-400 pt-1">
        {store.thanks_message ?? "Gracias por tu compra ✨"}
      </p>
    </>
  )
}

/* ────────────────────────────────────────────────────────
 * Pestaña: Historial
 * Combina pagos confirmados + comprobantes enviados.
 * ──────────────────────────────────────────────────────── */
function HistoryTab({
  payments,
  proofs,
  loadingProofs,
}: {
  payments: PublicTicket["payments"]
  proofs: PaymentProof[]
  loadingProofs: boolean
}) {
  const hasPayments = payments.length > 0
  const hasProofs = proofs.length > 0
  if (!hasPayments && !hasProofs && !loadingProofs) {
    return (
      <div className="py-10 text-center">
        <HistoryIcon size={28} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm font-black text-slate-500 dark:text-slate-400">
          Sin movimientos aún
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          Cuando envíes un comprobante o se confirme un pago, aparecerá aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Pagos confirmados — la fuente de verdad */}
      {hasPayments && (
        <section>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <CheckCircle2 size={11} className="text-emerald-500" />
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Pagos confirmados ({payments.length})
            </p>
          </div>
          <div className="relative pl-3 border-l-2 border-emerald-200 dark:border-emerald-500/30 space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-[15px] top-2 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-500/20" />
                <div className="flex items-center justify-between gap-3 bg-emerald-50/70 dark:bg-emerald-500/10 rounded-xl px-3 py-2 border border-emerald-100 dark:border-emerald-500/30">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                      {p.method ?? "Pago"}
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">
                      {formatRelative(p.created_at)} · {formatDateTime(p.created_at)}
                    </p>
                  </div>
                  <p className="text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300 shrink-0">
                    +{formatMoney(p.amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comprobantes enviados (pueden estar pendientes/rechazados/aprobados) */}
      {hasProofs && (
        <section>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <ReceiptIcon size={11} className="text-amber-500" />
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Comprobantes enviados ({proofs.length})
            </p>
          </div>
          <ProofsHistory items={proofs} loading={loadingProofs} />
        </section>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────
 * Banner del estado del último proof (en tab Pagar)
 * ──────────────────────────────────────────────────────── */
function ProofStatusBanner({
  data,
}: {
  data: { proof: PaymentProof; kind: "pending" | "approved" | "rejected" }
}) {
  const { proof, kind } = data
  const cfg = {
    pending: {
      cls: "border-amber-300 dark:border-amber-500/40 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-500/15 dark:to-yellow-500/15 text-amber-800 dark:text-amber-200",
      iconCls: "bg-amber-400 text-white",
      icon: <Loader2 size={14} className="animate-spin" />,
      title:
        proof.method === "efectivo"
          ? "Pago en efectivo · esperando confirmación"
          : "Comprobante enviado · Mari lo está validando",
      sub:
        proof.amount && proof.amount > 0
          ? `Monto: ${formatMoney(Number(proof.amount))}`
          : "Recibirás una notificación cuando se apruebe",
    },
    approved: {
      cls: "border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
      iconCls: "bg-emerald-500 text-white",
      icon: <CheckCircle2 size={14} />,
      title: "Pago aprobado por Mari",
      sub: `${formatMoney(Number(proof.amount) || 0)} · ${proof.method ?? "—"}`,
    },
    rejected: {
      cls: "border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200",
      iconCls: "bg-rose-500 text-white",
      icon: <AlertCircle size={14} />,
      title: "Tu pago anterior fue rechazado",
      sub:
        proof.rejection_reason ||
        "Vuelve a enviar el comprobante o cambia el método",
    },
  }[kind]

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 p-3 flex items-start gap-2.5 ${cfg.cls}`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-bloom ${cfg.iconCls}`}
      >
        {cfg.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black leading-tight">{cfg.title}</p>
        <p className="text-[10px] font-bold opacity-80 leading-snug mt-0.5">
          {cfg.sub}
        </p>
      </div>
    </motion.div>
  )
}

/* ────────────────────────────────────────────────────────
 * Sub-componentes UI
 * ──────────────────────────────────────────────────────── */
function InnerTab({
  active,
  onClick,
  icon,
  label,
  badge,
  highlight,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 ${
        active
          ? "text-white"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {active && (
        <motion.span
          layoutId="ticket-tab-pill"
          className="absolute inset-0 rounded-xl shadow-bloom"
          style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-1.5">
        {icon}
        {label}
        {badge != null && badge > 0 && (
          <span
            className={`min-w-4 h-4 px-1 rounded-full text-[8px] font-black tabular-nums flex items-center justify-center ${
              active
                ? "bg-white/25 text-white"
                : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            }`}
          >
            {badge}
          </span>
        )}
        {highlight && !active && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
        )}
      </span>
    </button>
  )
}

function Row({
  label,
  value,
  bold,
  success,
  danger,
  discount,
}: {
  label: string
  value: string
  bold?: boolean
  success?: boolean
  danger?: boolean
  discount?: boolean
}) {
  return (
    <div className="flex justify-between text-sm">
      <span
        className={
          bold
            ? "font-bold text-slate-700 dark:text-slate-200"
            : "text-slate-500 dark:text-slate-400"
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          bold ? "font-black text-slate-900 dark:text-slate-100" : "font-bold"
        } ${success ? "text-emerald-600 dark:text-emerald-400" : ""} ${
          danger ? "text-rose-600 dark:text-rose-400" : ""
        } ${discount ? "text-rose-600 dark:text-rose-400" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

function TicketSkeleton() {
  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Skeleton className="h-2 w-12" rounded="full" />
          <Skeleton className="h-4 w-24" rounded="md" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-2 w-12" rounded="full" />
          <Skeleton className="h-4 w-28" rounded="md" />
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1">
              <SkeletonText lines={2} />
            </div>
            <Skeleton className="h-4 w-16" rounded="md" />
          </div>
        ))}
      </div>
      <Skeleton className="h-20 w-full" rounded="xl" />
      <Skeleton className="h-12 w-full" rounded="xl" />
    </div>
  )
}

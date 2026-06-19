import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import {
  X,
  Wallet,
  History as HistoryIcon,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  CreditCard,
  ArrowRight,
  ShieldCheck,
  Receipt as ReceiptIcon,
} from "lucide-react"

import { formatMoney, formatRelative, shortId } from "../../lib/format"
import { useAuth } from "../../lib/useAuth"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import {
  listProofsForSale,
  type PaymentProof,
} from "../../features/payments/paymentProofsService"
import ReportPaymentButton, { ProofsHistory } from "./ReportPaymentButton"

interface Props {
  open: boolean
  /** Datos mínimos de la venta para el centro de pagos. */
  sale: {
    id: string
    total: number
    paid: number
    balance: number
    payment_url?: string | null
    payments?: {
      amount: number
      method: string | null
      created_at: string
    }[]
  } | null
  onClose: () => void
}

type TabId = "send" | "history"

/**
 * Centro de Pago — pantalla DEDICADA solo para flujo de pago.
 * Antes vivía mezclado dentro del TicketDrawer y saturaba el ticket.
 *
 * Tabs:
 *   - Enviar: CTA pagar online + reporte de comprobante + estado pendiente
 *   - Historial: pagos confirmados + comprobantes enviados (pendientes,
 *     aprobados, rechazados)
 *
 * Header con resumen visual del saldo y % de progreso.
 */
export default function PaymentCenterDrawer({ open, sale, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("send")
  const [proofs, setProofs] = useState<PaymentProof[]>([])
  const [loadingProofs, setLoadingProofs] = useState(false)
  const { email: authEmail } = useAuth()

  // Reset tab al abrir / cambiar de venta
  useEffect(() => {
    if (open) setTab("send")
  }, [open, sale?.id])

  // Cargar comprobantes
  useEffect(() => {
    if (!sale?.id || !open) {
      setProofs([])
      return
    }
    let alive = true
    setLoadingProofs(true)
    listProofsForSale(sale.id)
      .then((list) => alive && setProofs(list))
      .catch(() => alive && setProofs([]))
      .finally(() => alive && setLoadingProofs(false))
    return () => {
      alive = false
    }
  }, [sale?.id, open])

  // Bloquear scroll body
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

  // Banner del estado más reciente
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

  if (typeof document === "undefined" || !sale) return null

  // Defensa contra balance desincronizado: si el ajuste/cambio de tier
  // dejó `balance` viejo, lo recalculamos en vivo desde total y paid.
  const safeTotal = Number(sale.total) || 0
  const safePaid = Number(sale.paid) || 0
  const safeBalance = Math.max(0, safeTotal - safePaid)
  const isPaid = safeBalance <= 0
  const pct =
    safeTotal > 0 ? Math.min(100, (safePaid / safeTotal) * 100) : 0
  const payments = sale.payments ?? []
  const proofsCount = proofs.length

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={OVERLAY_BACKDROP_TRANSITION}
          className="fixed inset-0 z-[210] flex items-end justify-center"
          style={{ isolation: "isolate" }}
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/70 z-0"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={OVERLAY_PANEL_TRANSITION}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[92vh] flex flex-col touch-pan-y"
            style={OVERLAY_PANEL_STYLE}
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
                  style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
                >
                  <Wallet size={14} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                    Centro de pago
                  </p>
                  <p className="text-sm font-black truncate text-slate-900 dark:text-slate-100">
                    Pedido {shortId(sale.id)}
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

            {/* Resumen del saldo (sticky arriba) */}
            <div className="px-5 pb-3 shrink-0">
              <div
                className={`relative rounded-2xl p-4 overflow-hidden ${
                  isPaid
                    ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/15 dark:to-teal-500/10 border border-emerald-200 dark:border-emerald-500/30"
                    : "bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 dark:from-rose-500/10 dark:via-pink-500/10 dark:to-purple-500/10 border border-pink-200 dark:border-pink-500/30"
                }`}
              >
                {/* Decoración */}
                <div
                  className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-20"
                  style={{
                    background: isPaid
                      ? "linear-gradient(135deg,#10b981,#34d399)"
                      : "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                  }}
                />
                <div className="relative">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    {isPaid ? "Saldo pagado" : "Saldo pendiente"}
                  </p>
                  <p
                    className={`text-3xl font-black tabular-nums leading-tight mt-0.5 ${
                      isPaid
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-primary"
                    }`}
                  >
                    {formatMoney(isPaid ? safePaid : safeBalance)}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">
                    {isPaid
                      ? `Total cobrado: ${formatMoney(safePaid)}`
                      : `de ${formatMoney(safeTotal)} totales`}
                  </p>

                  {!isPaid && (
                    <>
                      <div className="mt-3 h-2 bg-white/60 dark:bg-slate-900/40 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{
                            background:
                              "linear-gradient(90deg, var(--brand-from), var(--brand-to))",
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1 text-[10px]">
                        <span className="font-bold text-slate-500 dark:text-slate-400">
                          {pct.toFixed(0)}% pagado
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {formatMoney(sale.paid)} ya cobrado
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Si ya está pagado, mensaje de gracias en lugar de tabs */}
            {isPaid ? (
              <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-200 dark:border-emerald-500/30 p-6 text-center"
                >
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-bloom">
                    <CheckCircle2 size={28} />
                  </div>
                  <p className="text-base font-black text-emerald-700 dark:text-emerald-300">
                    ¡Pago completo!
                  </p>
                  <p className="text-[12px] text-emerald-600/80 dark:text-emerald-300/80 mt-1">
                    Gracias por confiar en Beauty's Me ✨
                  </p>
                </motion.div>

                {/* Historial igual visible para que sepa qué pagó */}
                {(payments.length > 0 || proofs.length > 0) && (
                  <div className="mt-5">
                    <HistoryContent
                      payments={payments}
                      proofs={proofs}
                      loadingProofs={loadingProofs}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* TABS */}
                <div className="px-5 pb-2 shrink-0">
                  <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                    <InnerTab
                      active={tab === "send"}
                      onClick={() => setTab("send")}
                      icon={<Wallet size={11} />}
                      label="Enviar pago"
                      highlight={!proofs.length}
                    />
                    <InnerTab
                      active={tab === "history"}
                      onClick={() => setTab("history")}
                      icon={<HistoryIcon size={11} />}
                      label="Historial"
                      badge={proofsCount + payments.length || undefined}
                    />
                  </div>
                </div>

                {/* Contenido */}
                <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios">
                  <AnimatePresence mode="wait">
                    {tab === "send" && (
                      <motion.div
                        key="send"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4 pt-2"
                      >
                        {/* Banner último proof */}
                        {lastProof && <ProofStatusBanner data={lastProof} />}

                        {/* CTA pago online */}
                        {sale.payment_url && (
                          <a
                            href={sale.payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 h-12 rounded-2xl font-black text-white text-sm shadow-bloom press-hard"
                            style={{
                              background:
                                "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)",
                            }}
                          >
                            <CreditCard size={16} />
                            Pagar saldo en línea
                            <ArrowRight size={14} />
                          </a>
                        )}

                        {/* Reporte de comprobante en modo compact */}
                        <ReportPaymentButton
                          saleId={sale.id}
                          balance={safeBalance}
                          customerEmail={authEmail ?? null}
                          compact
                          onUploaded={() => {
                            // Tras subir, salta a Historial y refresca
                            setTab("history")
                            listProofsForSale(sale.id)
                              .then(setProofs)
                              .catch(() => {})
                          }}
                        />

                        <p className="text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
                          <ShieldCheck size={11} /> Validaremos tu pago y se
                          abonará al saldo
                        </p>
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
                        <HistoryContent
                          payments={payments}
                          proofs={proofs}
                          loadingProofs={loadingProofs}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
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
 * Subcomponentes
 * ──────────────────────────────────────────────────────── */
function HistoryContent({
  payments,
  proofs,
  loadingProofs,
}: {
  payments: NonNullable<Props["sale"]>["payments"]
  proofs: PaymentProof[]
  loadingProofs: boolean
}) {
  const hasPayments = !!payments && payments.length > 0
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
      {hasPayments && (
        <section>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <CheckCircle2 size={11} className="text-emerald-500" />
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Pagos confirmados ({payments!.length})
            </p>
          </div>
          <div className="relative pl-3 border-l-2 border-emerald-200 dark:border-emerald-500/30 space-y-2">
            {payments!.map((p, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-[15px] top-2 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-500/20" />
                <div className="flex items-center justify-between gap-3 bg-emerald-50/70 dark:bg-emerald-500/10 rounded-xl px-3 py-2 border border-emerald-100 dark:border-emerald-500/30">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                      {p.method ?? "Pago"}
                    </p>
                    <p className="text-[9px] text-slate-500 dark:text-slate-400">
                      {formatRelative(p.created_at)}
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
          : "Comprobante enviado · lo estamos validando",
      sub:
        proof.amount && proof.amount > 0
          ? `Monto: ${formatMoney(Number(proof.amount))}`
          : "Recibirás una notificación cuando se apruebe",
    },
    approved: {
      cls: "border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
      iconCls: "bg-emerald-500 text-white",
      icon: <CheckCircle2 size={14} />,
      title: "Pago aprobado",
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
          layoutId="paycenter-tab-pill"
          className="absolute inset-0 rounded-xl shadow-bloom"
          style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
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

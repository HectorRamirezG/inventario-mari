import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import X from "lucide-react/dist/esm/icons/x"
import Wallet from "lucide-react/dist/esm/icons/wallet"
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2"
import Loader2 from "lucide-react/dist/esm/icons/loader-2"
import AlertCircle from "lucide-react/dist/esm/icons/alert-circle"
import CreditCard from "lucide-react/dist/esm/icons/credit-card"
import Receipt from "lucide-react/dist/esm/icons/receipt"
import ImageIcon from "lucide-react/dist/esm/icons/image"
import FileText from "lucide-react/dist/esm/icons/file-text"
import Share2 from "lucide-react/dist/esm/icons/share-2"
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check"
import Sparkles from "lucide-react/dist/esm/icons/sparkles"
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right"
import History from "lucide-react/dist/esm/icons/history"
import Banknote from "lucide-react/dist/esm/icons/banknote"

import { formatMoney, formatRelative, shortId } from "../../lib/format"
import { useAuth } from "../../lib/useAuth"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import { shareText } from "../../lib/share"
import { useFeedback } from "../../lib/useFeedback"
import {
  listProofsForSale,
  uploadPaymentProof,
  type PaymentProof,
} from "../../features/payments/paymentProofsService"
import ReportPaymentButton, { ProofsHistory } from "./ReportPaymentButton"
import toast from "react-hot-toast"

interface Props {
  open: boolean
  /** Datos mínimos de la venta para el centro de pagos. */
  sale: {
    id: string
    total: number
    paid: number
    balance: number
    payment_url?: string | null
    public_token?: string | null
    customer_name?: string | null
    payments?: {
      amount: number
      method: string | null
      created_at: string
    }[]
  } | null
  onClose: () => void
}

/**
 * Centro de Pago — REDISEÑO 2026-06-26.
 *
 * Cambios vs versión anterior:
 *   - Hero RADIAL con anillo de progreso animado (estilo Apple Wallet)
 *     en lugar de barra horizontal + "plan sugerido estático".
 *   - Grid de 2 métodos GRANDES visuales (Pago online / Subir
 *     comprobante) en vez de tabs + banners apilados.
 *   - Línea de tiempo UNIFICADA (pagos + comprobantes en una sola
 *     timeline cronológica) — antes vivían en secciones separadas.
 *   - Acción adicional: "Compartir saldo con alguien" — útil cuando
 *     la cliente quiere que su mamá/pareja pague el resto.
 *   - Confetti + flash "¡Pagado!" cuando balance cae a 0 (preservado).
 *   - Recibo en imagen/PDF cuando isPaid (preservado).
 */
export default function PaymentCenterDrawer({ open, sale, onClose }: Props) {
  const [proofs, setProofs] = useState<PaymentProof[]>([])
  const [loadingProofs, setLoadingProofs] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  // Flujo "pagaré en efectivo al recoger": crea un proof method='efectivo'
  // sin imagen para que Mari lo valide al recibir el dinero físico.
  const [showCash, setShowCash] = useState(false)
  const [cashAmount, setCashAmount] = useState<number | "">("")
  const [cashBusy, setCashBusy] = useState(false)
  const { email: authEmail } = useAuth()
  const { tap, success } = useFeedback()

  // Refs
  const receiptBodyRef = useRef<HTMLDivElement | null>(null)

  // Flash "Pagado ✓" cuando balance llega a 0 estando el drawer abierto.
  const [justPaidFlash, setJustPaidFlash] = useState(false)
  const wasPaidRef = useRef<boolean | null>(null)

  // Reset al abrir / cambiar de venta
  useEffect(() => {
    if (open) {
      setShowUpload(false)
      setShowCash(false)
      setCashAmount("")
      setCashBusy(false)
    }
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

  useBodyScrollLock(open)

  // Confetti + flash al pagar
  useEffect(() => {
    if (!open || !sale) {
      wasPaidRef.current = null
      return
    }
    const total = Number(sale.total) || 0
    const paid = Number(sale.paid) || 0
    const balance = Math.max(0, total - paid)
    const nowPaid = balance <= 0
    if (wasPaidRef.current === null) {
      wasPaidRef.current = nowPaid
      return
    }
    if (!wasPaidRef.current && nowPaid) {
      wasPaidRef.current = true
      const motionOff =
        typeof document !== "undefined" &&
        document.documentElement.dataset.motion === "off"
      if (!motionOff) {
        setJustPaidFlash(true)
        window.setTimeout(() => setJustPaidFlash(false), 1600)
      }
      success()
      ;(async () => {
        try {
          const { fireConfetti } = await import("../../lib/confetti")
          fireConfetti({
            duration: 1400,
            count: 60,
            colors: ["#10b981", "#34d399", "#a7f3d0", "#fbbf24", "#ffffff"],
          })
        } catch {}
      })()
    } else {
      wasPaidRef.current = nowPaid
    }
  }, [open, sale?.id, sale?.paid, sale?.total, success])

  // ESC
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

  // Banner del último proof (pendiente / aprobado / rechazado)
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

  // Timeline unificada: pagos confirmados + comprobantes pending/rejected.
  // OJO: este useMemo DEBE vivir ANTES de cualquier early return — si se
  // mueve abajo, React cuenta menos hooks cuando `sale` es null vs cuando
  // tiene valor, lo que dispara el error #310 al darle "Pagar saldo".
  const timeline = useMemo(() => {
    type Entry =
      | { kind: "payment"; at: string; amount: number; method: string | null }
      | {
          kind: "proof"
          at: string
          status: PaymentProof["status"]
          amount: number | null
          method: string | null
          rejection_reason: string | null
        }
    const entries: Entry[] = []
    const payments = sale?.payments ?? []
    for (const p of payments) {
      entries.push({
        kind: "payment",
        at: p.created_at,
        amount: Number(p.amount) || 0,
        method: p.method ?? null,
      })
    }
    for (const pr of proofs) {
      // Skip los approved porque ya están como payment (evita duplicar)
      if (pr.status === "approved") continue
      entries.push({
        kind: "proof",
        at: pr.created_at,
        status: pr.status,
        amount: pr.amount != null ? Number(pr.amount) : null,
        method: pr.method ?? null,
        rejection_reason: pr.rejection_reason ?? null,
      })
    }
    entries.sort((a, b) => b.at.localeCompare(a.at))
    return entries
  }, [sale, proofs])

  if (typeof document === "undefined" || !sale) return null

  // Defensa contra balance desincronizado
  const safeTotal = Number(sale.total) || 0
  const safePaid = Number(sale.paid) || 0
  const safeBalance = Math.max(0, safeTotal - safePaid)
  const isPaid = safeBalance <= 0
  const pct =
    safeTotal > 0 ? Math.min(100, (safePaid / safeTotal) * 100) : 0

  const handleShareBalance = async () => {
    tap()
    const link =
      typeof window !== "undefined" && sale.public_token
        ? `${window.location.origin}/ticket/${sale.public_token}`
        : null
    const msg = link
      ? `Hola! Te comparto mi pedido en Beauty's Me — faltan ${formatMoney(
          safeBalance,
        )} por pagar. Puedes pagarlo aquí:\n${link}`
      : `Faltan ${formatMoney(safeBalance)} por pagar en mi pedido de Beauty's Me ✨`
    await shareText({ title: "Mi saldo Beauty's Me", text: msg })
  }

  // Confirmar intención de pago en efectivo: crea un payment_proof con
  // method='efectivo' SIN imagen y status='pending_verification'. Mari lo
  // verá en su feed y lo aprobará al recibir el dinero físico.
  const handleCashCommit = async () => {
    if (!sale) return
    const amt = Number(cashAmount)
    if (!amt || amt <= 0) {
      toast.error("Escribe cuánto pagarás en efectivo")
      return
    }
    if (amt > safeBalance + 0.01) {
      toast.error(`El monto excede tu saldo (${formatMoney(safeBalance)})`)
      return
    }
    setCashBusy(true)
    const tid = toast.loading("Avisando a Mari...")
    try {
      const proof = await uploadPaymentProof({
        saleId: sale.id,
        file: null,
        amount: amt,
        method: "efectivo",
        customerEmail: authEmail ?? null,
        note: "Pagaré en efectivo al recoger",
      })
      success()
      toast.success(
        "Listo ✨ Mari lo confirma cuando lo reciba",
        { id: tid, duration: 4000 },
      )
      setShowCash(false)
      setCashAmount("")
      // refresca proofs locales para que el banner se vea ya
      try {
        const list = await listProofsForSale(sale.id)
        setProofs(list)
      } catch {
        /* noop */
      }
      // Notifica a otros containers para que refresquen también.
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("mari:payment-proof-uploaded", {
            detail: { saleId: sale.id, proofId: proof?.id ?? null },
          }),
        )
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo registrar", { id: tid })
    } finally {
      setCashBusy(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center"
          style={{ isolation: "isolate" }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            className="absolute inset-0 bg-slate-950/75 z-0"
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
            className="relative z-10 w-full max-w-md bg-white dark:bg-slate-950 rounded-t-[2.5rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.4)] max-h-[94vh] flex flex-col touch-pan-y overflow-hidden"
            style={OVERLAY_PANEL_STYLE}
          >
            {/* Flash "Pagado ✓" */}
            <AnimatePresence>
              {justPaidFlash && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none bg-emerald-500/25 backdrop-blur-md rounded-t-[2.5rem]"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xl">
                      <CheckCircle2 size={56} strokeWidth={2.5} />
                    </div>
                    <p className="text-lg font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-100">
                      ¡Pagado!
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Handle drag */}
            <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header minimal */}
            <div className="flex items-center justify-between px-5 pb-2 shrink-0">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none">
                  Centro de pago
                </p>
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-0.5">
                  Pedido {shortId(sale.id)}
                  {sale.customer_name && (
                    <span className="text-slate-400"> · {sale.customer_name.split(" ")[0]}</span>
                  )}
                </p>
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

            {/* ────────── HERO RADIAL ────────── */}
            <RadialHero
              total={safeTotal}
              paid={safePaid}
              balance={safeBalance}
              pct={pct}
              isPaid={isPaid}
            />

            {/* Si está pagado, vista de gracias + recibos */}
            {isPaid ? (
              <div
                ref={receiptBodyRef}
                className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-5 text-center"
                >
                  <p className="text-base font-black text-emerald-700 dark:text-emerald-300">
                    Gracias por confiar 💚
                  </p>
                  <p className="text-[12px] text-emerald-600/80 dark:text-emerald-300/80 mt-1">
                    Tu pago está completo. Te avisaremos cuando esté en camino.
                  </p>
                </motion.div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const { shareTicketImage } = await import(
                        "../../lib/shareImage"
                      )
                      await shareTicketImage({
                        node: receiptBodyRef.current,
                        filename: `recibo-${sale.id.slice(0, 8)}.png`,
                        text: "Mi recibo de Beauty's Me",
                      })
                    }}
                    className="h-11 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
                  >
                    <ImageIcon size={13} /> Imagen
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const { shareTicketPdf } = await import(
                        "../../lib/shareImage"
                      )
                      await shareTicketPdf({
                        node: receiptBodyRef.current,
                        filename: `recibo-${sale.id.slice(0, 8)}.pdf`,
                      })
                    }}
                    className="h-11 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
                  >
                    <FileText size={13} /> PDF
                  </button>
                </div>

                {timeline.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 px-1">
                      Movimientos
                    </p>
                    <TimelineList entries={timeline} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] scroll-container-ios space-y-4">
                {/* Banner último proof */}
                {lastProof && <ProofStatusBanner data={lastProof} />}

                {/* ────────── GRID DE MÉTODOS ────────── */}
                {!showUpload && !showCash && (
                  <div className="space-y-2.5 pt-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">
                      ¿Cómo quieres pagar?
                    </p>

                    {/* Pago online (si hay link configurado) */}
                    {sale.payment_url && (
                      <a
                        href={sale.payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => tap()}
                        className="group block rounded-2xl border-2 border-transparent bg-gradient-to-br from-violet-500 via-pink-500 to-rose-500 text-white p-4 shadow-bloom press"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center shrink-0">
                            <CreditCard size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-black leading-tight">
                              Pagar en línea
                            </p>
                            <p className="text-[11px] opacity-90 leading-tight">
                              Con tarjeta — instantáneo y seguro
                            </p>
                          </div>
                          <ArrowRight
                            size={16}
                            className="group-hover:translate-x-1 transition-transform"
                          />
                        </div>
                      </a>
                    )}

                    {/* Subir comprobante */}
                    <button
                      type="button"
                      onClick={() => {
                        tap()
                        setShowUpload(true)
                      }}
                      className="w-full rounded-2xl border-2 border-emerald-200 dark:border-emerald-500/40 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/5 p-4 text-left press"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                          <Receipt size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-black leading-tight text-emerald-800 dark:text-emerald-200">
                            Subir comprobante
                          </p>
                          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 leading-tight">
                            Transferencia o depósito bancario
                          </p>
                        </div>
                        <ArrowRight
                          size={16}
                          className="text-emerald-700 dark:text-emerald-300"
                        />
                      </div>
                    </button>

                    {/* Pagar al recoger — abre mini-form que crea proof
                        method='efectivo' sin imagen. Mari lo valida al
                        recibir el dinero físico. */}
                    <button
                      type="button"
                      onClick={() => {
                        tap()
                        setCashAmount(safeBalance > 0 ? Number(safeBalance.toFixed(2)) : "")
                        setShowCash(true)
                      }}
                      className="w-full rounded-2xl border-2 border-amber-200 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/5 p-4 text-left press"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                          <Banknote size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-black leading-tight text-amber-800 dark:text-amber-200">
                            Efectivo al recoger
                          </p>
                          <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 leading-tight">
                            Avisas a Mari y ella lo confirma al recibirlo
                          </p>
                        </div>
                        <ArrowRight
                          size={16}
                          className="text-amber-700 dark:text-amber-300"
                        />
                      </div>
                    </button>

                    {/* Compartir saldo con alguien (mamá / pareja) */}
                    <button
                      type="button"
                      onClick={handleShareBalance}
                      className="w-full mt-2 h-11 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center justify-center gap-2 press"
                    >
                      <Share2 size={12} />
                      Pasarle el saldo a alguien
                    </button>
                  </div>
                )}

                {/* Vista de upload (cuando el cliente eligió subir) */}
                {showUpload && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3"
                  >
                    <button
                      type="button"
                      onClick={() => setShowUpload(false)}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1 press"
                    >
                      ← Volver a métodos
                    </button>
                    <ReportPaymentButton
                      saleId={sale.id}
                      balance={safeBalance}
                      customerEmail={authEmail ?? null}
                      compact
                      onUploaded={() => {
                        listProofsForSale(sale.id)
                          .then(setProofs)
                          .catch(() => {})
                        setShowUpload(false)
                      }}
                    />
                    <p className="text-center text-[10px] font-bold text-slate-400 flex items-center justify-center gap-1">
                      <ShieldCheck size={11} /> Mari valida tu pago y se abona al saldo
                    </p>
                  </motion.div>
                )}

                {/* Vista de pago en efectivo — cliente declara cuánto
                    pagará al recoger. Crea proof pending para Mari. */}
                {showCash && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (cashBusy) return
                        setShowCash(false)
                        setCashAmount("")
                      }}
                      disabled={cashBusy}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1 press disabled:opacity-50"
                    >
                      ← Volver a métodos
                    </button>

                    <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-bloom">
                          <Banknote size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-black leading-tight text-amber-900 dark:text-amber-100">
                            Pagar en efectivo
                          </p>
                          <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 leading-tight">
                            Avisas el monto y Mari lo confirma al recibirlo
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 block mb-1">
                          ¿Cuánto pagarás en efectivo?
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-black text-amber-700 dark:text-amber-300 pointer-events-none">
                            $
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            max={safeBalance}
                            value={cashAmount}
                            onChange={(e) =>
                              setCashAmount(
                                e.target.value === "" ? "" : Number(e.target.value),
                              )
                            }
                            disabled={cashBusy}
                            placeholder="0.00"
                            className="w-full h-14 pl-8 pr-3 rounded-xl border-2 border-amber-200 dark:border-amber-500/40 bg-white dark:bg-slate-900 text-2xl font-black tabular-nums outline-none focus:border-amber-500 disabled:opacity-50"
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[10px] font-bold">
                          <span className="text-amber-700/80 dark:text-amber-300/80">
                            Tu saldo: {formatMoney(safeBalance)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCashAmount(Number(safeBalance.toFixed(2)))}
                            disabled={cashBusy}
                            className="text-amber-700 dark:text-amber-300 underline disabled:opacity-50"
                          >
                            usar todo el saldo
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCashCommit}
                        disabled={cashBusy || !cashAmount || Number(cashAmount) <= 0}
                        className="w-full h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_10px_30px_-8px_rgba(245,158,11,0.5)] press-hard disabled:opacity-50"
                      >
                        {cashBusy ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Banknote size={14} />
                            Avisar a Mari
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-center text-[10px] font-bold text-slate-400 flex items-center justify-center gap-1">
                      <ShieldCheck size={11} /> Mari valida tu pago al recibir el dinero
                    </p>
                  </motion.div>
                )}

                {/* TIMELINE unificada */}
                {timeline.length > 0 && (
                  <section className="pt-2">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="flex items-center gap-1.5">
                        <History size={11} className="text-slate-400" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Movimientos
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400 tabular-nums">
                        {timeline.length}
                      </p>
                    </div>
                    <TimelineList entries={timeline} />
                  </section>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ──────────────────────────────────────────────────────────────────
 * HERO RADIAL — anillo de progreso animado estilo Apple Wallet
 * ────────────────────────────────────────────────────────────────── */

function RadialHero({
  total,
  paid,
  balance,
  pct,
  isPaid,
}: {
  total: number
  paid: number
  balance: number
  pct: number
  isPaid: boolean
}) {
  const size = 196
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct / 100)

  return (
    <div className="px-5 pb-3 pt-1 shrink-0">
      <div
        className={`relative rounded-3xl p-5 overflow-hidden ${
          isPaid
            ? "bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-500/15 dark:via-teal-500/10 dark:to-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30"
            : "bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 dark:from-rose-500/10 dark:via-pink-500/10 dark:to-purple-500/10 border border-pink-200 dark:border-pink-500/30"
        }`}
      >
        {/* Orbes decorativos */}
        <span
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-30 blur-xl"
          style={{
            background: isPaid
              ? "linear-gradient(135deg,#10b981,#34d399)"
              : "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
          }}
        />
        <span
          className="absolute -bottom-12 -left-8 w-32 h-32 rounded-full opacity-20 blur-xl"
          style={{
            background: isPaid
              ? "linear-gradient(135deg,#34d399,#a7f3d0)"
              : "linear-gradient(135deg,#a855f7,#ec4899)",
          }}
        />

        <div className="relative flex items-center gap-4">
          {/* Anillo SVG */}
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              {/* Track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="currentColor"
                strokeWidth={stroke}
                className="text-white/60 dark:text-slate-800/60"
              />
              {/* Progress */}
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                stroke={isPaid ? "#10b981" : "url(#paymentGradient)"}
                strokeDasharray={c}
                initial={{ strokeDashoffset: c }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
              <defs>
                <linearGradient
                  id="paymentGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="var(--brand-from)" />
                  <stop offset="100%" stopColor="var(--brand-to)" />
                </linearGradient>
              </defs>
            </svg>
            {/* Centro */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <p
                className={`text-[8px] uppercase tracking-widest font-black ${
                  isPaid
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {isPaid ? "Pagado" : "Te faltan"}
              </p>
              <p
                className={`text-[22px] font-black tabular-nums leading-none mt-0.5 ${
                  isPaid
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-primary"
                }`}
              >
                {formatMoney(isPaid ? paid : balance)}
              </p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mt-1">
                de {formatMoney(total)}
              </p>
              {!isPaid && pct > 0 && (
                <div className="mt-1.5 px-2 py-0.5 rounded-full bg-white/80 dark:bg-slate-900/60 text-[9px] font-black tabular-nums text-primary">
                  {pct.toFixed(0)}%
                </div>
              )}
              {isPaid && (
                <Sparkles
                  size={14}
                  className="text-emerald-500 dark:text-emerald-300 mt-1"
                />
              )}
            </div>
          </div>

          {/* Mini-stats al lado del anillo */}
          <div className="flex-1 min-w-0 space-y-2">
            <MiniStat
              icon={Wallet}
              label="Cobrado"
              value={formatMoney(paid)}
              tone="emerald"
            />
            <MiniStat
              icon={Banknote}
              label="Pendiente"
              value={formatMoney(balance)}
              tone={isPaid ? "muted" : "primary"}
            />
            <MiniStat
              icon={Receipt}
              label="Total"
              value={formatMoney(total)}
              tone="slate"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  tone: "emerald" | "primary" | "slate" | "muted"
}) {
  const TONE = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    primary: "text-primary",
    slate: "text-slate-700 dark:text-slate-200",
    muted: "text-slate-400 dark:text-slate-500 line-through",
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white/70 dark:bg-slate-900/40 px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-400">
        <Icon size={10} />
        {label}
      </span>
      <span className={`text-[12px] font-black tabular-nums ${TONE[tone]}`}>
        {value}
      </span>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * TIMELINE unificada (pagos + comprobantes pending/rejected)
 * ────────────────────────────────────────────────────────────────── */

type TimelineEntry =
  | { kind: "payment"; at: string; amount: number; method: string | null }
  | {
      kind: "proof"
      at: string
      status: PaymentProof["status"]
      amount: number | null
      method: string | null
      rejection_reason: string | null
    }

function TimelineList({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="relative pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-2">
      {entries.map((e, i) => (
        <TimelineRow key={i} entry={e} />
      ))}
    </div>
  )
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === "payment") {
    return (
      <div className="relative">
        <span className="absolute -left-[15px] top-2 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-500/20" />
        <div className="flex items-center justify-between gap-3 bg-emerald-50/70 dark:bg-emerald-500/10 rounded-xl px-3 py-2 border border-emerald-100 dark:border-emerald-500/30">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 leading-tight flex items-center gap-1">
              <CheckCircle2 size={10} className="text-emerald-500" />
              Pago confirmado
              {entry.method && (
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 capitalize">
                  · {entry.method}
                </span>
              )}
            </p>
            <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
              {formatRelative(entry.at)}
            </p>
          </div>
          <p className="text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300 shrink-0">
            +{formatMoney(entry.amount)}
          </p>
        </div>
      </div>
    )
  }

  // Proof
  const s = String(entry.status)
  const isPending = s === "pending" || s === "pending_verification"
  const isRejected = s === "rejected"
  const isCash = (entry.method ?? "").toLowerCase() === "efectivo"
  const cfg = isPending
    ? {
        bg: "bg-amber-50/70 dark:bg-amber-500/10",
        border: "border-amber-100 dark:border-amber-500/30",
        dot: "bg-amber-400 ring-amber-100 dark:ring-amber-500/20",
        text: "text-amber-700 dark:text-amber-300",
        icon: isCash ? <Banknote size={10} /> : <Loader2 size={10} className="animate-spin" />,
        label: isCash ? "Pago en efectivo pendiente" : "Comprobante en validación",
      }
    : isRejected
    ? {
        bg: "bg-rose-50/70 dark:bg-rose-500/10",
        border: "border-rose-100 dark:border-rose-500/30",
        dot: "bg-rose-400 ring-rose-100 dark:ring-rose-500/20",
        text: "text-rose-700 dark:text-rose-300",
        icon: <AlertCircle size={10} />,
        label: isCash ? "Pago en efectivo rechazado" : "Comprobante rechazado",
      }
    : {
        bg: "bg-slate-50/70 dark:bg-slate-800/40",
        border: "border-slate-100 dark:border-slate-700",
        dot: "bg-slate-300 ring-slate-100 dark:ring-slate-700",
        text: "text-slate-700 dark:text-slate-200",
        icon: <Receipt size={10} />,
        label: "Comprobante",
      }

  return (
    <div className="relative">
      <span
        className={`absolute -left-[15px] top-2 w-2.5 h-2.5 rounded-full ring-4 ${cfg.dot}`}
      />
      <div
        className={`flex items-center justify-between gap-3 ${cfg.bg} ${cfg.border} rounded-xl px-3 py-2 border`}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-black leading-tight flex items-center gap-1 ${cfg.text}`}
          >
            {cfg.icon}
            {cfg.label}
            {entry.method && (
              <span className="text-[9px] font-bold opacity-70 capitalize">
                · {entry.method}
              </span>
            )}
          </p>
          {isRejected && entry.rejection_reason && (
            <p className="text-[10px] text-rose-600/80 dark:text-rose-300/80 italic leading-snug mt-0.5">
              {entry.rejection_reason}
            </p>
          )}
          <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
            {formatRelative(entry.at)}
          </p>
        </div>
        {entry.amount != null && entry.amount > 0 && (
          <p
            className={`text-sm font-black tabular-nums shrink-0 ${cfg.text}`}
          >
            {formatMoney(entry.amount)}
          </p>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────
 * Banner del último proof — mini-pill arriba del grid de métodos
 * ────────────────────────────────────────────────────────────────── */

function ProofStatusBanner({
  data,
}: {
  data: { proof: PaymentProof; kind: "pending" | "approved" | "rejected" }
}) {
  const { proof, kind } = data
  const isCash = (proof.method ?? "").toLowerCase() === "efectivo"
  const cfg = {
    pending: isCash
      ? {
          cls: "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200",
          icon: <Banknote size={14} />,
          title: "Pago en efectivo registrado",
          sub:
            proof.amount && proof.amount > 0
              ? `${formatMoney(Number(proof.amount))} · Mari lo confirma al recibirlo`
              : "Mari lo confirma cuando reciba el dinero",
        }
      : {
          cls: "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200",
          icon: <Loader2 size={14} className="animate-spin" />,
          title: "Validando tu comprobante…",
          sub:
            proof.amount && proof.amount > 0
              ? `${formatMoney(Number(proof.amount))} · te avisamos al aprobar`
              : "Te avisamos cuando esté aprobado",
        },
    approved: {
      cls: "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
      icon: <CheckCircle2 size={14} />,
      title: "Pago aprobado",
      sub: `${formatMoney(Number(proof.amount) || 0)} · ${proof.method ?? "—"}`,
    },
    rejected: {
      cls: "border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-200",
      icon: <AlertCircle size={14} />,
      title: isCash ? "Tu pago en efectivo fue rechazado" : "Tu comprobante fue rechazado",
      sub:
        proof.rejection_reason ||
        "Vuelve a enviarlo o cambia el método",
    },
  }[kind]

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-3 flex items-start gap-2.5 ${cfg.cls}`}
    >
      <div className="w-9 h-9 rounded-xl bg-white/40 dark:bg-slate-900/30 flex items-center justify-center shrink-0">
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

/* Export ProofsHistory si alguien lo necesita (back-compat) */
export { ProofsHistory }

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import {
  X,
  CheckCircle2,
  Clock,
  MessageCircle,
  Sparkles,
  Share2,
  Copy,
  ExternalLink,
  Wallet,
  ArrowRight,
  AlertCircle,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import TicketTotalsDetailed from "./TicketTotalsDetailed"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { useBusinessRules } from "../../features/settings/businessRulesService"
import Skeleton, { SkeletonText } from "./Skeleton"
import PaymentCenterDrawer from "./PaymentCenterDrawer"

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

/**
 * TicketDrawer — Vista in-app del ticket público.
 *
 * SIMPLIFICADO: solo muestra el RESUMEN del pedido. Todo lo relacionado
 * con pago (CTA, comprobantes, historial de pagos) se movió al
 * `PaymentCenterDrawer` dedicado para no saturar el ticket.
 *
 * Si hay saldo pendiente, el ticket muestra un CTA grande "Centro de Pago"
 * que abre el drawer secundario.
 */
export default function TicketDrawer({ open, token, onClose }: Props) {
  const [ticket, setTicket] = useState<PublicTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentCenterOpen, setPaymentCenterOpen] = useState(false)
  const store = getStoreInfo()

  // Carga del ticket
  useEffect(() => {
    if (!open || !token) return
    let alive = true
    setLoading(true)
    setError(null)
    setTicket(null)
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
        await navigator.share({ title: "Ticket Beauty's Me", text, url })
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

  return createPortal(
    <>
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
                  {/* Estado sticky */}
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
                            isPaid ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
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

                  {/* CTA Centro de Pago — DESTACADO si hay saldo */}
                  {!isPaid && (
                    <div className="px-5 pb-3 shrink-0">
                      <motion.button
                        type="button"
                        onClick={() => setPaymentCenterOpen(true)}
                        whileTap={{ scale: 0.98 }}
                        className="relative w-full overflow-hidden rounded-2xl p-3.5 flex items-center gap-3 text-left shadow-bloom press-hard"
                        style={{
                          background:
                            "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)",
                        }}
                      >
                        {/* Brillo decorativo */}
                        <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/15 to-white/0 -translate-x-full hover:translate-x-full transition-transform duration-700" />
                        <div className="relative w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                          <Wallet size={18} className="text-white" />
                        </div>
                        <div className="relative flex-1 min-w-0 text-white">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-90 leading-none">
                            Centro de pago
                          </p>
                          <p className="text-sm font-black truncate mt-0.5">
                            Pagar o subir comprobante
                          </p>
                        </div>
                        <ArrowRight size={18} className="text-white shrink-0 relative" />
                      </motion.button>
                    </div>
                  )}

                  {/* Contenido scrolleable (RESUMEN puro) */}
                  <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios">
                    <SummarySection ticket={ticket} store={store} />
                  </div>

                  {/* Footer fijo con WhatsApp + acciones */}
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
      </AnimatePresence>

      {/* Centro de Pago secundario (drawer encima del ticket) */}
      <PaymentCenterDrawer
        open={paymentCenterOpen}
        sale={
          ticket
            ? {
                id: ticket.id,
                total: ticket.total,
                paid: ticket.paid,
                balance: ticket.balance,
                payment_url: ticket.payment_url,
                payments: ticket.payments,
              }
            : null
        }
        onClose={() => setPaymentCenterOpen(false)}
      />
    </>,
    document.body,
  )
}

/* ────────────────────────────────────────────────────────
 * Resumen (items + totales)
 * ──────────────────────────────────────────────────────── */
function SummarySection({
  ticket,
  store,
}: {
  ticket: PublicTicket
  store: ReturnType<typeof getStoreInfo>
}) {
  const rules = useBusinessRules()

  return (
    <div className="space-y-4 pt-2">
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

      {/* Totales — desglose compartido con PublicTicketPage */}
      <TicketTotalsDetailed
        items={ticket.items.map((it) => ({
          qty: Number(it.qty),
          unit_price: Number(it.unit_price),
        }))}
        total={ticket.total}
        paid={ticket.paid}
        balance={ticket.balance}
        adjustmentAmount={ticket.adjustment_amount}
        adjustmentReason={ticket.adjustment_reason}
        shippingAmount={ticket.shipping_amount}
        isForeignShipping={ticket.is_foreign_shipping}
        tone="auto"
      />

      {rules.custom_ticket_message_enabled && rules.custom_ticket_message && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-primary/25 bg-primary/5 dark:bg-primary/10 px-4 py-3"
        >
          <p className="text-[11px] font-bold text-primary italic text-center leading-snug">
            {rules.custom_ticket_message}
          </p>
        </motion.div>
      )}

      <p className="text-center text-[10px] uppercase tracking-widest text-slate-400 pt-1">
        {store.thanks_message ?? "Gracias por tu compra ✨"}
      </p>
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

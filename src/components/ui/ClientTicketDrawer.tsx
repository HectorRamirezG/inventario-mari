import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import {
  X,
  CheckCircle2,
  Clock,
  Share2,
  Copy,
  ExternalLink,
  MessageCircle,
  Sparkles,
  AlertCircle,
  Gift,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import TicketTotalsDetailed from "./TicketTotalsDetailed"
import OrderProgressTracker, {
  type OrderProgressDelivery,
} from "./OrderProgressTracker"
import Skeleton, { SkeletonText } from "./Skeleton"
import { parseGiftFromNotes } from "../../lib/giftNotes"

/**
 * Drawer in-place del ticket público para el cliente. Reemplaza la
 * navegación a `/ticket/:token` cuando el cliente quiere ver detalles
 * sin perder su lista de pedidos. Reutiliza el RPC `get_public_ticket`
 * y los mismos componentes que `PublicTicketPage` para consistencia
 * visual entre el modo "página completa" y el modo "drawer".
 */

interface PublicTicketItem {
  id: string
  product_name: string
  variant_name: string | null
  qty: number
  unit_price: number
  tier: string
}

interface PublicTicketPayment {
  amount: number
  method: string | null
  created_at: string
}

interface PublicTicket {
  id: string
  public_token: string
  customer_name: string | null
  customer_phone: string | null
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  payment_url: string | null
  notes?: string | null
  adjustment_amount?: number | null
  adjustment_reason?: string | null
  shipping_amount?: number | null
  is_foreign_shipping?: boolean | null
  created_at: string
  items: PublicTicketItem[]
  payments: PublicTicketPayment[]
}

interface Props {
  open: boolean
  /** ID o public_token. El RPC `get_public_ticket` acepta cualquiera. */
  token: string | null
  onClose: () => void
}

export default function ClientTicketDrawer({ open, token, onClose }: Props) {
  const [ticket, setTicket] = useState<PublicTicket | null>(null)
  const [delivery, setDelivery] = useState<OrderProgressDelivery | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const store = getStoreInfo()

  useBodyScrollLock(open)

  useEffect(() => {
    if (!open || !token) return
    let alive = true
    setLoading(true)
    setError(null)
    setTicket(null)
    setDelivery(null)
    ;(async () => {
      const { data, error: rpcErr } = await supabase.rpc("get_public_ticket", {
        p_token: token,
      })
      if (!alive) return
      if (rpcErr) {
        setError(rpcErr.message)
        setLoading(false)
        return
      }
      if (!data) {
        setError("Ticket no encontrado")
        setLoading(false)
        return
      }
      const raw = data as any
      const flat: any = raw?.sale ? { ...raw.sale } : { ...raw }
      flat.items = raw?.items ?? raw?.sale?.items ?? flat.items ?? []
      flat.payments = raw?.payments ?? raw?.sale?.payments ?? flat.payments ?? []
      if (!flat.id) {
        setError("Ticket inválido")
        setLoading(false)
        return
      }
      setTicket(flat as PublicTicket)
      setLoading(false)

      // Carga comanda asociada para el tracker (best-effort)
      try {
        const { data: dn } = await supabase
          .from("delivery_notes")
          .select(
            "id,status,driver_name,driver_phone,picked_up_at,delivered_at,current_lat,current_lng,last_position_at",
          )
          .eq("sale_id", flat.id)
          .order("created_at", { ascending: false })
          .limit(1)
        if (!alive) return
        const note = (dn?.[0] as any) ?? null
        if (note) {
          setDelivery({
            id: note.id,
            status: note.status,
            driver_name: note.driver_name ?? null,
            driver_phone: note.driver_phone ?? null,
            current_lat: note.current_lat ?? null,
            current_lng: note.current_lng ?? null,
            last_position_at: note.last_position_at ?? null,
            picked_up_at: note.picked_up_at ?? null,
            delivered_at: note.delivered_at ?? null,
          })
        }
      } catch {
        /* tabla puede no existir o sin columnas nuevas */
      }
    })()
    return () => {
      alive = false
    }
  }, [open, token])

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
        await navigator.share({ title: "Mi ticket", text, url })
      } catch {
        /* user cancelled */
      }
    } else {
      copyLink()
    }
  }

  if (typeof document === "undefined") return null

  // Recálculo defensivo desde los items para evitar inconsistencias.
  const subtotalReal =
    ticket?.items.reduce(
      (a, it) => a + Number(it.qty) * Number(it.unit_price),
      0,
    ) ?? 0
  const adjReal = Number(ticket?.adjustment_amount) || 0
  const shipReal = Number(ticket?.shipping_amount) || 0
  const totalReal = Math.max(0, subtotalReal - adjReal + shipReal)
  const paidReal =
    ticket?.payments?.reduce((a, p) => a + Number(p.amount || 0), 0) ??
    (Number(ticket?.paid) || 0)
  const balanceReal = Math.max(0, totalReal - paidReal)
  const isPaid = balanceReal <= 0

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ isolation: "isolate" }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/65"
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={OVERLAY_PANEL_TRANSITION}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            style={OVERLAY_PANEL_STYLE}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.45)] max-h-[92vh] flex flex-col touch-pan-y"
          >
            {/* Handle drag */}
            <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-9 h-9 rounded-2xl flex items-center justify-center shadow-bloom shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                  }}
                >
                  <Sparkles size={14} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none">
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

            {/* Loading / Error */}
            {loading && (
              <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios space-y-3">
                <Skeleton className="h-24 w-full" rounded="xl" />
                <Skeleton className="h-32 w-full" rounded="xl" />
                <SkeletonText lines={3} />
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
                {/* Estado sticky con tracker */}
                <div className="px-5 pb-3 shrink-0 space-y-3">
                  {/* Banner status */}
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
                          {isPaid ? "Pagado completo" : "Saldo pendiente"}
                        </p>
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                          {isPaid
                            ? `Pagaste ${formatMoney(paidReal)}`
                            : `Falta ${formatMoney(balanceReal)} de ${formatMoney(totalReal)}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Tracker dinámico */}
                  <OrderProgressTracker
                    total={totalReal}
                    paid={paidReal}
                    balance={balanceReal}
                    delivery={delivery}
                  />
                </div>

                {/* Cuerpo scrolleable: items + totales */}
                <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios space-y-4">
                  {/* Banner de regalo (si aplica) — parseado desde notes
                      con prefijo [REGALO] que viene del checkout cliente. */}
                  {(() => {
                    const gift = parseGiftFromNotes(ticket.notes)
                    if (!gift.isGift) return null
                    return (
                      <div className="rounded-2xl border border-fuchsia-200 dark:border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-50 to-pink-50 dark:from-fuchsia-500/10 dark:to-pink-500/10 p-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-fuchsia-500 text-white flex items-center justify-center shrink-0 shadow-bloom">
                            <Gift size={15} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-fuchsia-700 dark:text-fuchsia-300">
                              Este pedido es un regalo
                            </p>
                            {gift.recipient && (
                              <p className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5">
                                Para: {gift.recipient}
                              </p>
                            )}
                            {gift.message && (
                              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-1 italic leading-snug">
                                "{gift.message}"
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <p className="font-black uppercase tracking-widest text-slate-400">
                        Fecha
                      </p>
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {formatDateTime(ticket.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black uppercase tracking-widest text-slate-400">
                        Cliente
                      </p>
                      <p className="font-bold text-slate-700 dark:text-slate-200 truncate">
                        {ticket.customer_name ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-100 dark:border-slate-800">
                    {ticket.items.map((it) => (
                      <div
                        key={it.id}
                        className="p-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-tight truncate">
                            {it.product_name}
                          </p>
                          {it.variant_name && (
                            <p className="text-[10px] text-slate-500 truncate">
                              {it.variant_name}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {it.qty} × {formatMoney(it.unit_price)}
                            {it.tier !== "menudeo" && (
                              <span className="ml-1 inline-flex px-1.5 py-0 rounded-full bg-primary/10 text-primary font-black uppercase tracking-widest text-[8px]">
                                {it.tier}
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="text-sm font-black tabular-nums shrink-0">
                          {formatMoney(it.qty * it.unit_price)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Totales canónicos */}
                  <TicketTotalsDetailed
                    items={ticket.items.map((it) => ({
                      qty: Number(it.qty),
                      unit_price: Number(it.unit_price),
                    }))}
                    total={totalReal}
                    paid={paidReal}
                    balance={balanceReal}
                    adjustmentAmount={ticket.adjustment_amount}
                    adjustmentReason={ticket.adjustment_reason}
                    shippingAmount={ticket.shipping_amount}
                    isForeignShipping={ticket.is_foreign_shipping}
                    tone="auto"
                  />

                  {/* Pagos timeline */}
                  {ticket.payments && ticket.payments.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                        Historial de pagos
                      </p>
                      <div className="relative pl-3 border-l-2 border-emerald-200 dark:border-emerald-500/30 space-y-1.5">
                        {ticket.payments.map((p, i) => (
                          <div key={i} className="relative">
                            <span className="absolute -left-[14px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-500/20" />
                            <div className="flex items-center justify-between text-[10px] bg-emerald-50/70 dark:bg-emerald-500/10 rounded-lg px-2 py-1.5">
                              <span className="text-slate-600 dark:text-slate-300">
                                {formatDateTime(p.created_at)}{" "}
                                <span className="text-slate-400 uppercase text-[8px] font-black">
                                  {p.method ?? "efectivo"}
                                </span>
                              </span>
                              <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                                +{formatMoney(p.amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer fijo: contactar + acciones */}
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
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

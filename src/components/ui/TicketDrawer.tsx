import { useEffect, useState } from "react"
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
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { useAuth } from "../../lib/useAuth"
import Skeleton, { SkeletonText } from "./Skeleton"
import ReportPaymentButton from "./ReportPaymentButton"

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
 * TicketDrawer — Versión "in-app" del ticket público. Carga vía la misma
 * RPC `get_public_ticket` pero se monta como cortina inferior con
 * drag-to-dismiss. Nunca cambia la URL, así que el usuario regresa con
 * el botón "Atrás" del navegador a donde estaba.
 *
 * Para compartir por WhatsApp seguimos usando la ruta pública
 * `/ticket/:token` (link permanente, sin sesión).
 */
export default function TicketDrawer({ open, token, onClose }: Props) {
  const [ticket, setTicket] = useState<PublicTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { email: authEmail } = useAuth()
  const store = getStoreInfo()

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
      if (error) setError(error.message)
      else if (!data) setError("Ticket no encontrado")
      else setTicket(data as PublicTicket)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [open, token])

  // Bloquear scroll del body cuando está abierto
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

  const pct = ticket && ticket.total > 0 ? Math.min(100, (ticket.paid / ticket.total) * 100) : 0
  const isPaid = ticket ? ticket.balance <= 0 : false

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
            <div className="flex items-center justify-between px-5 pb-2 shrink-0">
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
                  <p className="text-sm font-black truncate">
                    {ticket ? shortId(ticket.id) : "Cargando..."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 active:scale-90"
              >
                <X size={14} />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios">
              {loading && <TicketSkeleton />}

              {error && !loading && (
                <div className="py-10 text-center">
                  <p className="text-sm font-bold text-rose-600 mb-1">
                    {error}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Cierra y vuelve a intentar.
                  </p>
                </div>
              )}

              {!loading && !error && ticket && (
                <div className="space-y-4 pt-2">
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-slate-400">
                        Fecha
                      </p>
                      <p className="text-xs font-bold">
                        {formatDateTime(ticket.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-slate-400">
                        Cliente
                      </p>
                      <p className="text-xs font-bold truncate">
                        {ticket.customer_name ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ticket.items.map((it) => (
                      <div
                        key={it.id}
                        className="py-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold leading-tight truncate">
                            {it.product_name}
                          </p>
                          {it.variant_name && (
                            <p className="text-xs text-slate-500 truncate">
                              {it.variant_name}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {it.qty} × {formatMoney(it.unit_price)}
                          </p>
                        </div>
                        <p className="text-sm font-black tabular-nums">
                          {formatMoney(it.qty * it.unit_price)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Totales — con envío + ajuste desglosado */}
                  {(() => {
                    const subtotal = ticket.items.reduce(
                      (a, it) => a + Number(it.qty) * Number(it.unit_price),
                      0
                    )
                    const adj = Number(ticket.adjustment_amount) || 0
                    const ship = Number(ticket.shipping_amount) || 0
                    const isForeign = !!ticket.is_foreign_shipping
                    return (
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
                        <Row
                          label="Total"
                          value={formatMoney(ticket.total)}
                          bold
                        />
                        {ticket.paid > 0 && (
                          <Row
                            label="Pagado"
                            value={formatMoney(ticket.paid)}
                            success
                          />
                        )}
                        {ticket.balance > 0 && (
                          <Row
                            label="Pendiente"
                            value={formatMoney(ticket.balance)}
                            danger
                            bold
                          />
                        )}
                        {/* Badge festivo de descuento manual */}
                        {adj > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.15 }}
                            className="mt-3 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 text-emerald-700 dark:text-emerald-300"
                          >
                            <span className="text-base" aria-hidden>🎉</span>
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
                      </div>
                    )
                  })()}

                  {/* Progreso */}
                  {ticket.is_layaway && ticket.total > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
                          Progreso
                        </span>
                        <span className="text-xs font-black text-primary">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{
                            background: "linear-gradient(90deg,#e6007e,#a855f7)",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Estado */}
                  <div
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl ${
                      isPaid
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {isPaid ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Clock size={18} />
                    )}
                    <span className="text-sm font-black">
                      {isPaid ? "Pagado completo" : "Saldo pendiente"}
                    </span>
                  </div>

                  {/* CTA pagar */}
                  {!isPaid && ticket.payment_url && (
                    <a
                      href={ticket.payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 h-12 rounded-2xl font-black text-white text-sm shadow-bloom"
                      style={{
                        background:
                          "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)",
                      }}
                    >
                      <CreditCard size={16} />
                      Pagar saldo
                      <ArrowRight size={14} />
                    </a>
                  )}

                  {/* Reportar comprobante de pago */}
                  {!isPaid && (
                    <ReportPaymentButton
                      saleId={ticket.id}
                      balance={Number(ticket.balance) || 0}
                      customerEmail={authEmail ?? null}
                      onUploaded={() => {
                        // Cierra el drawer despu\u00e9s de subir
                        setTimeout(onClose, 800)
                      }}
                    />
                  )}

                  {/* WhatsApp */}
                  {store.phone && (
                    <a
                      href={`https://wa.me/${store.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Hola, sobre mi ticket ${shortId(ticket.id)}...`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-emerald-500 text-white font-black text-xs"
                    >
                      <MessageCircle size={14} />
                      Contactar a la tienda
                    </a>
                  )}

                  {/* Acciones secundarias */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={shareNative}
                      className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                    >
                      <Share2 size={12} /> Compartir
                    </button>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                    >
                      <Copy size={12} /> Copiar link
                    </button>
                    <a
                      href={`/ticket/${ticket.public_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink size={12} /> Abrir
                    </a>
                  </div>

                  <p className="text-center text-[10px] uppercase tracking-widest text-slate-400 pt-2">
                    {store.thanks_message ?? "Gracias por tu compra ✨"}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
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
      <span className={bold ? "font-bold text-slate-700 dark:text-slate-200" : "text-slate-500"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          bold ? "font-black" : "font-bold"
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

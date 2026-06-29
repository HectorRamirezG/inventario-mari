import { motion } from "framer-motion"
import {
  Wallet,
  MessageCircle,
  Phone,
  Edit3,
  Receipt,
  CheckCircle2,
  ArrowRight,
  QrCode,
} from "lucide-react"

import { cleanPhone } from "../../lib/format"

/**
 * Bloque de acciones del cliente sobre un pedido. El BOTÓN PRINCIPAL
 * muta de identidad según el estado del pedido y la entrega:
 *
 *  Estado                                    │  CTA principal
 *  ─────────────────────────────────────────────────────────────────────
 *  balance > 0                               │  Pagar saldo (brand gradient)
 *  pagado + sin comanda activa               │  Ver mi ticket (slate)
 *  pagado + comanda preparando               │  Modificar entrega (slate)
 *  pagado + en camino + tiene driver_phone   │  WhatsApp/llamar repartidor (emerald)
 *  pagado + entregado                        │  Ver mi ticket (emerald soft)
 *
 *  Acciones SECUNDARIAS siempre visibles (compact): Ver ticket, Soporte.
 */

export interface SmartOrderActionsOrder {
  id: string
  balance: number
  paid: number
  total: number
  status: string
  public_token: string | null
}

export interface SmartOrderActionsDelivery {
  id: string
  status: string
  driver_name: string | null
  driver_phone: string | null
}

interface Props {
  order: SmartOrderActionsOrder
  delivery?: SmartOrderActionsDelivery | null
  /** Cliente está dentro del límite de tiempo para reportar (de canClaim). */
  canSupport?: boolean
  onPay: () => void
  onViewTicket: () => void
  onSupport: () => void
  /** Abre el bloque de QuickDeliveryActions (modificar entrega). */
  onEditDelivery?: () => void
  /** Cuando true, solo renderiza el CTA primario (las secundarias
   *  se manejan en una toolbar externa, p.ej. la card de pedidos
   *  cliente). Default: false (mantiene comportamiento legacy). */
  hideSecondary?: boolean
}

export default function SmartOrderActions({
  order,
  delivery,
  canSupport = true,
  onPay,
  onViewTicket,
  onSupport,
  onEditDelivery,
  hideSecondary = false,
}: Props) {
  const hasBalance = Number(order.balance) > 0
  const isFullyPaid = !hasBalance
  const dStatus = delivery?.status
  const isPreparing = isFullyPaid && (!delivery || dStatus === "sent" || dStatus === "draft")
  const isInRoute = isFullyPaid && dStatus === "picked_up"
  const isDelivered = isFullyPaid && dStatus === "delivered"
  const driverPhoneClean = delivery?.driver_phone
    ? cleanPhone(delivery.driver_phone)
    : null

  // CTA Primary mutante
  let primaryNode: React.ReactNode = null

  if (hasBalance) {
    primaryNode = (
      <motion.button
        type="button"
        onClick={onPay}
        whileTap={{ scale: 0.98 }}
        className="relative overflow-hidden w-full h-11 rounded-xl flex items-center justify-center gap-2 text-white text-[11px] font-black uppercase tracking-widest shadow-bloom press-hard"
        style={{
          background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)",
        }}
      >
        <Wallet size={13} />
        Pagar saldo
        <ArrowRight size={12} />
      </motion.button>
    )
  } else if (isInRoute && driverPhoneClean) {
    // En camino + tenemos teléfono del repartidor → WhatsApp directo
    const waUrl = `https://wa.me/${driverPhoneClean}?text=${encodeURIComponent(
      `Hola${delivery?.driver_name ? " " + delivery.driver_name.split(" ")[0] : ""}, tengo unas indicaciones sobre mi pedido.`,
    )}`
    primaryNode = (
      <motion.a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        whileTap={{ scale: 0.98 }}
        className="relative overflow-hidden w-full h-11 rounded-xl flex items-center justify-center gap-2 text-white text-[11px] font-black uppercase tracking-widest shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] press-hard bg-gradient-to-br from-emerald-500 to-teal-500"
      >
        <MessageCircle size={13} />
        WhatsApp al repartidor
        <ArrowRight size={12} />
      </motion.a>
    )
  } else if (isInRoute) {
    // En camino pero sin WhatsApp → mostrar info del repartidor
    primaryNode = (
      <div className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300 text-[11px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
        <Phone size={13} />
        {delivery?.driver_name ?? "Repartidor"} en camino
      </div>
    )
  } else if (isDelivered) {
    // Pedido entregado → ver QR/comprobante o ticket
    primaryNode = (
      <motion.button
        type="button"
        onClick={onViewTicket}
        whileTap={{ scale: 0.98 }}
        className="relative overflow-hidden w-full h-11 rounded-xl flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300 text-[11px] font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 press-hard"
      >
        <CheckCircle2 size={13} />
        Ver comprobante
        <ArrowRight size={12} />
      </motion.button>
    )
  } else if (isPreparing && onEditDelivery) {
    // Pagado, preparándose → modificar entrega
    primaryNode = (
      <motion.button
        type="button"
        onClick={onEditDelivery}
        whileTap={{ scale: 0.98 }}
        className="relative overflow-hidden w-full h-11 rounded-xl flex items-center justify-center gap-2 text-slate-700 dark:text-slate-200 text-[11px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 press-hard"
      >
        <Edit3 size={13} />
        Modificar entrega
        <ArrowRight size={12} />
      </motion.button>
    )
  } else {
    // Fallback: solo ver ticket
    primaryNode = (
      <motion.button
        type="button"
        onClick={onViewTicket}
        whileTap={{ scale: 0.98 }}
        className="relative overflow-hidden w-full h-11 rounded-xl flex items-center justify-center gap-2 text-slate-700 dark:text-slate-200 text-[11px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 press-hard"
      >
        <Receipt size={13} />
        Ver ticket
        <ArrowRight size={12} />
      </motion.button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {primaryNode}

      {/* Secundarias siempre visibles — a menos que el padre las maneje aparte. */}
      {!hideSecondary && (
      <div className="flex gap-2">
        {/* Ver ticket — siempre disponible */}
        <button
          type="button"
          onClick={onViewTicket}
          className="flex-1 flex items-center justify-center gap-1 h-9 rounded-xl bg-slate-50 dark:bg-slate-700 text-xs font-black text-slate-700 dark:text-slate-200 press"
        >
          <Receipt size={12} /> Ticket
        </button>
        {/* Soporte si el cliente puede */}
        {canSupport && (
          <button
            type="button"
            onClick={onSupport}
            className="h-9 px-3 rounded-xl bg-primary/10 text-primary text-xs font-black flex items-center gap-1 press"
            title="Reportar un problema con este pedido"
          >
            <MessageCircle size={12} /> Ayuda
          </button>
        )}
        {/* QR de entrega cuando está in_route — atajo abre el drawer
            in-app del ticket (que contiene el QR), no la página /ticket/.
            Estilo brand gradient para visibilidad en dark+light (antes
            era slate-900/slate-100 que se confundía en algunos fondos
            dark). */}
        {isInRoute && order.public_token && (
          <button
            type="button"
            onClick={onViewTicket}
            className="h-9 px-3 rounded-xl bg-gradient-to-br from-primary to-fuchsia-500 text-white text-xs font-black flex items-center gap-1 shadow-[0_6px_18px_-8px_rgba(236,72,153,0.55)] press"
            title="Código de entrega para mostrar al repartidor"
            aria-label="QR de entrega"
          >
            <QrCode size={12} />
          </button>
        )}
      </div>
      )}
    </div>
  )
}

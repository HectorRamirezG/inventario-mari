import { memo } from "react"
import { motion } from "framer-motion"
import {
  Truck,
  PackageCheck,
  XCircle,
  Clock as ClockIcon,
  Send,
} from "lucide-react"
import type { DeliveryStatus } from "../../features/delivery/deliveryService"

/**
 * Chip / pill que representa el status visual de una comanda de entrega.
 *
 * Se usa en:
 *  - Tarjeta de venta del admin (SaleCard en ApartadosPage)
 *  - Ticket público que ve el cliente (PublicTicketPage)
 *  - TicketDrawer del cliente
 *
 * Diseño compacto, mismo set de colores en todos lados para que el
 * cliente y el admin vean LO MISMO. Si la venta NO tiene comanda
 * todavía, devuelve null (no se muestra nada).
 */

const META: Record<
  DeliveryStatus,
  {
    label: string
    icon: typeof Truck
    bg: string
    text: string
    ring: string
    /** Mensaje largo para el cliente en su ticket (más amigable). */
    customerHint: string
  }
> = {
  draft: {
    label: "Borrador",
    icon: ClockIcon,
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-300",
    ring: "ring-slate-200 dark:ring-slate-700",
    customerHint: "está armando tu entrega",
  },
  sent: {
    label: "Asignada",
    icon: Send,
    bg: "bg-amber-100 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-200 dark:ring-amber-500/40",
    customerHint: "Ya hay repartidor asignado",
  },
  picked_up: {
    label: "En camino",
    icon: Truck,
    bg: "bg-sky-100 dark:bg-sky-500/15",
    text: "text-sky-700 dark:text-sky-300",
    ring: "ring-sky-200 dark:ring-sky-500/40",
    customerHint: "Tu pedido va en camino 🛵",
  },
  delivered: {
    label: "Entregada",
    icon: PackageCheck,
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-500/40",
    customerHint: "Pedido entregado ✓",
  },
  cancelled: {
    label: "Cancelada",
    icon: XCircle,
    bg: "bg-rose-100 dark:bg-rose-500/15",
    text: "text-rose-700 dark:text-rose-300",
    ring: "ring-rose-200 dark:ring-rose-500/40",
    customerHint: "Entrega cancelada",
  },
}

export interface DeliveryStatusChipProps {
  status: DeliveryStatus | string | null | undefined
  /** Variante de tamaño. */
  size?: "xs" | "sm" | "md"
  /** Si es true, también muestra el copy amistoso debajo del label. */
  showCustomerHint?: boolean
  /** Animación de pulse cuando está en camino. Default true. */
  pulseInTransit?: boolean
  className?: string
}

export default memo(function DeliveryStatusChip({
  status,
  size = "sm",
  showCustomerHint = false,
  pulseInTransit = true,
  className = "",
}: DeliveryStatusChipProps) {
  if (!status) return null
  const meta = META[status as DeliveryStatus]
  if (!meta) return null

  const Icon = meta.icon
  const sizes = {
    xs: { pill: "px-1.5 h-5 text-[8px]", icon: 8, gap: "gap-0.5" },
    sm: { pill: "px-2 h-6 text-[9px]", icon: 9, gap: "gap-1" },
    md: { pill: "px-2.5 h-7 text-[10px]", icon: 11, gap: "gap-1.5" },
  }
  const s = sizes[size]

  const animate =
    pulseInTransit && (status === "picked_up" || status === "sent")
      ? { scale: [1, 1.04, 1] }
      : undefined

  return (
    <div className={className}>
      <motion.span
        animate={animate}
        transition={
          animate ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined
        }
        className={`inline-flex items-center ${s.gap} rounded-full font-black uppercase tracking-widest ring-1 ${meta.bg} ${meta.text} ${meta.ring} ${s.pill}`}
      >
        <Icon size={s.icon} />
        {meta.label}
      </motion.span>
      {showCustomerHint && (
        <p
          className={`text-[10px] font-bold mt-1 leading-snug ${meta.text}`}
        >
          {meta.customerHint}
        </p>
      )}
    </div>
  )
})

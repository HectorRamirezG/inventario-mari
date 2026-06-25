import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Package, Truck, MapPin } from "lucide-react"

import { formatMoney, formatRelative } from "../../lib/format"
import { memo, useEffect, useRef, useState } from "react"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import { supabase } from "../../lib/supabase"
import { MapThumbnail } from "./MapThumbnail"

/**
 * Tracker dinámico para tarjetas de pedido del cliente.
 *
 * Muta visualmente según contexto:
 *  - Si hay saldo y NO hay delivery_note activa  → barra de pago tradicional.
 *  - Si está liquidado o ya hay comanda activa  → stepper Preparando → En ruta → Entregado.
 *  - Si la comanda está `picked_up` (En ruta) y trae lat/lng recientes → mini-mapa estático.
 *
 * La barra/stepper se renderiza inline en la card del pedido. Si necesitas
 * ETA o detalle de driver, pasa `expanded` y aparecen abajo.
 */

export interface OrderProgressDelivery {
  id: string
  status: "draft" | "sent" | "picked_up" | "delivered" | "cancelled" | string
  driver_name: string | null
  driver_phone: string | null
  current_lat?: number | null
  current_lng?: number | null
  last_position_at?: string | null
  picked_up_at: string | null
  delivered_at: string | null
}

export interface OrderProgressTrackerProps {
  total: number
  paid: number
  balance: number
  delivery?: OrderProgressDelivery | null
  /** Si true, muestra ETA + posición además del stepper. Default true cuando hay delivery activa. */
  expanded?: boolean
  /** Activa subscripción realtime al delivery_note para refrescar posición. */
  liveUpdates?: boolean
  /** Callback cuando llega nueva posición (para que el padre pueda re-render). */
  onPositionUpdate?: () => void
}

type Step = {
  id: "preparing" | "in_route" | "delivered"
  label: string
  short: string
  icon: typeof Package
}

const STEPS: Step[] = [
  { id: "preparing", label: "Preparando", short: "Prep", icon: Package },
  { id: "in_route", label: "En camino", short: "Camino", icon: Truck },
  { id: "delivered", label: "Entregado", short: "Entregado", icon: CheckCircle2 },
]

function statusToStepIndex(status: string | null | undefined): number {
  if (!status) return 0
  if (status === "picked_up") return 1
  if (status === "delivered") return 2
  if (status === "cancelled") return -1
  return 0
}

function OrderProgressTrackerImpl({
  total,
  paid,
  balance,
  delivery,
  expanded,
  liveUpdates = true,
  onPositionUpdate,
}: OrderProgressTrackerProps) {
  // Si NO hay delivery activa, mostramos solo la barra de pago tradicional
  const hasActiveDelivery =
    !!delivery && delivery.status !== "cancelled" && delivery.status !== "draft"
  const isFullyPaid = balance <= 0
  const isCancelled = delivery?.status === "cancelled"

  // Modo: pago | delivery
  const showDeliveryStepper = hasActiveDelivery
  const showPaymentBar = !showDeliveryStepper && !isFullyPaid
  const showPaidBadge = !showDeliveryStepper && isFullyPaid

  if (isCancelled) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Entrega cancelada
      </div>
    )
  }

  if (showPaidBadge) {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 size={11} />
          Pagado · sin comanda activa
        </span>
        <span className="tabular-nums">{formatMoney(paid)}</span>
      </div>
    )
  }

  if (showPaymentBar) {
    const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0
    return (
      <div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, var(--brand-from), var(--brand-to))" }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px]">
          <span className="text-slate-500">Pagado {formatMoney(paid)}</span>
          <span className="font-black text-primary">Falta {formatMoney(balance)}</span>
        </div>
      </div>
    )
  }

  return (
    <DeliveryStepperBlock
      delivery={delivery!}
      expanded={expanded ?? hasActiveDelivery}
      liveUpdates={liveUpdates}
      onPositionUpdate={onPositionUpdate}
    />
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * Sub-componente: stepper visual + opcional mini-mapa cuando hay posición
 * ────────────────────────────────────────────────────────────────────── */
function DeliveryStepperBlock({
  delivery,
  expanded,
  liveUpdates,
  onPositionUpdate,
}: {
  delivery: OrderProgressDelivery
  expanded: boolean
  liveUpdates: boolean
  onPositionUpdate?: () => void
}) {
  const activeStep = statusToStepIndex(delivery.status)
  const isInRoute = activeStep === 1
  const isDelivered = activeStep === 2

  // Estado local para la posición en vivo (puede llegar después del primer render)
  const [livePos, setLivePos] = useState<{ lat: number; lng: number; at: string } | null>(
    delivery.current_lat != null && delivery.current_lng != null
      ? {
          lat: Number(delivery.current_lat),
          lng: Number(delivery.current_lng),
          at: delivery.last_position_at ?? new Date().toISOString(),
        }
      : null,
  )

  // Refrescar cuando llegan eventos realtime de delivery_notes
  const refreshPos = useDebouncedCallback(async () => {
    if (!liveUpdates) return
    const { data } = await supabase
      .from("delivery_notes")
      .select("current_lat,current_lng,last_position_at,status")
      .eq("id", delivery.id)
      .maybeSingle()
    if (data) {
      if (data.current_lat != null && data.current_lng != null) {
        setLivePos({
          lat: Number(data.current_lat),
          lng: Number(data.current_lng),
          at: data.last_position_at ?? new Date().toISOString(),
        })
      }
      onPositionUpdate?.()
    }
  }, 600)

  useRealtimeSubscription("delivery_notes", refreshPos, {
    enabled: liveUpdates && isInRoute,
    match: (row) => row?.id === delivery.id,
  })

  // Si la última posición es muy vieja (>10min), no la mostramos
  const lastPosFresh =
    livePos && Date.now() - new Date(livePos.at).getTime() < 10 * 60 * 1000

  return (
    <div className="space-y-2">
      <Stepper activeStep={activeStep} pulse={isInRoute} />

      {expanded && (
        <AnimatePresence initial={false}>
          {isInRoute && lastPosFresh && livePos && (
            <motion.div
              key="map"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <MapThumbnail
                lat={livePos.lat}
                lng={livePos.lng}
                zoom={15}
                href={`https://www.google.com/maps?q=${livePos.lat},${livePos.lng}`}
                alt="Ubicación del repartidor en tiempo real"
                className="w-full h-28 border-sky-200 dark:border-sky-500/30 shadow-sm rounded-xl"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 dark:bg-slate-900/95 text-[9px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-300 shadow-sm">
                    <MapPin size={9} /> Repartidor en vivo
                  </span>
                  <span className="text-[9px] font-bold text-white drop-shadow">
                    {formatRelative(livePos.at)}
                  </span>
                </div>
              </MapThumbnail>
            </motion.div>
          )}

          {/* SUB-BANNERS REMOVIDOS — duplicaban informacion del
              OrderStatusBanner superior ('En camino · con Jovi',
              'Entregado · hace X', 'Preparando tu pedido'). Mari pidio
              no repetir. Solo dejamos el mapa LIVE arriba que SI agrega
              info nueva (ubicacion en tiempo real). */}
          {isInRoute && !lastPosFresh && null}
          {isDelivered && delivery.delivered_at && null}
          {activeStep === 0 && null}
        </AnimatePresence>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * Stepper visual: 3 puntos conectados, el activo con pulse
 * ────────────────────────────────────────────────────────────────────── */
function Stepper({ activeStep, pulse }: { activeStep: number; pulse: boolean }) {
  // Ref para animar transición entre pasos
  const trackRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (trackRef.current) {
      const pct = activeStep < 0 ? 0 : (activeStep / (STEPS.length - 1)) * 100
      trackRef.current.style.setProperty("--track-pct", `${pct}%`)
    }
  }, [activeStep])

  return (
    <div className="relative">
      {/* Línea de fondo */}
      <div className="absolute top-3 left-3 right-3 h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
      {/* Línea de progreso */}
      <div
        ref={trackRef}
        className="absolute top-3 left-3 h-0.5 rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `calc(var(--track-pct, 0%) - 1.5rem)`,
          background: "linear-gradient(90deg, var(--brand-from), var(--brand-to))",
        }}
      />
      {/* Pasos */}
      <div className="relative flex items-start justify-between">
        {STEPS.map((step, i) => {
          const isActive = i === activeStep
          const isDone = i < activeStep
          const Icon = step.icon
          return (
            <div key={step.id} className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={`relative w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black ${
                  isDone || isActive
                    ? "shadow-bloom"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                }`}
                style={
                  isDone || isActive
                    ? {
                        background:
                          "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                      }
                    : undefined
                }
              >
                <Icon size={11} />
                {isActive && pulse && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{
                      duration: 1.4,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                    style={{
                      background: "var(--brand-from)",
                    }}
                  />
                )}
              </div>
              <span
                className={`text-[9px] font-black uppercase tracking-widest leading-none ${
                  isActive
                    ? "text-primary"
                    : isDone
                    ? "text-slate-600 dark:text-slate-300"
                    : "text-slate-400"
                }`}
              >
                {step.short}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Comparador shallow: el tracker solo necesita re-renderizar cuando cambian
// los números del pago o el snapshot relevante de la entrega. Esto evita
// trabajo inútil en listas largas (ClientOrdersPage con 20+ apartados).
const OrderProgressTracker = memo(
  OrderProgressTrackerImpl,
  (prev, next) => {
    if (prev.total !== next.total) return false
    if (prev.paid !== next.paid) return false
    if (prev.balance !== next.balance) return false
    if (prev.expanded !== next.expanded) return false
    if (prev.liveUpdates !== next.liveUpdates) return false
    const dp = prev.delivery
    const dn = next.delivery
    if (!dp && !dn) return true
    if (!dp || !dn) return false
    return (
      dp.id === dn.id &&
      dp.status === dn.status &&
      dp.current_lat === dn.current_lat &&
      dp.current_lng === dn.current_lng &&
      dp.last_position_at === dn.last_position_at
    )
  },
)
export default OrderProgressTracker
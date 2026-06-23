import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Clock,
  CheckCircle2,
  LifeBuoy,
  Lock,
  ShoppingBag,
  XCircle,
  RotateCcw,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDate, shortId } from "../../lib/format"
import { useAuth } from "../../lib/useAuth"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import PaymentCenterDrawer from "../../components/ui/PaymentCenterDrawer"
import Skeleton from "../../components/ui/Skeleton"
import SupportModal from "../support/SupportModal"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import DeliveryStatusChip from "../../components/ui/DeliveryStatusChip"
import OrderProgressTracker, {
  type OrderProgressDelivery,
} from "../../components/ui/OrderProgressTracker"
import SmartOrderActions from "../../components/ui/SmartOrderActions"
import QuickDeliveryActions, {
  type DeliveryTimePref,
} from "../../components/ui/QuickDeliveryActions"
import OrderHelpCenter from "../../components/ui/OrderHelpCenter"
import ClientTicketDrawer from "../../components/ui/ClientTicketDrawer"
import TabBar from "../../components/ui/TabBar"
import { cancelSale } from "../apartados/apartadosService"
import { promptDialog } from "../../lib/prompt"
import { runWithUndo } from "../../lib/withUndo"
import {
  useBusinessRules,
  canClaim,
  canCancelSale,
  formatRemaining,
} from "../settings/businessRulesService"

type OrderFilter = "all" | "active" | "delivered" | "cancelled"

const ORDER_TABS: { id: OrderFilter; label: string }[] = [
  { id: "active", label: "Activos" },
  { id: "all", label: "Todos" },
  { id: "delivered", label: "Entregados" },
  { id: "cancelled", label: "Cancelados" },
]

interface MyOrder {
  id: string
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  created_at: string
  public_token: string | null
  payment_url: string | null
}

/** Mini-snapshot de la comanda asociada a la venta. */
interface MyDelivery extends OrderProgressDelivery {
  client_notes?: string | null
  client_time_pref?: DeliveryTimePref | null
}

export default function ClientOrdersPage() {
  const { email, fullName } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [paymentOrder, setPaymentOrder] = useState<MyOrder | null>(null)
  const [openSupport, setOpenSupport] = useState(false)
  const [supportSaleId, setSupportSaleId] = useState<string | null>(null)
  const [openHelp, setOpenHelp] = useState(false)
  const [filter, setFilter] = useState<OrderFilter>("active")
  /** Token (o id) del pedido cuyo ticket se abre como drawer in-place. */
  const [ticketToken, setTicketToken] = useState<string | null>(null)
  /** sale_id -> comanda más reciente (completa). */
  const [deliveryBySale, setDeliveryBySale] = useState<Record<string, MyDelivery>>({})
  /** sale_id -> si el bloque QuickDeliveryActions está abierto inline. */
  const [editDeliveryFor, setEditDeliveryFor] = useState<string | null>(null)
  const rules = useBusinessRules()
  const aliveRef = useRef(true)

  const loadOrders = useCallback(async () => {
    if (!email) return
    // Traemos la comanda más reciente con todos los campos que el tracker necesita.
    // Si los campos current_lat/lng/client_notes/client_time_pref aún no
    // existen (hot fix pendiente), Postgres ignora con error pero el select
    // anterior dejaría que falle. Por eso pedimos esos campos en un segundo
    // select tolerante.
    const { data } = await supabase
      .from("sales")
      .select(
        "id,total,paid,balance,status,is_layaway,created_at,public_token,payment_url,delivery_notes(id,status,driver_name,driver_phone,picked_up_at,delivered_at,created_at)",
      )
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(50)
    if (!aliveRef.current) return
    const list = (data as any[]) ?? []
    setOrders(list as MyOrder[])
    const map: Record<string, MyDelivery> = {}
    for (const o of list) {
      const notes: Array<any> = o.delivery_notes ?? []
      if (notes.length > 0) {
        const sorted = [...notes].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        )
        const latest = sorted[0]
        map[o.id] = {
          id: latest.id,
          status: latest.status,
          driver_name: latest.driver_name ?? null,
          driver_phone: latest.driver_phone ?? null,
          picked_up_at: latest.picked_up_at ?? null,
          delivered_at: latest.delivered_at ?? null,
        }
      }
    }
    setDeliveryBySale(map)
    // Segundo fetch tolerante de campos opcionales (lat/lng + client fields).
    // Si las columnas no existen, este select silenciosamente regresa null.
    const ids = Object.values(map).map((d) => d.id)
    if (ids.length > 0) {
      const { data: extra, error: extraErr } = await supabase
        .from("delivery_notes")
        .select("id,current_lat,current_lng,last_position_at,client_notes,client_time_pref")
        .in("id", ids)
      if (!extraErr && extra && aliveRef.current) {
        setDeliveryBySale((prev) => {
          const next = { ...prev }
          for (const row of extra as any[]) {
            const saleId = Object.keys(next).find((sid) => next[sid].id === row.id)
            if (!saleId) continue
            next[saleId] = {
              ...next[saleId],
              current_lat: row.current_lat ?? null,
              current_lng: row.current_lng ?? null,
              last_position_at: row.last_position_at ?? null,
              client_notes: row.client_notes ?? null,
              client_time_pref: (row.client_time_pref as DeliveryTimePref | null) ?? null,
            }
          }
          return next
        })
      }
    }
    setLoading(false)
  }, [email])

  useEffect(() => {
    if (!email) return
    aliveRef.current = true
    loadOrders()
    return () => {
      aliveRef.current = false
    }
  }, [email, loadOrders])

  // Realtime via hub multiplex. Filtramos por customer_email del lado
  // cliente para evitar abrir un canal con filtro por usuario.
  const scheduleOrdersReload = useDebouncedCallback(() => loadOrders(), 500)
  useRealtimeSubscription("sales", scheduleOrdersReload, {
    enabled: !!email,
    match: (row) => row?.customer_email === email,
  })
  useRealtimeSubscription("delivery_notes", scheduleOrdersReload, {
    enabled: !!email,
  })

  // Escuchar request de "abrir centro de pago de venta X" desde notifs.
  // Si la orden ya está cargada, abrimos PaymentCenterDrawer; si no, la
  // marcamos pendiente y abrimos cuando llegue del fetch.
  const pendingPayOrderRef = useRef<string | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      const saleId = (e as CustomEvent).detail?.saleId as string | undefined
      if (!saleId) return
      const o = orders.find((x) => x.id === saleId)
      if (o) setPaymentOrder(o)
      else pendingPayOrderRef.current = saleId
    }
    window.addEventListener("orders:open-payment-center", handler)
    return () => window.removeEventListener("orders:open-payment-center", handler)
  }, [orders])

  useEffect(() => {
    const id = pendingPayOrderRef.current
    if (!id) return
    const o = orders.find((x) => x.id === id)
    if (o) {
      setPaymentOrder(o)
      pendingPayOrderRef.current = null
    }
  }, [orders])

  /** Counts por categoría (para badges en los tabs). */
  const counts = useMemo(() => {
    const c = { all: orders.length, active: 0, delivered: 0, cancelled: 0 }
    for (const o of orders) {
      if (o.status === "cancelled") {
        c.cancelled++
        continue
      }
      const safePaid = Number(o.paid) || 0
      const safeTotal = Number(o.total) || 0
      const balance = Math.max(0, safeTotal - safePaid)
      const dStatus = deliveryBySale[o.id]?.status
      const isDelivered = balance <= 0 && (dStatus === "delivered" || !dStatus)
      if (isDelivered) {
        c.delivered++
      } else {
        c.active++
      }
    }
    return c
  }, [orders, deliveryBySale])

  /** Pedidos filtrados según el tab seleccionado. */
  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders
    if (filter === "cancelled") return orders.filter((o) => o.status === "cancelled")
    if (filter === "delivered") {
      return orders.filter((o) => {
        if (o.status === "cancelled") return false
        const safePaid = Number(o.paid) || 0
        const safeTotal = Number(o.total) || 0
        const balance = Math.max(0, safeTotal - safePaid)
        const dStatus = deliveryBySale[o.id]?.status
        return balance <= 0 && (dStatus === "delivered" || !dStatus)
      })
    }
    return orders.filter((o) => {
      if (o.status === "cancelled") return false
      const safePaid = Number(o.paid) || 0
      const safeTotal = Number(o.total) || 0
      const balance = Math.max(0, safeTotal - safePaid)
      const dStatus = deliveryBySale[o.id]?.status
      const isDelivered = balance <= 0 && (dStatus === "delivered" || !dStatus)
      return !isDelivered
    })
  }, [orders, filter, deliveryBySale])

  /** Sale más reciente con ventana de soporte aún abierta (canClaim).
   *  Si existe, el FAB de ayuda lo asocia al ticket. Si NO existe, el
   *  centro de ayuda ofrece solo FAQ + WhatsApp directo (no ticket). */
  const contextualSaleForSupport = useMemo(() => {
    for (const o of orders) {
      const claim = canClaim(rules, o as any)
      if (claim.allowed) return o
    }
    return null
  }, [orders, rules])

  /** Para invitar a reordenar: cliente puede repetir compra de un pedido
   *  ya entregado o pagado completamente. Reordena via reusing
   *  sales:prefill-cart pero en el cliente (BuySheet). Simple: navega
   *  al catálogo. Si queremos, después conectamos a un evento que
   *  pre-llene el carrito del cliente. */
  const handleReorder = useCallback(
    (saleId: string) => {
      toast("Te llevamos al catálogo · reorganizamos tu carrito 💖", {
        icon: "♻️",
        duration: 1800,
      })
      navigate(`/?reorder=${saleId}`)
    },
    [navigate],
  )

  if (loading) {
    return (
      <div className="space-y-3 pb-24">
        <div>
          <Skeleton className="h-7 w-40 mb-2" rounded="lg" />
          <Skeleton className="h-3 w-64" rounded="full" />
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <Skeleton className="h-2 w-12" rounded="full" />
                <Skeleton className="h-4 w-20" rounded="md" />
              </div>
              <Skeleton className="h-5 w-20" rounded="full" />
            </div>
            <Skeleton className="h-3 w-32" rounded="full" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-16" rounded="full" />
              <Skeleton className="h-4 w-20" rounded="md" />
            </div>
            <Skeleton className="h-1.5 w-full" rounded="full" />
            <Skeleton className="h-9 w-full" rounded="xl" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-24">
      {/* Encabezado limpio: solo título + subtítulo discreto. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">Mis pedidos</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tu historial de apartados y compras
          </p>
        </div>
        {/* Mini-acceso a ayuda en el header (en lugar del FAB flotante). */}
        <button
          type="button"
          onClick={() => setOpenHelp(true)}
          aria-label="Centro de ayuda"
          title="¿Necesitas ayuda?"
          className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center transition-colors press"
        >
          <LifeBuoy size={14} />
        </button>
      </div>

      {/* Filtros tab — solo si tiene más de 1 pedido. */}
      {orders.length > 1 && (
        <TabBar
          tabs={ORDER_TABS.map((t) => ({
            id: t.id,
            label: t.label,
            badge:
              t.id === "all"
                ? counts.all
                : t.id === "active"
                ? counts.active
                : t.id === "delivered"
                ? counts.delivered
                : counts.cancelled,
            badgeTone: t.id === "active" ? "warn" : "slate",
          })) as any}
          active={filter}
          onChange={(id) => setFilter(id as OrderFilter)}
          layoutId="orders-filter"
        />
      )}

      {/* Empty state contextual por filtro. */}
      {filteredOrders.length === 0 && (
        <EmptyStateIllustration
          variant="no-orders"
          title={
            filter === "active"
              ? "Sin pedidos activos"
              : filter === "delivered"
              ? "Sin entregas todavía"
              : filter === "cancelled"
              ? "Sin pedidos cancelados"
              : "Aún no tienes pedidos"
          }
          subtitle={
            filter === "active"
              ? "Cuando apartes o tengas saldo pendiente aparecerá aquí."
              : filter === "delivered"
              ? "Tus compras entregadas aparecerán aquí."
              : filter === "cancelled"
              ? "Esperemos que nunca tengas que ver esto."
              : "Arma tu carrito desde el catálogo y aparecerán aquí."
          }
          cta={
            filter === "active" || orders.length === 0 ? (
              <a
                href="/"
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-bloom press-hard"
              >
                <ShoppingBag size={12} /> Ir al catálogo
              </a>
            ) : null
          }
        />
      )}

      {filteredOrders.map((o) => {
        // Defensa contra datos inconsistentes en BD: si balance no
        // cuadra con total - paid (por ajustes viejos), recalculamos
        // localmente para que el cliente NUNCA vea "Total $375 / Falta $440".
        const safePaid = Number(o.paid) || 0
        const safeTotal = Number(o.total) || 0
        const balance = Math.max(0, safeTotal - safePaid)
        const paid = balance <= 0
        const delivery = deliveryBySale[o.id] ?? null
        const claim = canClaim(rules, o as any)
        const canEditDelivery =
          paid &&
          delivery &&
          (delivery.status === "draft" || delivery.status === "sent")
        const cancel = canCancelSale(rules, o as any)
        const isCompleted =
          paid &&
          o.status !== "cancelled" &&
          (delivery?.status === "delivered" || !delivery)

        return (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-4"
          >
            {/* HEADER: folio + estado + chip de entrega */}
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  Folio · {formatDate(o.created_at)}
                </p>
                <p className="text-sm font-black truncate">{shortId(o.id)}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                    paid
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  }`}
                >
                  {paid ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                  {paid ? "Pagado" : "Pendiente"}
                </span>
                {delivery && (
                  <DeliveryStatusChip status={delivery.status} size="xs" />
                )}
              </div>
            </div>

            {/* TOTAL */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500">Total</span>
              <span className="text-base font-black">{formatMoney(o.total)}</span>
            </div>

            {/* TRACKER dinámico: barra pago / stepper delivery / mini-mapa */}
            <OrderProgressTracker
              total={safeTotal}
              paid={safePaid}
              balance={balance}
              delivery={delivery}
            />

            {/* QUICK ACTIONS de entrega — solo si está pagado y la entrega
                aún no salió a ruta. Inline collapsible. */}
            {canEditDelivery && delivery && (
              <div className="mt-3">
                <QuickDeliveryActions
                  deliveryId={delivery.id}
                  initialNote={delivery.client_notes ?? null}
                  initialTimePref={delivery.client_time_pref ?? null}
                  enabled={editDeliveryFor === o.id || true}
                  onSaved={(patch) => {
                    setDeliveryBySale((prev) => ({
                      ...prev,
                      [o.id]: { ...prev[o.id], ...patch },
                    }))
                    setEditDeliveryFor(null)
                  }}
                />
              </div>
            )}

            {/* SMART ACTIONS — botón principal mutante según estado */}
            <div className="mt-3">
              <SmartOrderActions
                order={{
                  id: o.id,
                  balance,
                  paid: safePaid,
                  total: safeTotal,
                  status: o.status,
                  public_token: o.public_token,
                }}
                delivery={delivery}
                canSupport={claim.allowed}
                onPay={() => setPaymentOrder(o)}
                onViewTicket={() => setTicketToken(o.public_token ?? o.id)}
                onSupport={() => {
                  setSupportSaleId(o.id)
                  setOpenSupport(true)
                }}
                onEditDelivery={canEditDelivery ? () => setEditDeliveryFor(o.id) : undefined}
              />
            </div>

            {/* Hint de ventana para soporte */}
            {!claim.allowed && (
              <p className="mt-2 text-[10px] text-slate-400 italic flex items-center gap-1">
                <Lock size={10} /> {claim.reason}
              </p>
            )}
            {claim.allowed && Number.isFinite(claim.remainingMs) && (
              <p className="mt-2 text-[10px] text-slate-400 italic">
                Te quedan {formatRemaining(claim.remainingMs)} para reportar
              </p>
            )}

            {/* Botón "Reordenar" — solo para pedidos COMPLETADOS (entregado o
                pagado sin entrega). UX: cliente quiere repetir la compra. */}
            {isCompleted && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleReorder(o.id)}
                  className="h-8 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press"
                  title="Repetir esta compra"
                >
                  <RotateCcw size={11} />
                  Reordenar
                </button>
              </div>
            )}

            {/* Botón cancelar — solo si la regla `client_can_self_cancel` está
                activa Y la venta sigue dentro de la ventana de gracia. */}
            {rules.client_can_self_cancel && cancel.allowed && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    const reason = await promptDialog({
                      title: "Cancelar este pedido",
                      description:
                        "Cuéntanos por qué cancelas. Si abonaste algo, te contactaremos para devolverlo.",
                      placeholder: "Ej. Me equivoqué de tono, ya no lo necesito…",
                      confirmLabel: "Sí, cancelar pedido",
                      multiline: true,
                    })
                    if (reason === null) return
                    const snapshot = orders
                    runWithUndo({
                      message: "Pedido cancelado",
                      optimisticUI: () =>
                        setOrders((prev) => prev.filter((x) => x.id !== o.id)),
                      revertUI: () => setOrders(snapshot),
                      commit: async () => {
                        await cancelSale(o.id, reason || null)
                      },
                    })
                  }}
                  className="h-8 px-3 rounded-xl bg-transparent text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press"
                >
                  <XCircle size={11} />
                  Cancelar pedido
                </button>
              </div>
            )}
          </motion.div>
        )
      })}

      {/* Centro de pago - drawer dedicado solo para pago/comprobantes */}
      <PaymentCenterDrawer
        open={!!paymentOrder}
        sale={
          paymentOrder
            ? {
                id: paymentOrder.id,
                total: paymentOrder.total,
                paid: paymentOrder.paid,
                balance: paymentOrder.balance,
                payment_url: paymentOrder.payment_url,
                payments: [],
              }
            : null
        }
        onClose={() => setPaymentOrder(null)}
      />

      {/* FAB flotante eliminado — el botón de ayuda vive en el header
          de la página (icono LifeBuoy junto al título). Mucho menos
          intrusivo y siempre disponible. */}

      <OrderHelpCenter
        open={openHelp}
        onClose={() => setOpenHelp(false)}
        contextualSaleId={contextualSaleForSupport?.id ?? null}
        onOpenSupport={(saleId) => {
          setSupportSaleId(saleId)
          setOpenSupport(true)
        }}
      />

      <SupportModal
        open={openSupport}
        saleId={supportSaleId}
        customerName={fullName ?? email ?? null}
        onClose={() => setOpenSupport(false)}
      />

      {/* Ticket in-place: drawer bottom-sheet sin perder /mis-pedidos.
          Reusa get_public_ticket + componentes del TicketDrawer público. */}
      <ClientTicketDrawer
        open={!!ticketToken}
        token={ticketToken}
        onClose={() => setTicketToken(null)}
      />
    </div>
  )
}

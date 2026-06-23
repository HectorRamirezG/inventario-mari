import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Clock, CheckCircle2, LifeBuoy, Lock, ShoppingBag, XCircle } from "lucide-react"
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
import { cancelSale } from "../apartados/apartadosService"
import { promptDialog } from "../../lib/prompt"
import { runWithUndo } from "../../lib/withUndo"
import {
  useBusinessRules,
  canClaim,
  canCancelSale,
  formatRemaining,
} from "../settings/businessRulesService"

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

  if (orders.length === 0) {
    return (
      <EmptyStateIllustration
        variant="no-orders"
        title="Aún no tienes pedidos"
        subtitle="Arma tu carrito desde el catálogo y aparecerán aquí para que sigas su estado."
        cta={
          <a
            href="/"
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-bloom press-hard"
          >
            <ShoppingBag size={12} /> Ir al catálogo
          </a>
        }
      />
    )
  }

  return (
    <div className="space-y-3 pb-24">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Mis pedidos</h1>
        <p className="text-sm text-slate-500">
          Aquí ves todos tus apartados y compras.
        </p>
      </div>
      {orders.map((o) => {
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
                onViewTicket={() => navigate(`/ticket/${o.public_token ?? o.id}`)}
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

      {/* FAB de soporte (siempre visible, abajo a la izquierda) */}
      <motion.button
        type="button"
        onClick={() => {
          setSupportSaleId(null)
          setOpenSupport(true)
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.4 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Centro de soporte"
        title="¿Necesitas ayuda?"
        className="fixed bottom-16 left-4 z-40 w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-primary shadow-[0_10px_30px_-10px_rgba(15,23,42,0.25)] flex items-center justify-center hover:scale-105 transition-transform"
      >
        <LifeBuoy size={18} />
      </motion.button>

      <SupportModal
        open={openSupport}
        saleId={supportSaleId}
        customerName={fullName ?? email ?? null}
        onClose={() => setOpenSupport(false)}
      />
    </div>
  )
}

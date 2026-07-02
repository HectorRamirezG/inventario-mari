import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation } from "react-router-dom"
import { useTransitionNavigate } from "../../lib/viewTransition"
import { motion } from "framer-motion"
import {
  LifeBuoy,
  ShoppingBag,
  XCircle,
  RotateCcw,
  Star,
  QrCode,
  X as XIcon,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDate, shortId } from "../../lib/format"
import { imageAvatar } from "../../lib/imageTransform"
import { useAuth } from "../../lib/useAuth"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import PaymentCenterDrawer from "../../components/ui/PaymentCenterDrawer"
import PageHeader from "../../components/ui/PageHeader"
import Skeleton from "../../components/ui/Skeleton"
import SupportModal from "../support/SupportModal"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import OrderProgressTracker, {
  type OrderProgressDelivery,
} from "../../components/ui/OrderProgressTracker"
import SmartOrderActions from "../../components/ui/SmartOrderActions"
import OrderHelpCenter from "../../components/ui/OrderHelpCenter"
import ClientTicketDrawer from "../../components/ui/ClientTicketDrawer"
import RateOrderProductsDrawer from "../reviews/RateOrderProductsDrawer"
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

/** Mini-thumb por item para el strip visual de la card. */
interface OrderItemThumb {
  variant_id: string | null
  product_name: string | null
  variant_name: string | null
  qty: number
  image_url: string | null
}

/** Mini-snapshot de la comanda asociada a la venta. Solo lectura desde
 *  el lado cliente — modificar la entrega es tarea del admin. */
interface MyDelivery extends OrderProgressDelivery {
  client_notes?: string | null
  client_time_pref?: string | null
}

/** Lee el set de IDs ya celebrados (paid/delivered) desde localStorage.
 *  Permite que el confetti NO se vuelva a disparar al remontar la página. */
function readCelebratedSet(key: string | null): Set<string> {
  if (!key || typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [])
  } catch {
    return new Set()
  }
}

/** Persiste el set de IDs ya celebrados. Cap a 200 para evitar crecimiento
 *  sin fin (cliente con 500 pedidos liquidados a lo largo de años). */
function writeCelebratedSet(key: string | null, set: Set<string>): void {
  if (!key || typeof window === "undefined") return
  try {
    const arr = Array.from(set).slice(-200)
    window.localStorage.setItem(key, JSON.stringify(arr))
  } catch {
    /* localStorage lleno o privado — ignorar */
  }
}

export default function ClientOrdersPage() {
  const { email, fullName } = useAuth()
  // navigate envuelto con View Transitions API: el "Ver ticket" y
  // demás botones que cambian de ruta tienen fade suave en lugar de
  // cambio seco. En browsers viejos degrada a navigate normal.
  const navigate = useTransitionNavigate()
  const location = useLocation()
  // Si llegamos con state.openHelp=true (típicamente desde el
  // CommandPalette > "Pedir ayuda"), abrimos el centro de ayuda al montar.
  const [shouldOpenHelpOnMount] = useState<boolean>(
    () => !!(location.state as { openHelp?: boolean } | null)?.openHelp,
  )
  // Si llegamos con state.followUp (típicamente desde NotificationBell
  // tras click en notif de comprobante aprobado/rechazado), disparamos
  // el evento custom para que el listener correspondiente abra el drawer.
  // Esto cubre el caso en que el componente NO está montado cuando el
  // NotificationBell hizo dispatch (Suspense + lazy), el evento se
  // perdería sin este fallback por router state.
  useEffect(() => {
    const fu = (location.state as { followUp?: { event: string; detail: any } } | null)
      ?.followUp
    if (!fu || !fu.event) return
    // Disparamos en próximo tick para que los listeners del componente
    // tengan tiempo de montarse.
    const id = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(fu.event, { detail: fu.detail }))
    }, 80)
    // Limpiamos el state para que un refresh NO vuelva a disparar el
    // followUp (sino se abriría el drawer cada vez que el cliente
    // refresca la página).
    navigate(location.pathname, { replace: true, state: {} })
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [paymentOrder, setPaymentOrder] = useState<MyOrder | null>(null)
  const [openSupport, setOpenSupport] = useState(false)
  const [supportSaleId, setSupportSaleId] = useState<string | null>(null)
  const [openHelp, setOpenHelp] = useState(false)
  // Auto-abrir si veníamos del CommandPalette > Pedir ayuda.
  useEffect(() => {
    if (shouldOpenHelpOnMount) setOpenHelp(true)
  }, [shouldOpenHelpOnMount])
  const [filter, setFilter] = useState<OrderFilter>("active")
  /** Token (o id) del pedido cuyo ticket se abre como drawer in-place. */
  const [ticketToken, setTicketToken] = useState<string | null>(null)
  /** Sale id cuya calificación de productos está abierta (drawer Rate). */
  const [rateOrderId, setRateOrderId] = useState<string | null>(null)
  const openRateOrder = useCallback((id: string) => setRateOrderId(id), [])
  /** sale_id -> comanda más reciente (completa). */
  const [deliveryBySale, setDeliveryBySale] = useState<Record<string, MyDelivery>>({})
  /** sale_id -> cantidad de incidencias abiertas. Mantenido por realtime. */
  const [openTicketsBySale, setOpenTicketsBySale] = useState<Record<string, number>>({})
  /** sale_id -> primeras 4 fotos de productos (mini strip visual). */
  const [itemsBySale, setItemsBySale] = useState<Record<string, OrderItemThumb[]>>({})
  /** IDs que acaban de transicionar a "pagado" — ring verde temporal. */
  const [justPaidIds, setJustPaidIds] = useState<Set<string>>(new Set())
  const rules = useBusinessRules()
  const aliveRef = useRef(true)
  // Trackea qué deliveries el cliente ya vio en estado 'delivered' para
  // disparar confetti SOLO en la transición (no en cada refetch). Persistido
  // en localStorage por email para que sobreviva remount/refresh — sin esto,
  // cada vez que el cliente entra a /mis-pedidos se le dispara el confetti
  // de TODOS los pedidos liquidados (bug reportado por Mari).
  const deliveredKnownRef = useRef<Set<string> | null>(null)
  const paidKnownRef = useRef<Set<string> | null>(null)
  /** QR del pedido que se muestra al repartidor/Mari para identificar la venta. */
  const [qrSaleId, setQrSaleId] = useState<string | null>(null)

  const celebratedPaidKey = email
    ? `mari:celebrated-paid:${email.toLowerCase()}`
    : null
  const celebratedDeliveredKey = email
    ? `mari:celebrated-delivered:${email.toLowerCase()}`
    : null

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
    // Fetch tolerante de sale_items + thumbs de variantes para mostrar
    // el mini-strip visual en cada card. Es "nice to have": si falla,
    // las cards simplemente no muestran fotos.
    const orderIds = list.map((o: any) => o.id).filter(Boolean)
    if (orderIds.length > 0) {
      ;(async () => {
        try {
          const { data: items } = await supabase
            .from("sale_items")
            .select("sale_id,variant_id,product_name,variant_name,qty")
            .in("sale_id", orderIds)
          if (!items || !aliveRef.current) return
          const variantIds = Array.from(
            new Set(
              (items as any[])
                .map((it) => it.variant_id)
                .filter((v): v is string => !!v),
            ),
          )
          let imgByVariant = new Map<string, string | null>()
          if (variantIds.length > 0) {
            const { data: variants } = await supabase
              .from("variants")
              .select("id,image_url,image_urls")
              .in("id", variantIds)
            for (const v of (variants as any[]) ?? []) {
              const img =
                (Array.isArray(v.image_urls) && v.image_urls[0]) ||
                v.image_url ||
                null
              imgByVariant.set(v.id, img ?? null)
            }
          }
          const grouped: Record<string, OrderItemThumb[]> = {}
          for (const it of items as any[]) {
            const thumb: OrderItemThumb = {
              variant_id: it.variant_id ?? null,
              product_name: it.product_name ?? null,
              variant_name: it.variant_name ?? null,
              qty: Number(it.qty) || 0,
              image_url: it.variant_id
                ? imgByVariant.get(it.variant_id) ?? null
                : null,
            }
            ;(grouped[it.sale_id] ??= []).push(thumb)
          }
          if (aliveRef.current) setItemsBySale(grouped)
        } catch {
          /* best-effort */
        }
      })()
    }
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

  // Confetti al detectar transición a 'delivered'. Persistimos los IDs
  // ya celebrados en localStorage para que no se vuelva a disparar al
  // remontar la página (cliente entra/sale de /mis-pedidos varias veces).
  useEffect(() => {
    if (loading) return
    const currentDelivered = new Set<string>()
    for (const [saleId, d] of Object.entries(deliveryBySale)) {
      if (d.status === "delivered") currentDelivered.add(saleId)
    }
    if (deliveredKnownRef.current === null) {
      // Primera inicialización tras load: leer set persistido. Si hay
      // pedidos delivered que NO están persistidos (caso raro tras
      // limpiar localStorage), los persistimos sin disparar confetti.
      const persisted = readCelebratedSet(celebratedDeliveredKey)
      const merged = new Set<string>([...persisted, ...currentDelivered])
      deliveredKnownRef.current = merged
      if (merged.size !== persisted.size) {
        writeCelebratedSet(celebratedDeliveredKey, merged)
      }
      return
    }
    const before = deliveredKnownRef.current
    const newlyDelivered: string[] = []
    for (const id of currentDelivered) {
      if (!before.has(id)) newlyDelivered.push(id)
    }
    if (newlyDelivered.length === 0) return
    const merged = new Set<string>([...before, ...newlyDelivered])
    deliveredKnownRef.current = merged
    writeCelebratedSet(celebratedDeliveredKey, merged)
    ;(async () => {
      try {
        const { fireConfetti } = await import("../../lib/confetti")
        fireConfetti({ duration: 1800, count: 80 })
      } catch {
        /* noop */
      }
    })()
  }, [deliveryBySale, loading, celebratedDeliveredKey])

  // Celebración al liquidar un apartado (balance 0 por primera vez).
  // Mismo patrón: persistencia en localStorage para evitar re-disparo.
  useEffect(() => {
    if (loading) return
    const currentPaid = new Set<string>()
    for (const o of orders) {
      const balance = Number(o.total ?? 0) - Number(o.paid ?? 0)
      if (balance <= 0 && o.status !== "cancelled" && Number(o.total ?? 0) > 0) {
        currentPaid.add(o.id)
      }
    }
    if (paidKnownRef.current === null) {
      const persisted = readCelebratedSet(celebratedPaidKey)
      const merged = new Set<string>([...persisted, ...currentPaid])
      paidKnownRef.current = merged
      if (merged.size !== persisted.size) {
        writeCelebratedSet(celebratedPaidKey, merged)
      }
      return
    }
    const before = paidKnownRef.current
    const newlyPaid: string[] = []
    for (const id of currentPaid) {
      if (!before.has(id)) newlyPaid.push(id)
    }
    if (newlyPaid.length === 0) return
    const merged = new Set<string>([...before, ...newlyPaid])
    paidKnownRef.current = merged
    writeCelebratedSet(celebratedPaidKey, merged)
    // Marcar visualmente las cards que acaban de transicionar a pagado.
    // Respeta data-motion="off": si Mari (o el SO) pidió sin animaciones,
    // omitimos el ring animado — solo confetti + toast.
    const motionOff =
      typeof document !== "undefined" &&
      document.documentElement.dataset.motion === "off"
    if (!motionOff) {
      setJustPaidIds((prev) => {
        const next = new Set(prev)
        for (const id of newlyPaid) next.add(id)
        return next
      })
      window.setTimeout(() => {
        setJustPaidIds((prev) => {
          const next = new Set(prev)
          for (const id of newlyPaid) next.delete(id)
          return next
        })
      }, 2400)
    }
    ;(async () => {
      try {
        const { fireConfetti } = await import("../../lib/confetti")
        fireConfetti({
          duration: 1600,
          count: 70,
          colors: ["#10b981", "#34d399", "#a7f3d0", "#fbbf24", "#ffffff"],
        })
        const { default: toast } = await import("react-hot-toast")
        toast.success(
          newlyPaid.length === 1
            ? "¡Apartado liquidado! ✨"
            : `${newlyPaid.length} apartados liquidados ✨`,
          { duration: 3500 },
        )
      } catch {
        /* noop */
      }
    })()
  }, [orders, loading, celebratedPaidKey])

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
  // Pago manual del admin: balance/paid cambian → refrescar lista.
  useRealtimeSubscription("payments", scheduleOrdersReload, {
    enabled: !!email,
  })
  // Comprobante aprobado/rechazado: status del proof cambia, también
  // refresca para que el badge de "Pendiente" -> "Aprobado" sea inmediato.
  useRealtimeSubscription("payment_proofs", scheduleOrdersReload, {
    enabled: !!email,
  })

  // Incidencias abiertas del cliente — mantenemos un map sale_id -> count
  // para mostrar badge inline en cada OrderCard.
  const loadOpenTickets = useCallback(async () => {
    if (!email) return
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("sale_id,status")
        .eq("customer_email", email)
        .in("status", ["open", "in_progress"])
        .limit(200)
      if (error || !data) return
      const map: Record<string, number> = {}
      for (const t of data as any[]) {
        if (!t.sale_id) continue
        map[t.sale_id] = (map[t.sale_id] ?? 0) + 1
      }
      if (aliveRef.current) setOpenTicketsBySale(map)
    } catch {
      /* tabla puede no existir todavía */
    }
  }, [email])
  useEffect(() => {
    if (email) loadOpenTickets()
  }, [email, loadOpenTickets])
  useRealtimeSubscription("support_tickets", loadOpenTickets, {
    enabled: !!email,
  })

  // Pull-to-refresh global del layout cliente — escuchamos el evento
  // "mari:pull-refresh" y disparamos un reload local de pedidos.
  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent).detail?.section
      // Aceptamos eventos sin section (genéricos) o con section "shop".
      if (section && section !== "shop" && section !== "orders") return
      loadOrders()
      loadOpenTickets()
    }
    window.addEventListener("mari:pull-refresh", handler as EventListener)
    return () =>
      window.removeEventListener(
        "mari:pull-refresh",
        handler as EventListener,
      )
  }, [loadOrders, loadOpenTickets])

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

  // Refresco INMEDIATO al subir un comprobante (sin esperar realtime).
  useEffect(() => {
    const handler = () => loadOrders()
    window.addEventListener("mari:payment-proof-uploaded", handler)
    return () => window.removeEventListener("mari:payment-proof-uploaded", handler)
  }, [loadOrders])

  /** Counts + monto pendiente + en-camino para el sticky summary. */
  const summary = useMemo(() => {
    const c = {
      all: orders.length,
      active: 0,
      delivered: 0,
      cancelled: 0,
      pendingAmount: 0,
      inRoute: 0,
    }
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
        c.pendingAmount += balance
        if (dStatus === "picked_up") c.inRoute++
      }
    }
    return c
  }, [orders, deliveryBySale])
  const counts = summary

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
   *  ya entregado o pagado completamente. Abre un sheet de preview con
   *  los items + thumbnails, y al confirmar navega al catálogo con
   *  `?reorder=<saleId>` para que ClientShopPage prefille el carrito. */
  const [reorderPreviewId, setReorderPreviewId] = useState<string | null>(null)
  const handleReorder = useCallback((saleId: string) => {
    setReorderPreviewId(saleId)
  }, [])
  const confirmReorder = useCallback(
    (saleId: string) => {
      setReorderPreviewId(null)
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
      <div className="space-y-3 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <div>
          <Skeleton className="h-7 w-40 mb-2" rounded="lg" />
          <Skeleton className="h-3 w-64" rounded="full" />
        </div>
        {/* Skeleton que matchea la nueva card: pill + folio/fecha
            + hero total + barra + strip de fotos + CTA + chips. */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-3.5 space-y-2.5"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-6 w-28" rounded="full" />
              <div className="space-y-1 text-right">
                <Skeleton className="h-2.5 w-16 ml-auto" rounded="full" />
                <Skeleton className="h-2 w-12 ml-auto" rounded="full" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-6 w-24" rounded="md" />
              <Skeleton className="h-3 w-20" rounded="full" />
            </div>
            <Skeleton className="h-1.5 w-full" rounded="full" />
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((k) => (
                <Skeleton key={k} className="w-10 h-10" rounded="lg" />
              ))}
            </div>
            <Skeleton className="h-11 w-full" rounded="xl" />
            <div className="flex gap-1.5">
              <Skeleton className="h-8 w-16" rounded="lg" />
              <Skeleton className="h-8 w-16" rounded="lg" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <PageHeader
        icon={ShoppingBag}
        iconTone="primary"
        title="Mis pedidos"
        subtitle={
          orders.length === 0
            ? "Tu historial de apartados y compras"
            : `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} en tu historial`
        }
        right={
          <button
            type="button"
            onClick={() => setOpenHelp(true)}
            aria-label="Centro de ayuda"
            title="¿Necesitas ayuda?"
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center transition-colors press"
          >
            <LifeBuoy size={14} />
          </button>
        }
      />

      {/* Sticky summary — panorama del estado de los pedidos arriba.
          Se muestra cuando hay 2+ pedidos O cuando hay 1+ con saldo
          pendiente (lo más importante para el cliente). */}
      {(orders.length >= 2 || summary.pendingAmount > 0) && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none">
                Pendiente
              </p>
              <p className="text-base font-black tabular-nums text-amber-600 dark:text-amber-400 leading-tight">
                {formatMoney(summary.pendingAmount)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {summary.inRoute > 0 && (
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {summary.inRoute} en camino
                </span>
              )}
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest">
                {summary.active} activos
              </span>
            </div>
          </div>
        </div>
      )}

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

      {/* Empty state contextual por filtro — microcopy diferenciado. */}
      {filteredOrders.length === 0 && (
        <EmptyStateIllustration
          variant="no-orders"
          title={
            filter === "active"
              ? orders.length === 0
                ? "Tu primer pedido te está esperando"
                : "Todo al corriente ✨"
              : filter === "delivered"
              ? "Aún no recibes nada 📦"
              : filter === "cancelled"
              ? "Sin cancelaciones 💖"
              : "Aún no tienes pedidos"
          }
          subtitle={
            filter === "active"
              ? orders.length === 0
                ? "Cuando apartes algo del catálogo, aparecerá aquí con su seguimiento."
                : "Ya no tienes nada pendiente. ¿Armar un nuevo pedido?"
              : filter === "delivered"
              ? "Tus entregas completadas se guardan aquí para que las consultes cuando quieras."
              : filter === "cancelled"
              ? "Esperemos que nunca tengas que cancelar."
              : "Arma tu carrito desde el catálogo y aparecerá aquí."
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
        const cancel = canCancelSale(rules, o as any)
        const isCompleted =
          paid &&
          o.status !== "cancelled" &&
          (delivery?.status === "delivered" || !delivery)
        // Permitir reseñar: por default solo cuando isCompleted (entregado
        // o pagado sin delivery). Si rule.reviews_on_paid_enabled está ON,
        // basta con que esté pagado y no cancelado (sin esperar entrega).
        const canReview =
          rules.reviews_enabled &&
          o.status !== "cancelled" &&
          (isCompleted || (rules.reviews_on_paid_enabled && paid))

        // Diferenciación visual: peso por monto, tono por estado.
        const isPremium = safeTotal >= 1000
        const isInRoute = delivery?.status === "picked_up"
        const isPending = !paid && o.status !== "cancelled"
        const isClosed =
          o.status === "cancelled" ||
          (!claim.allowed &&
            (delivery?.status === "delivered" ||
              (paid && !delivery)))
        // showInteractive YA NO depende de isCompact (eso escondía
        // chips críticos como "Pagar saldo" en pedidos pendientes <$200).
        // Solo se oculta el toolbar para pedidos cerrados/cancelados
        // (que tienen su propio mini-toolbar abajo).
        const showInteractive = !isClosed

        // Capa visual: el closed se aplana, el premium gana peso, el envio activo respira.
        // `relative` siempre — los chips esquineros viven en absolute.
        const containerClass = isClosed
          ? "relative bg-white/60 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/60 opacity-75 dark:opacity-60 shadow-none rounded-2xl p-3.5 transition-all duration-200"
          : isPremium
            ? "relative bg-gradient-to-br from-primary/[0.06] via-white to-white dark:from-primary/[0.10] dark:via-slate-800/60 dark:to-slate-800/60 border-2 border-primary/20 dark:border-primary/30 shadow-sm rounded-2xl p-3.5 transition-all duration-200"
            : isInRoute
              ? "relative bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 ring-2 ring-emerald-400/60 dark:ring-emerald-500/50 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 rounded-2xl p-3.5 transition-all duration-200"
              : isPending
                ? "relative bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 border-l-4 border-l-amber-400 rounded-2xl p-3.5 transition-all duration-200"
                : "relative bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-3.5 transition-all duration-200"

        const isCancelled = o.status === "cancelled"
        const payPct = Math.min(
          100,
          Math.round((safePaid / Math.max(1, safeTotal)) * 100),
        )
        const itemThumbs = itemsBySale[o.id] ?? []
        const totalItemsQty = itemThumbs.reduce(
          (acc, t) => acc + (t.qty || 0),
          0,
        )
        const isJustPaid = justPaidIds.has(o.id)

        return (
          <motion.div
            key={o.id}
            initial={false}
            animate={
              isJustPaid
                ? {
                    opacity: 1,
                    y: 0,
                    boxShadow: [
                      "0 0 0 0 rgba(16,185,129,0)",
                      "0 0 0 8px rgba(16,185,129,0.35)",
                      "0 0 0 0 rgba(16,185,129,0)",
                    ],
                  }
                : { opacity: 1, y: 0 }
            }
            transition={isJustPaid ? { duration: 1.6, ease: "easeOut" } : undefined}
            className={containerClass}
          >
            {/* Chips esquineros — flotan SIN clip (sin contain:paint).
                Premium gana prioridad sobre "En camino". */}
            {isPremium && !isClosed && (
              <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white text-[8px] font-black uppercase tracking-widest shadow-md z-10">
                ✨ Premium
              </span>
            )}
            {isInRoute && !isPremium && (
              <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest shadow-md flex items-center gap-1 z-10">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                En camino
              </span>
            )}

            {/* HEADER: status pill (izq) + folio/fecha (der). */}
            <div className="flex items-start justify-between gap-2 mb-2.5">
              <OrderStatusPill
                paid={paid}
                balance={balance}
                delivery={delivery}
                cancelled={isCancelled}
              />
              <div className="text-right shrink-0 leading-tight">
                <p className="text-[10px] font-black tabular-nums text-slate-500 dark:text-slate-400">
                  #{shortId(o.id)}
                </p>
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tabular-nums uppercase tracking-wider mt-0.5">
                  {formatDate(o.created_at)}
                </p>
              </div>
            </div>

            {/* HERO — cuando está completado mostramos 'Pagaste $X'
                en grande (lo que YA pagó, no el total). Si está pendiente
                mostramos el total + cuánto falta. */}
            <div className="flex items-baseline gap-2 flex-wrap mb-2">
              {isCompleted ? (
                <>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 leading-none">
                    Pagaste
                  </span>
                  <span className="text-[22px] font-black tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
                    {formatMoney(safePaid)}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={`text-[22px] font-black tabular-nums leading-none ${
                      paid
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {formatMoney(o.total)}
                  </span>
                  {!paid && !isCancelled && (
                    <span className="text-[11px] font-black tabular-nums text-amber-600 dark:text-amber-400 leading-none">
                      · faltan {formatMoney(balance)}
                    </span>
                  )}
                  {paid && !isCancelled && !isCompleted && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 leading-none">
                      · liquidado
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Progreso slim de pago: solo cuando hay saldo. */}
            {!paid && !isCancelled && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      background:
                        "linear-gradient(90deg, var(--brand-from), var(--brand-to))",
                      width: `${payPct}%`,
                    }}
                  />
                </div>
                <span className="text-[9px] font-black tabular-nums text-slate-500 dark:text-slate-400 shrink-0 w-9 text-right">
                  {payPct}%
                </span>
              </div>
            )}

            {/* Tracker delivery — solo cuando hay comanda Y el pedido
                NO está completado (en isCompleted el tracker sólo añade
                ruido visual; ya entregó, ya está). */}
            {delivery && !isCompleted && (
              <div className="mb-3">
                <OrderProgressTracker
                  total={safeTotal}
                  paid={safePaid}
                  balance={balance}
                  delivery={delivery}
                />
              </div>
            )}

            {/* Mini strip de productos: hasta 4 thumbs solapados +
                contador "+N" si hay más. Da identidad visual a la card. */}
            {itemThumbs.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex -space-x-2">
                  {itemThumbs.slice(0, 4).map((t, i) => (
                    <div
                      key={`${o.id}-thumb-${i}`}
                      className="w-10 h-10 aspect-square rounded-xl bg-white dark:bg-slate-800 ring-2 ring-white dark:ring-slate-900 overflow-hidden flex items-center justify-center text-slate-300 p-0.5 border border-slate-100 dark:border-slate-700"
                      title={`${t.qty}× ${t.product_name ?? ""}${t.variant_name ? " · " + t.variant_name : ""}`}
                    >
                      {t.image_url ? (
                        <img
                          src={imageAvatar(t.image_url) || t.image_url}
                          alt={t.product_name ?? ""}
                          loading="lazy"
                          decoding="async"
                          width={80}
                          height={80}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ShoppingBag size={14} />
                      )}
                    </div>
                  ))}
                  {itemThumbs.length > 4 && (
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 ring-2 ring-white dark:ring-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500 dark:text-slate-300">
                      +{itemThumbs.length - 4}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-tight">
                  {totalItemsQty} {totalItemsQty === 1 ? "pieza" : "piezas"}
                  <span className="text-slate-400">
                    {" · "}
                    {itemThumbs.length}{" "}
                    {itemThumbs.length === 1 ? "producto" : "productos"}
                  </span>
                </span>
              </div>
            )}

            {/* Badge inline si hay incidencias abiertas. */}
            {(openTicketsBySale[o.id] ?? 0) > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setSupportSaleId(o.id)
                  setOpenSupport(true)
                }}
                className="mb-2 w-full flex items-center justify-between gap-2 px-3 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest press"
              >
                <span className="flex items-center gap-1.5">
                  <LifeBuoy size={11} />
                  {openTicketsBySale[o.id] === 1
                    ? "1 incidencia abierta"
                    : `${openTicketsBySale[o.id]} incidencias abiertas`}
                </span>
                <span className="text-[9px] font-bold opacity-80">Ver mensajes</span>
              </button>
            )}

            {/* ACCIONES — dos variantes según estado:
                A) isCompleted (pagado + entregado): vista CELEBRATORIA
                   con un solo CTA emerald "Volver a pedir" + chip Calificar
                   + link discreto al ticket. Sin Smart Order Actions ni
                   chips redundantes.
                B) Resto (pendiente, en camino, etc.): SmartOrderActions
                   + toolbar completa como antes. */}
            {showInteractive && isCompleted && (
              <div className="space-y-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleReorder(o.id)
                  }}
                  className="relative overflow-hidden w-full h-11 rounded-xl flex items-center justify-center gap-2 text-white text-[11px] font-black uppercase tracking-widest shadow-[0_10px_30px_-10px_rgba(16,185,129,0.5)] press-hard bg-gradient-to-br from-emerald-500 to-teal-500"
                >
                  <RotateCcw size={13} />
                  Volver a pedir
                </motion.button>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setTicketToken(o.public_token ?? o.id)
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-primary press"
                  >
                    Ver ticket →
                  </button>
                  <div className="flex items-center gap-1.5">
                    {canReview && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openRateOrder(o.id)
                        }}
                        className="h-8 px-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press"
                        title="Calificar productos"
                      >
                        <Star size={11} />
                        Calificar
                      </button>
                    )}
                    {o.public_token && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setQrSaleId(o.id)
                        }}
                        className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white flex items-center justify-center shadow-[0_4px_12px_-4px_rgba(236,72,153,0.5)] press"
                        title="QR del pedido (mostrar a Mari o repartidor)"
                        aria-label="QR del pedido"
                      >
                        <QrCode size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PRIMARY CTA — usa SmartOrderActions cuando NO está completado. */}
            {showInteractive && !isCompleted && (
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
                hideSecondary
                onPay={() => setPaymentOrder(o)}
                onViewTicket={() => setTicketToken(o.public_token ?? o.id)}
                onSupport={() => {
                  setSupportSaleId(o.id)
                  setOpenSupport(true)
                }}
              />
            )}

            {/* TOOLBAR SECUNDARIA — solo para pedidos NO completados.
                Los completados ya tienen su acción simplificada arriba. */}
            {showInteractive && !isCompleted && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setTicketToken(o.public_token ?? o.id)
                  }}
                  className="h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/70 hover:bg-slate-100 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press"
                  title="Ver ticket detallado"
                >
                  <ShoppingBag size={11} />
                  Ticket
                </button>
                {o.public_token && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setQrSaleId(o.id)
                    }}
                    className="h-8 px-2.5 rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-[0_4px_12px_-4px_rgba(236,72,153,0.5)] press"
                    title="QR del pedido (mostrar a Mari o repartidor)"
                  >
                    <QrCode size={11} />
                    QR
                  </button>
                )}
                {claim.allowed && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSupportSaleId(o.id)
                      setOpenSupport(true)
                    }}
                    className="h-8 px-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press"
                    title="Reportar un problema"
                  >
                    <LifeBuoy size={11} />
                    Reportar
                  </button>
                )}
                {canReview && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      openRateOrder(o.id)
                    }}
                    className="h-8 px-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press"
                    title="Calificar productos"
                  >
                    <Star size={11} />
                    Calificar
                  </button>
                )}
                {rules.client_can_self_cancel && cancel.allowed && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const reason = await promptDialog({
                        title: "Cancelar este pedido",
                        description:
                          "Cuéntanos por qué cancelas. Si abonaste algo, te contactaremos para devolverlo.",
                        placeholder:
                          "Ej. Me equivoqué de tono, ya no lo necesito…",
                        confirmLabel: "Sí, cancelar pedido",
                        multiline: true,
                      })
                      if (reason === null) return
                      const snapshot = orders
                      runWithUndo({
                        message: "Pedido cancelado",
                        optimisticUI: () =>
                          setOrders((prev) =>
                            prev.filter((x) => x.id !== o.id),
                          ),
                        revertUI: () => setOrders(snapshot),
                        commit: async () => {
                          await cancelSale(o.id, reason || null)
                        },
                      })
                    }}
                    className="h-8 px-2.5 rounded-lg bg-transparent text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ml-auto press"
                    title="Cancelar pedido"
                  >
                    <XCircle size={11} />
                    Cancelar
                  </button>
                )}
              </div>
            )}

            {/* Micro-info al pie — SOLO cuando hay claim activo (mostrar
                cuánto tiempo queda para reportar). Cuando ya no se puede
                reportar y está todo OK, no mostramos nada para no
                ensuciar la card. */}
            {!isCompleted && claim.allowed && Number.isFinite(claim.remainingMs) && (
              <p className="mt-2 text-[10px] text-slate-400 italic">
                ⏳ {formatRemaining(claim.remainingMs)} para reportar
              </p>
            )}

            {/* Mini-toolbar para pedidos cerrados (cancelados o sin
                ventana de soporte): al menos Ticket + QR siguen accesibles
                para consultar historial. */}
            {isClosed && (
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setTicketToken(o.public_token ?? o.id)
                  }}
                  className="flex-1 h-8 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/70 hover:bg-slate-100 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1 press"
                  title="Ver ticket"
                >
                  <ShoppingBag size={11} />
                  Ver ticket
                </button>
                {o.public_token && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setQrSaleId(o.id)
                    }}
                    className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-white flex items-center justify-center shadow-[0_4px_12px_-4px_rgba(236,72,153,0.5)] press"
                    title="QR del pedido"
                    aria-label="QR del pedido"
                  >
                    <QrCode size={11} />
                  </button>
                )}
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

      {/* Drawer para calificar los productos de un pedido entregado. */}
      <RateOrderProductsDrawer
        open={!!rateOrderId}
        onClose={() => setRateOrderId(null)}
        saleId={rateOrderId}
      />

      {/* Sheet de preview para reordenar: muestra los items del pedido
          original antes de mandar al cliente al catálogo. */}
      <ReorderPreviewSheet
        open={!!reorderPreviewId}
        items={reorderPreviewId ? itemsBySale[reorderPreviewId] ?? [] : []}
        onCancel={() => setReorderPreviewId(null)}
        onConfirm={() => reorderPreviewId && confirmReorder(reorderPreviewId)}
      />

      {/* QR del pedido — modal con código QR que codifica el URL público
          del ticket. El cliente lo muestra a Mari (caja) o al repartidor
          para que escaneen y abran TODA la info del pedido (items, dirección,
          monto, status) sin teclear nada. */}
      <OrderQrModal
        open={!!qrSaleId}
        sale={qrSaleId ? orders.find((o) => o.id === qrSaleId) ?? null : null}
        onClose={() => setQrSaleId(null)}
      />
    </div>
  )
}

/**
 * OrderStatusBanner — hero del estatus del pedido.
 *
 * Estilo Amazon/Mercado Libre: un banner prominente arriba de la card
 * que comunica el estado actual en lenguaje natural (no solo un chip).
 *
 * Estados cubiertos (por prioridad):
 *   - Cancelado → rose
 *   - Entregado → emerald + fecha de entrega
 *   - En camino (picked_up) → sky + nombre del repartidor
 *   - Por enviar (sent/draft) → amber (delivery preparada)
 *   - Pagado sin delivery → emerald (pickup en tienda)
 *   - Con saldo pendiente → amber con monto
 *
 * NO redunda con el tracker de abajo: el tracker muestra PROGRESO,
 * el banner muestra CONTEXTO (qué pasó / qué falta).
 */

/**
 * Variante compacta tipo "pill" del status para la card pro.
 * Solo dot + título — el contexto extendido (subtitle) se eliminó porque
 * la nueva card ya muestra el saldo inline junto al total.
 */
function OrderStatusPill({
  paid,
  balance,
  delivery,
  cancelled,
}: {
  paid: boolean
  balance: number
  delivery: MyDelivery | null
  cancelled: boolean
}) {
  let title = "Pedido recibido"
  let toneCls =
    "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
  let dotCls = "bg-slate-400"

  if (cancelled) {
    title = "Cancelado"
    toneCls = "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
    dotCls = "bg-slate-400"
  } else if (delivery?.status === "delivered") {
    title = "Entregado"
    toneCls = "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    dotCls = "bg-emerald-500"
  } else if (delivery?.status === "picked_up") {
    title = "En camino"
    toneCls = "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300"
    dotCls = "bg-sky-500 animate-pulse"
  } else if (delivery?.status === "sent" || delivery?.status === "draft") {
    title = "Preparando"
    toneCls = "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
    dotCls = "bg-amber-500"
  } else if (paid && !delivery) {
    title = "Pagado · recoger"
    toneCls = "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    dotCls = "bg-emerald-500"
  } else if (balance > 0) {
    title = "Saldo pendiente"
    toneCls = "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
    dotCls = "bg-amber-500"
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[10px] font-black uppercase tracking-widest leading-none ${toneCls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`}
        aria-hidden
      />
      {title}
    </span>
  )
}

/**
 * Modal con el QR del pedido individual. Codifica el URL público del
 * ticket (`/ticket/{token}`) — al escanearlo, Mari o el repartidor
 * abren toda la información del pedido (cliente, items, dirección,
 * monto, status) sin teclear nada.
 *
 * Cada pedido tiene SU propio QR — distinto al QR del usuario (que
 * codifica solo el email para identificación general en caja).
 */
function OrderQrModal({
  open,
  sale,
  onClose,
}: {
  open: boolean
  sale: MyOrder | null
  onClose: () => void
}) {
  if (typeof document === "undefined") return null
  if (!open || !sale) return null
  const token = sale.public_token ?? sale.id
  const ticketUrl =
    typeof window !== "undefined" ? `${window.location.origin}/ticket/${token}` : ""
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(
    ticketUrl,
  )}`
  const balance = Math.max(
    0,
    (Number(sale.total) || 0) - (Number(sale.paid) || 0),
  )
  return createPortal(
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        aria-hidden
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 12 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-xs rounded-3xl bg-white dark:bg-slate-900 shadow-premium overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none">
              QR del pedido
            </p>
            <p className="text-sm font-black tracking-tight mt-0.5 flex items-center gap-1.5">
              <QrCode size={14} className="text-primary" />
              {shortId(sale.id)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
          >
            <XIcon size={14} />
          </button>
        </div>
        <div className="px-5 pb-5 flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <img
              src={qrSrc}
              alt="QR de mi pedido"
              width={240}
              height={240}
              className="w-60 h-60 object-contain"
              loading="lazy"
            />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">
              {formatMoney(sale.total)}
            </p>
            {balance > 0 ? (
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                Faltan {formatMoney(balance)}
              </p>
            ) : (
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Liquidado ✓
              </p>
            )}
          </div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 text-center leading-snug">
            Muéstralo a Mari o al repartidor — abren tu pedido completo
            sin teclear nada.
          </p>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

/**
 * Bottom sheet de preview para reordenar. Muestra los items del pedido
 * original con thumbnails + cantidades, permite confirmar (navega al
 * catálogo con ?reorder=...) o cancelar.
 *
 * Render via portal a document.body para escapar de cualquier
 * stacking context del layout cliente.
 */
function ReorderPreviewSheet({
  open,
  items,
  onCancel,
  onConfirm,
}: {
  open: boolean
  items: OrderItemThumb[]
  onCancel: () => void
  onConfirm: () => void
}) {
  if (typeof document === "undefined") return null
  if (!open) return null
  const totalQty = items.reduce((a, t) => a + (t.qty || 0), 0)
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28 }}
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] pb-safe max-h-[85vh] flex flex-col shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.45)]"
      >
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
        <div className="px-5 pb-3 shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black leading-none">
            Reordenar
          </p>
          <h3 className="text-lg font-black tracking-tight mt-1">
            ¿Repetir este pedido?
          </h3>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">
            Te llevamos al catálogo con estos productos pre-cargados en el
            carrito.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3 scroll-container-ios">
          {items.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <ShoppingBag size={28} className="mx-auto mb-2" />
              <p className="text-xs font-bold">
                Cargando productos del pedido…
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((t, i) => (
                <div
                  key={`reorder-${i}`}
                  className="flex items-center gap-3 p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"
                >
                  <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900/40 overflow-hidden flex items-center justify-center text-slate-300 shrink-0">
                    {t.image_url ? (
                      <img
                        src={t.image_url}
                        alt={t.product_name ?? ""}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingBag size={16} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black truncate">
                      {t.product_name ?? "Producto"}
                    </p>
                    {t.variant_name && (
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                        {t.variant_name}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-black tabular-nums text-primary shrink-0">
                    ×{t.qty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {items.length} {items.length === 1 ? "producto" : "productos"} ·{" "}
              {totalQty} {totalQty === 1 ? "pieza" : "piezas"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black uppercase tracking-widest press"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={items.length === 0}
              className="flex-[1.4] h-11 rounded-2xl bg-brand text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-bloom disabled:opacity-50 press-hard"
            >
              <RotateCcw size={13} />
              Sí, al carrito
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

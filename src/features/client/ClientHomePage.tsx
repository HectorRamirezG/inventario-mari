/**
 * ClientHomePage — Pantalla "Inicio" / "Beauty's Me".
 *
 * Está pensada para alivianar `ClientShopPage` (que se había vuelto un
 * mega-componente con hero, stories, recientemente vistos, producto del día,
 * banner de instalación, etc. ANTES del propio catálogo). Toda esa parte
 * "editorial / engagement" vive ahora aquí, mientras que `ClientShopPage`
 * se enfoca en el catálogo + buscador + filtros + grid.
 *
 * Navegación:
 *   - Cuando el usuario toca un producto (del día, recientemente vistos)
 *     redirigimos a `/?p=PRODUCT_ID`. `ClientShopPage` detecta ese query
 *     param y abre el BuySheet correspondiente.
 *
 * Datos:
 *   - Cargamos `products + variants` con la misma query liviana que la
 *     tienda (SELECT acotado). Sin paginar: el set de productos activos
 *     suele ser chico y se cachea en memoria.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Sparkles,
  PiggyBank,
  MessageSquare,
  Bell,
  ChevronRight,
  Wallet,
  Truck,
  Gift,
  AlertCircle,
  X,
  RotateCcw,
} from "lucide-react"
import { motion } from "framer-motion"

import { supabase } from "../../lib/supabase"
import { useAuth } from "../../lib/useAuth"
import { useBusinessRules } from "../settings/businessRulesService"
import { useNotifications } from "../notifications/notificationsService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import { useFeedback } from "../../lib/useFeedback"
import { formatMoney, formatRelative } from "../../lib/format"

import ClientHero from "../../components/ui/ClientHero"
import StoriesBar from "../stories/StoriesBar"
import RecentlyViewedRow from "../../components/ui/RecentlyViewedRow"
import ReviewStoriesBar from "../../components/ui/ReviewStoriesBar"
import ProductOfTheDay from "../../components/ui/ProductOfTheDay"
import Skeleton from "../../components/ui/Skeleton"
import MyPaletteSection from "./MyPaletteSection"
import ProductOfMonthCard from "../dashboard/ProductOfMonthCard"

interface PublicVariant {
  id: string
  product_id: string
  variant_name: string | null
  sku: string | null
  stock: number
  price: number | null
  price_menudeo: number | null
  price_medio: number | null
  price_mayoreo: number | null
  image_url: string | null
  image_urls: string[] | null
}

interface PublicProduct {
  id: string
  name: string
  category: string | null
  image_url: string | null
  created_at: string | null
  variants: PublicVariant[]
}

export default function ClientHomePage() {
  const navigate = useNavigate()
  const { email: authEmail, fullName: authName, session } = useAuth()
  const isLogged = !!session
  const bRules = useBusinessRules()

  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)

  const aliveRef = useRef(true)

  const loadCatalog = useCallback(async () => {
    const { data: prods } = await supabase
      .from("products")
      .select("id,name,category,image_url,created_at")
      .eq("is_active", true)
      .order("name")
    const { data: vars } = await supabase
      .from("variants")
      .select(
        "id,product_id,variant_name,sku,stock,price,price_menudeo,price_medio,price_mayoreo,image_url,image_urls",
      )
      .eq("is_active", true)
    if (!aliveRef.current) return
    const byProduct: Record<string, PublicVariant[]> = {}
    ;(vars ?? []).forEach((v: any) => {
      if (!byProduct[v.product_id]) byProduct[v.product_id] = []
      byProduct[v.product_id].push({
        ...v,
        image_url: v.image_url ?? null,
        image_urls: v.image_urls ?? null,
      } as PublicVariant)
    })
    setProducts(
      (prods ?? []).map((p: any) => ({
        ...(p as Omit<PublicProduct, "variants">),
        image_url: p.image_url ?? null,
        variants: byProduct[p.id] ?? [],
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    aliveRef.current = true
    loadCatalog()
    return () => {
      aliveRef.current = false
    }
  }, [loadCatalog])

  // Realtime: el hub multiplex despacha eventos al loader debounced.
  const scheduleCatalogReload = useDebouncedCallback(() => loadCatalog(), 800)
  useRealtimeSubscription("products", scheduleCatalogReload)
  useRealtimeSubscription("variants", scheduleCatalogReload)

  // Redirige a la tienda con el producto seleccionado para abrir el BuySheet.
  const openProduct = (productId: string) => {
    navigate(`/?p=${encodeURIComponent(productId)}`)
  }

  return (
    <div className="space-y-3 pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <ClientHero
        customerName={authName || (authEmail ? authEmail.split("@")[0] : "")}
        isLogged={isLogged}
      />

      {/* CLIENTE LOGUEADO: info personal ARRIBA. Mensajes + saldos.
          Premios y Reseñas FUERON QUITADOS de aqui (Mari: 'lo que ya
          hay atajo en el +, quitalo'). Ya viven en el ActionHub Mi cuenta. */}

      {/* Acciones pendientes (PRIORIDAD MÁXIMA) — saldos por pagar,
          deseos disponibles, pedidos en camino. Solo aparece si hay
          algo accionable. Reduce fricción: lo importante PRIMERO. */}
      {isLogged && <PriorityActionsSection />}

      {isLogged && <MyMessagesSection />}
      {isLogged && <MySavingsSection />}

      {/* Paleta personal del cliente: tonos comprados + sugerencias de
          reposición + cross-sell. Se auto-oculta sin historial. */}
      {isLogged && <MyPaletteSection />}

      {/* Stories de resenias — marketing organico. Banda horizontal con
          las mejores resenias con foto, estilo Instagram stories. Click
          en una abre el producto en la tienda. Solo aparece si hay >=3. */}
      <ReviewStoriesBar />

      {/* Productos vistos recientemente */}
      <RecentlyViewedRow onOpen={openProduct} />

      {/* Producto del mes — ganador automático del mes anterior. Se
          auto-oculta cuando no hay ventas. Clickeable: navega via ?q= */}
      <ProductOfMonthCard asLink />

      {/* Producto del día */}
      {loading ? (
        <div className="my-3 rounded-3xl overflow-hidden">
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <ProductOfTheDay
          products={products as any}
          onOpen={(p) => openProduct((p as any).id)}
        />
      )}

      {/* Boton 'Ir al catalogo' QUITADO: Mari ya tiene el tab Tienda en
          el dock y un chip Tienda en el + Mi cuenta. Saturaba sin
          agregar valor nuevo. */}

      {/* Stories al final: solo aparece si hay historias activas
          (StoriesBar retorna null cuando está vacía). */}
      <StoriesBar enabled={bRules.stories_enabled} />

      {/* MyReviewsCard tambien QUITADO: Mari pide no repetir. La accion
          de calificar productos vive en el ActionHub (+) > Mi cuenta >
          Mis resenas con badge de pendientes. */}
    </div>
  )
}

/* ============================================================== */
/* Sub-secciones                                                    */
/* ============================================================== */

function MyMessagesSection() {
  // Las notificaciones del cliente ya viven en `useNotifications`. Aquí
  // mostramos un resumen visual + acceso rápido al bell del header.
  const { items, unread, markAsRead } = useNotifications()
  const navigate = useNavigate()
  const { tap } = useFeedback()
  const latest = items.slice(0, 3)

  /** Misma lógica que `NotificationBell.resolveTarget` para cliente —
   *  resumido en un helper local para no duplicar el switch enorme.
   *  Si una notif no matchea ningún caso, fallback a /mis-pedidos si
   *  hay sale_id; si no, no hace nada (mejor que tap muerto). */
  function routeFor(n: typeof latest[number]): string | null {
    const meta = (n.metadata ?? {}) as Record<string, any>
    const saleId = meta.sale_id as string | undefined
    const publicToken = meta.public_token as string | undefined
    const variantId = meta.variant_id as string | undefined

    switch (n.type) {
      case "payment_approved":
      case "payment_rejected":
      case "proof_rejected":
      case "payment_proof_rejected":
      case "sale_cancelled":
      case "price_adjusted":
      case "layaway_extension":
      case "payment_proof_reminder":
        return "/mis-pedidos"
      case "sale_paid":
      case "payment_added":
      case "new_layaway":
      case "delivery_picked_up":
      case "delivery_delivered":
        if (publicToken) return `/ticket/${publicToken}`
        if (saleId) return `/ticket/${saleId}`
        return "/mis-pedidos"
      case "support_ticket":
      case "support_resolved":
        return "/mis-reportes"
      case "wish_created":
      case "wish_status":
      case "wish_available":
        return "/mis-deseos"
      case "stock_back":
        if (variantId) return `/?variant=${variantId}`
        if (saleId) return "/mis-pedidos"
        return "/"
      default:
        // Fallback: si trae sale_id, vale ir a la lista de pedidos.
        // Mejor que un tap muerto que confunde al cliente.
        if (publicToken) return `/ticket/${publicToken}`
        if (saleId) return "/mis-pedidos"
        return null
    }
  }

  function handleClick(n: typeof latest[number]) {
    const route = routeFor(n)
    tap()
    if (!n.read_at) markAsRead(n.id).catch(() => {})
    if (route) navigate(route)
  }

  if (items.length === 0) {
    // Cuando no hay mensajes, NO mostramos el placeholder. Mari pidió
    // quitar la repetición: si arriba ya hay PriorityActions, mostrar
    // además "Sin mensajes nuevos" se siente redundante. Si genuinamente
    // no hay nada accionable, el cliente ya ve el catálogo abajo.
    return null
  }

  return (
    <section className="my-3">
      <header className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <Bell size={12} className="text-primary" />
          Mensajes
          {unread > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-black">
              {unread}
            </span>
          )}
        </h2>
        {items.length > 3 && (
          <button
            type="button"
            onClick={() => {
              // El bell vive en el header del shell. Disparamos un evento
              // para que se abra (handler global ya existe en App.tsx).
              window.dispatchEvent(new CustomEvent("notif:open-bell"))
            }}
            className="text-[10px] font-black uppercase tracking-widest text-primary hover:opacity-80 flex items-center gap-1 press"
          >
            Ver todos <ChevronRight size={11} />
          </button>
        )}
      </header>
      <div className="space-y-2">
        {latest.map((n) => {
          const routeable = !!routeFor(n)
          return (
            <motion.button
              key={n.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              type="button"
              onClick={() => handleClick(n)}
              disabled={!routeable}
              className={`nudge-on-hover w-full text-left rounded-2xl p-3 border transition-colors press ${
                n.read_at
                  ? "bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  : "bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/30 hover:bg-primary/10"
              } ${!routeable ? "cursor-default opacity-90" : ""}`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-black leading-tight">{n.title}</p>
                  {n.body && (
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                </div>
                {routeable && (
                  <ChevronRight
                    size={14}
                    className="nudge-arrow text-slate-400 shrink-0 mt-0.5"
                  />
                )}
              </div>
            </motion.button>
          )
        })}
      </div>
    </section>
  )
}

/* ============================================================== */
/* PriorityActionsSection                                          */
/* ============================================================== */

interface PriorityItem {
  id: string
  icon: typeof Wallet
  tone: "amber" | "violet" | "emerald"
  title: string
  caption: string
  href: string
}

const TONE_CARD: Record<PriorityItem["tone"], string> = {
  amber:
    "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-100",
  violet:
    "bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30 text-violet-900 dark:text-violet-100",
  emerald:
    "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-100",
}

const TONE_ICON_BG: Record<PriorityItem["tone"], string> = {
  amber: "bg-amber-500 text-white",
  violet: "bg-violet-500 text-white",
  emerald: "bg-emerald-500 text-white",
}

/**
 * Acciones pendientes del cliente (lo MÁS importante hoy). Aparece
 * arriba del feed cuando hay:
 *  - Saldos por pagar (pedidos con balance > 0 y no cancelados)
 *  - Pedidos "en camino" (delivery_notes.status='picked_up')
 *  - Deseos disponibles (wishes.status='available')
 *
 * Si no hay nada urgente, no renderiza nada (silent). Refresh
 * realtime al cambiar sales/wishes/delivery_notes.
 *
 * Cada card puede dismissarse con × — se oculta por 24h via
 * localStorage. Útil cuando "ya sé que tengo saldo, pago mañana".
 * Tras 24h reaparece para que no se olvide.
 */
const DISMISS_KEY = "mari:priority-dismissed:v1"
const DISMISS_TTL_MS = 24 * 3600 * 1000

function readDismissed(): Record<string, number> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, number>
    // Limpia los expirados al leer para que el storage no crezca infinito.
    const now = Date.now()
    const cleaned: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && now - v < DISMISS_TTL_MS) {
        cleaned[k] = v
      }
    }
    return cleaned
  } catch {
    return {}
  }
}

function writeDismissed(map: Record<string, number>) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(map))
  } catch {
    /* noop */
  }
}

function PriorityActionsSection() {
  const { email } = useAuth()
  const bRules = useBusinessRules()
  const [items, setItems] = useState<PriorityItem[]>([])
  const [dismissed, setDismissed] = useState<Record<string, number>>(() =>
    readDismissed(),
  )

  function dismissItem(id: string) {
    const next = { ...dismissed, [id]: Date.now() }
    setDismissed(next)
    writeDismissed(next)
  }

  const load = useCallback(async () => {
    if (!email) {
      setItems([])
      return
    }
    const out: PriorityItem[] = []

    // 1) Saldos por pagar. Limit 5 para no saturar.
    const { data: salesPending } = await supabase
      .from("sales")
      .select("id,balance,public_token,created_at,status")
      .eq("customer_email", email.toLowerCase())
      .gt("balance", 0)
      .neq("status", "cancelled")
      .order("balance", { ascending: false })
      .limit(5)
    for (const s of (salesPending ?? []) as any[]) {
      const bal = Number(s.balance) || 0
      if (bal <= 0) continue
      const folio = String(s.id).slice(0, 8).toUpperCase()
      out.push({
        id: `saldo-${s.id}`,
        icon: Wallet,
        tone: "amber",
        title: `Saldo pendiente: ${formatMoney(bal)}`,
        // Antes esta copy se repetía en cada saldo "Liquida tu pedido o
        // reporta un pago" — cuando había 3 saldos se leían idénticas.
        // Ahora cada card muestra su folio para diferenciarse.
        caption: `Folio #${folio} · toca para abonar`,
        href: `/mis-pedidos`,
      })
    }

    // 2) Pedidos en camino. Best-effort: si la tabla no existe la
    // query falla silenciosamente y no agregamos nada.
    try {
      const { data: salesIdsRes } = await supabase
        .from("sales")
        .select("id,public_token")
        .eq("customer_email", email.toLowerCase())
      const map = new Map<string, string>(
        ((salesIdsRes ?? []) as any[]).map((r) => [r.id, r.public_token ?? r.id]),
      )
      const ids = Array.from(map.keys())
      if (ids.length > 0) {
        const { data: notes } = await supabase
          .from("delivery_notes")
          .select("id,sale_id,status,driver_name,picked_up_at")
          .in("sale_id", ids)
          .eq("status", "picked_up")
          .limit(3)
        for (const n of (notes ?? []) as any[]) {
          const token = map.get(n.sale_id)
          if (!token) continue
          out.push({
            id: `delivery-${n.id}`,
            icon: Truck,
            tone: "violet",
            title: `${n.driver_name ? n.driver_name + " va " : "Va "}en camino a tu domicilio`,
            caption: n.picked_up_at
              ? `Salió ${formatRelative(n.picked_up_at)}`
              : "Sigue el progreso en tu pedido",
            href: `/mis-pedidos`,
          })
        }
      }
    } catch {
      /* tabla delivery_notes puede no estar */
    }

    // 3) Deseos disponibles — el admin marcó "available" para algo
    // que pediste. Acción: ir al catálogo a buscarlo.
    try {
      const { data: wishes } = await supabase
        .from("wishes")
        .select("id,title")
        .eq("customer_email", email.toLowerCase())
        .eq("status", "available")
        .order("resolved_at", { ascending: false })
        .limit(3)
      for (const w of (wishes ?? []) as any[]) {
        out.push({
          id: `wish-${w.id}`,
          icon: Gift,
          tone: "emerald",
          title: `Llegó: ${w.title}`,
          caption: "Tu deseo ya está en la tienda — pásalo a tu carrito",
          href: "/mis-deseos",
        })
      }
    } catch {
      /* noop */
    }

    // 4) Repetir último pedido pagado (1-tap reorder). Solo si el
    //    admin habilitó `reorder_banner_enabled` y existe un pedido
    //    pagado en los últimos 90 días. Es el único priority item que
    //    invita a comprar de nuevo, no a resolver un pendiente.
    if (bRules.reorder_banner_enabled) {
      try {
        const since = new Date(Date.now() - 90 * 24 * 3600 * 1000)
        const { data: lastPaid } = await supabase
          .from("sales")
          .select("id,total,created_at,status")
          .eq("customer_email", email.toLowerCase())
          .eq("status", "paid")
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
        const last = (lastPaid?.[0] as any) ?? null
        if (last) {
          out.push({
            id: `reorder-${last.id}`,
            icon: RotateCcw,
            tone: "emerald",
            title: `Repetir tu último pedido · ${formatMoney(Number(last.total) || 0)}`,
            caption: "Te llevamos al catálogo con todo cargado",
            href: `/?reorder=${last.id}`,
          })
        }
      } catch {
        /* noop */
      }
    }

    // Clamp a 6 totales para no saturar la home con 11 cards
    // (5 saldos + 3 deliveries + 3 wishes en el peor caso).
    setItems(out.slice(0, 6))
  }, [email, bRules.reorder_banner_enabled])

  useEffect(() => {
    load()
  }, [load])

  const debouncedReload = useDebouncedCallback(load, 800)
  useRealtimeSubscription("sales", debouncedReload, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })
  useRealtimeSubscription("wishes", debouncedReload, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })
  useRealtimeSubscription("delivery_notes" as any, debouncedReload, {
    enabled: !!email,
  })

  // Filtra items dismissed que aún están dentro del TTL. Si el TTL
  // venció (24h), reaparece para que el cliente no se olvide.
  const visible = items.filter((it) => !dismissed[it.id])

  if (visible.length === 0) return null

  return (
    <section className="my-3">
      <header className="flex items-center gap-1.5 mb-2 px-1">
        <AlertCircle size={12} className="text-primary" />
        <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
          Pendientes ({visible.length})
        </h2>
      </header>
      <div className="space-y-2">
        {visible.map((it) => {
          const Icon = it.icon
          return (
            <div
              key={it.id}
              className={`relative nudge-on-hover flex items-center gap-3 rounded-2xl border p-3 ${TONE_CARD[it.tone]}`}
            >
              <a
                href={it.href}
                className="absolute inset-0 z-0 press rounded-2xl"
                aria-label={it.title}
              />
              <div
                className={`relative z-10 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${TONE_ICON_BG[it.tone]}`}
              >
                <Icon size={16} />
              </div>
              <div className="relative z-10 flex-1 min-w-0 pointer-events-none">
                <p className="text-[12px] font-black leading-tight truncate">
                  {it.title}
                </p>
                <p className="text-[11px] font-bold opacity-80 leading-tight truncate mt-0.5">
                  {it.caption}
                </p>
              </div>
              <ChevronRight
                size={14}
                className="relative z-10 nudge-arrow shrink-0 opacity-60 pointer-events-none"
              />
              {/* Botón X dismiss — fuera del flujo principal pero
                  encima del link, con stopPropagation. */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  dismissItem(it.id)
                }}
                aria-label="Ocultar por 24 horas"
                title="Recordarme mañana"
                className="relative z-20 shrink-0 w-7 h-7 -mr-1 rounded-full bg-black/5 hover:bg-black/15 text-current opacity-40 hover:opacity-100 flex items-center justify-center transition-opacity press"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MySavingsSection() {
  // Calcula el total invertido por el cliente. La tabla `sales` NO tiene
  // `customer_id` — los pedidos se asocian por `customer_email`. Usamos
  // el email del jwt para filtrar y sumar.
  const { session, email } = useAuth()
  const [stats, setStats] = useState<{
    totalGastado: number
    pedidos: number
  } | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!session || !email) return
      const { data } = await supabase
        .from("sales")
        .select("total,paid,status")
        .eq("customer_email", email.toLowerCase())
      if (!alive) return
      const valid = (data ?? []).filter((r: any) => r.status !== "cancelled")
      const totalGastado = valid.reduce(
        (acc: number, r: any) => acc + (Number(r.paid) || 0),
        0,
      )
      setStats({ totalGastado, pedidos: valid.length })
    }
    load()
    return () => {
      alive = false
    }
  }, [session, email])

  if (!stats || stats.pedidos === 0) {
    return (
      <section
        className="my-3 rounded-3xl border p-5 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--brand-from) 12%, white), color-mix(in srgb, var(--brand-to) 12%, white))",
          borderColor: "color-mix(in srgb, var(--brand-from) 25%, transparent)",
        }}
      >
        {/* Orb decorativo */}
        <span
          className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-30 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
          }}
        />
        <div className="relative flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-bloom shrink-0 text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
            }}
          >
            <Sparkles size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
              Bienvenida a Beauty's Me
            </p>
            <p className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5 leading-snug">
              Tu primera compra está cerca
            </p>
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-1 leading-snug">
              Arma tu carrito, aparta sin pagar todo hoy, y te contactamos por
              WhatsApp para coordinar entrega.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 mt-3 h-9 px-4 rounded-xl text-white text-[10px] font-black uppercase tracking-widest shadow-bloom press-hard"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
              }}
            >
              Explorar catálogo
              <ChevronRight size={12} />
            </a>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="my-3 rounded-3xl bg-gradient-to-br from-emerald-100 via-white to-emerald-50 dark:from-emerald-500/15 dark:via-slate-900 dark:to-emerald-500/5 border border-emerald-200 dark:border-emerald-500/30 p-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shrink-0">
          <PiggyBank size={20} strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Si el cliente tiene pedidos pero aún no ha pagado nada (todos
              son apartados con paid=0), mostrar "$0 invertido en N pedidos"
              se sentía contradictorio. Detectamos el caso y mostramos
              copy distinto para no engañar. */}
          {stats.totalGastado <= 0 ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                Pedidos en curso
              </p>
              <p className="text-xl font-black tabular-nums leading-tight">
                {stats.pedidos} {stats.pedidos === 1 ? "pedido" : "pedidos"}
              </p>
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                Cuando liquides aparecerá tu inversión total
              </p>
            </>
          ) : (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                Invertido en ti
              </p>
              <p className="text-xl font-black tabular-nums leading-tight">
                ${stats.totalGastado.toFixed(2)}
              </p>
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                En {stats.pedidos} {stats.pedidos === 1 ? "pedido" : "pedidos"}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

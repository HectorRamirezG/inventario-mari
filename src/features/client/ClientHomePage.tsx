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
} from "lucide-react"
import { motion } from "framer-motion"

import { supabase } from "../../lib/supabase"
import { useAuth } from "../../lib/useAuth"
import { useBusinessRules } from "../settings/businessRulesService"
import { useNotifications } from "../notifications/notificationsService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"

import ClientHero from "../../components/ui/ClientHero"
import StoriesBar from "../stories/StoriesBar"
import RecentlyViewedRow from "../../components/ui/RecentlyViewedRow"
import ReviewStoriesBar from "../../components/ui/ReviewStoriesBar"
import ProductOfTheDay from "../../components/ui/ProductOfTheDay"
import Skeleton from "../../components/ui/Skeleton"

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
    <div className="pb-24">
      <ClientHero
        customerName={authName || (authEmail ? authEmail.split("@")[0] : "")}
        isLogged={isLogged}
      />

      {/* CLIENTE LOGUEADO: info personal ARRIBA. Mensajes + saldos.
          Premios y Reseñas FUERON QUITADOS de aqui (Mari: 'lo que ya
          hay atajo en el +, quitalo'). Ya viven en el ActionHub Mi cuenta. */}
      {isLogged && <MyMessagesSection />}
      {isLogged && <MySavingsSection />}

      {/* Stories de resenias — marketing organico. Banda horizontal con
          las mejores resenias con foto, estilo Instagram stories. Click
          en una abre el producto en la tienda. Solo aparece si hay >=3. */}
      <ReviewStoriesBar />

      {/* Productos vistos recientemente */}
      <RecentlyViewedRow onOpen={openProduct} />

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
  const { items, unread } = useNotifications()
  const latest = items.slice(0, 3)

  if (items.length === 0) {
    return (
      <section
        className="my-3 rounded-3xl border p-4 text-center"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--brand-from) 8%, white), color-mix(in srgb, var(--brand-to) 8%, white))",
          borderColor: "color-mix(in srgb, var(--brand-from) 20%, transparent)",
        }}
      >
        <MessageSquare className="mx-auto mb-1 text-primary/60" size={20} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Sin mensajes nuevos
        </p>
        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
          Aquí verás las novedades de tus pedidos.
        </p>
      </section>
    )
  }

  return (
    <section className="my-3">
      <header className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <Bell size={12} className="text-primary" />
          Mensajes
          {unread > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-white text-[8px] font-black">
              {unread}
            </span>
          )}
        </h2>
      </header>
      <div className="space-y-2">
        {latest.map((n) => (
          <motion.div
            key={n.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-3 border ${
              n.read_at
                ? "bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-700"
                : "bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/30"
            }`}
          >
            <p className="text-[11px] font-black leading-tight">{n.title}</p>
            {n.body && (
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                {n.body}
              </p>
            )}
          </motion.div>
        ))}
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
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
            Invertido en ti
          </p>
          <p className="text-xl font-black tabular-nums leading-tight">
            ${stats.totalGastado.toFixed(2)}
          </p>
          <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            En {stats.pedidos} {stats.pedidos === 1 ? "pedido" : "pedidos"}
          </p>
        </div>
      </div>
    </section>
  )
}

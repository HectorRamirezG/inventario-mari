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

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Sparkles,
  PiggyBank,
  MessageSquare,
  Bell,
  ShoppingBag,
} from "lucide-react"
import { motion } from "framer-motion"

import { supabase } from "../../lib/supabase"
import { useAuth } from "../../lib/useAuth"
import { useBusinessRules } from "../settings/businessRulesService"
import { useNotifications } from "../notifications/notificationsService"

import ClientHero from "../../components/ui/ClientHero"
import InstallAppBanner from "../../components/ui/InstallAppBanner"
import StoriesBar from "../stories/StoriesBar"
import RecentlyViewedRow from "../../components/ui/RecentlyViewedRow"
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

  useEffect(() => {
    let alive = true
    const loadCatalog = async () => {
      const { data: prods } = await supabase
        .from("products")
        .select("id,name,category,image_url,created_at")
        .eq("is_active", true)
        .order("name")
      const { data: vars } = await supabase
        .from("variants")
        .select(
          "id,product_id,variant_name,sku,stock,price,price_menudeo,price_medio,price_mayoreo,image_url,image_urls"
        )
        .eq("is_active", true)
      if (!alive) return
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
        }))
      )
      setLoading(false)
    }
    loadCatalog()
    return () => {
      alive = false
    }
  }, [])

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

      <InstallAppBanner />

      <StoriesBar enabled={bRules.stories_enabled} />

      {/* Productos vistos recientemente */}
      <RecentlyViewedRow
        onOpen={openProduct}
      />

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

      {/* Atajo a tienda */}
      <button
        onClick={() => navigate("/")}
        className="w-full my-3 rounded-3xl p-4 text-white shadow-bloom active:scale-[0.99] transition-all flex items-center gap-3"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
        }}
      >
        <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
          <ShoppingBag size={20} strokeWidth={2.5} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-90">
            Ir al catálogo
          </p>
          <p className="text-sm font-black leading-tight mt-0.5">
            Explorar todos los productos
          </p>
        </div>
        <Sparkles size={18} className="shrink-0 opacity-80" />
      </button>

      {/* Sección Mensajes (solo si logueado) */}
      {isLogged && <MyMessagesSection />}

      {/* Sección Mis ahorros (solo si logueado) */}
      {isLogged && <MySavingsSection />}
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
      <section className="my-3 rounded-3xl bg-gradient-to-br from-pink-50 via-white to-purple-50 dark:from-pink-500/10 dark:via-slate-900 dark:to-purple-500/10 border border-pink-100 dark:border-pink-500/20 p-4 text-center">
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
                : "bg-pink-50 dark:bg-pink-500/10 border-pink-100 dark:border-pink-500/30"
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
  // Calcula el "ahorro acumulado" del cliente: suma de descuentos /
  // diferencia entre precio sin promo y precio aplicado en pedidos.
  // Por ahora es un placeholder informativo — no hay esquema de descuentos
  // todavía, así que mostramos el total invertido como métrica positiva.
  const { session } = useAuth()
  const [stats, setStats] = useState<{
    totalGastado: number
    pedidos: number
  } | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!session?.user?.id) return
      const { data } = await supabase
        .from("sales")
        .select("total")
        .eq("customer_id", session.user.id)
      if (!alive) return
      const totalGastado = (data ?? []).reduce(
        (acc: number, r: any) => acc + Number(r.total || 0),
        0
      )
      setStats({ totalGastado, pedidos: data?.length ?? 0 })
    }
    load()
    return () => {
      alive = false
    }
  }, [session?.user?.id])

  if (!stats || stats.pedidos === 0) {
    return (
      <section className="my-3 rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50 dark:from-emerald-500/10 dark:via-slate-900 dark:to-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-4 text-center">
        <PiggyBank className="mx-auto mb-1 text-emerald-500/70" size={20} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Aún no tienes compras
        </p>
        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
          Cuando compres verás aquí cuánto inviertes en ti.
        </p>
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

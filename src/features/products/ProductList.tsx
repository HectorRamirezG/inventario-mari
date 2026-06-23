import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Sparkles, Boxes, Plus, X, Package, AlertTriangle, TrendingDown } from "lucide-react"
import toast from "react-hot-toast"

import ProductCard from "./ProductCard"
import ProductDrawer from "./ProductDrawer"
import { getProducts } from "./productService"
import type { Product } from "../../types/database"
import Skeleton from "../../components/ui/Skeleton"
import PageHeader from "../../components/ui/PageHeader"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import { debug } from "../../lib/debug"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

/**
 * Catálogo del admin con tarjetas estilo TIENDA + UN solo Drawer
 * unificado para crear / editar / ajustar stock / agregar variantes.
 * Nada de modales encima de modales.
 */
export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  // Cuando el admin invoca "Nueva variante" desde el Action Hub, mostramos
  // un banner guía y enfocamos el buscador. Sin modales encimados.
  const [pickForVariant, setPickForVariant] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // ÚNICO drawer (todos los flujos pasan por aquí)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | "stock">("edit")
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null)
  const [drawerFocusVariant, setDrawerFocusVariant] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const data = await getProducts()
      setProducts(data)
      // Achievement: 100 productos en el catálogo
      if (data.length >= 100) {
        import("../../lib/achievements")
          .then(({ tryUnlock }) => tryUnlock("hundred_products"))
          .catch(() => {})
      }
    } catch (e) {
      debug.error("Error cargando productos:", e)
      toast.error("No se pudieron cargar los productos")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // Realtime: el hub multiplex despacha los eventos al callback debounced.
  const scheduleRefresh = useDebouncedCallback(() => refresh(), 600)
  useRealtimeSubscription("products", scheduleRefresh)
  useRealtimeSubscription("variants", scheduleRefresh)
  useRealtimeSubscription("stock_movements", scheduleRefresh)

  // Permite abrir el drawer "Nuevo producto" desde el Action Hub global
  useEffect(() => {
    const handler = () => openCreate()
    window.addEventListener("products:new", handler)
    return () => window.removeEventListener("products:new", handler)
  }, [])

  // Modo "elige producto para agregarle variante" desde el Action Hub.
  // No abre ninguna modal — solo activa el banner guía y enfoca el buscador.
  useEffect(() => {
    const handler = () => {
      setPickForVariant(true)
      setTimeout(() => searchRef.current?.focus(), 50)
    }
    window.addEventListener("products:pick-for-variant", handler)
    return () =>
      window.removeEventListener("products:pick-for-variant", handler)
  }, [])

  // Saltar directo a un producto (o filtrar) desde el CommandPalette
  // universal search. Si pasa productId y existe en el catálogo cargado,
  // abre su drawer; si solo pasa query, prefiltra el listado.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {}
      if (detail.query) setQ(String(detail.query))
      if (detail.productId) {
        const found = products.find((p) => p.id === detail.productId)
        if (found) openEdit(found)
      }
      setTimeout(() => searchRef.current?.focus(), 50)
    }
    window.addEventListener("products:focus", handler)
    return () => window.removeEventListener("products:focus", handler)
  }, [products])

  // Re-mapea el drawerProduct cuando se refresca el catálogo (para que
  // las variantes editadas/agregadas se vean reflejadas inmediatamente
  // dentro del Drawer abierto).
  useEffect(() => {
    if (!drawerOpen || !drawerProduct) return
    const fresh = products.find((p) => p.id === drawerProduct.id)
    if (fresh && fresh !== drawerProduct) {
      setDrawerProduct(fresh)
    }
  }, [products, drawerOpen, drawerProduct])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return products
    return products.filter((p) => {
      const byProduct =
        (p.name ?? "").toLowerCase().includes(s) ||
        (p.category ?? "").toLowerCase().includes(s)
      const byVariant = (p.variants ?? []).some((v) =>
        `${v.variant_name ?? ""} ${v.sku ?? ""}`.toLowerCase().includes(s)
      )
      return byProduct || byVariant
    })
  }, [q, products])

  const knownCategories = useMemo(
    () =>
      Array.from(
        new Set(
          products.map((p) => (p.category ?? "").trim()).filter(Boolean)
        )
      ),
    [products]
  )

  /** Stats globales (sobre TODO el catálogo, no sobre `filtered`) para
   *  mostrar en el PageHeader. Recorre variantes activas y cuenta cuántas
   *  están agotadas (stock=0) y cuántas en bajo stock (1-3). Ayuda a Mari
   *  a tener visibilidad inmediata desde el listado. */
  const headerStats = useMemo(() => {
    let outOfStock = 0
    let lowStock = 0
    for (const p of products) {
      for (const v of p.variants ?? []) {
        if ((v as any).is_active === false) continue
        const s = Number((v as any).stock) || 0
        if (s === 0) outOfStock++
        else if (s <= 3) lowStock++
      }
    }
    return { total: products.length, outOfStock, lowStock }
  }, [products])

  /* ─────────── Aperturas del Drawer ─────────── */
  function openCreate() {
    setDrawerMode("create")
    setDrawerProduct(null)
    setDrawerFocusVariant(null)
    setDrawerOpen(true)
  }
  function openEdit(p: Product) {
    setDrawerMode("edit")
    setDrawerProduct(p)
    setDrawerFocusVariant(null)
    setDrawerOpen(true)
  }
  function openQuickStock(p: Product, variantId: string) {
    setDrawerMode("stock")
    setDrawerProduct(p)
    setDrawerFocusVariant(variantId)
    setDrawerOpen(true)
  }
  function openAddVariant(p: Product) {
    setDrawerMode("edit")
    setDrawerProduct(p)
    setDrawerFocusVariant(null)
    setDrawerOpen(true)
    setPickForVariant(false)
    // El Drawer arrancará en la tab Variantes si recibe focusVariantId, pero
    // queremos forzar Variantes sin variante específica → enviamos null
    // y el ProductDrawer abrirá en general por defecto. Para entrar en
    // Variantes, despachamos un evento que el Drawer escucha al montar.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("admin:open-variants-tab"))
    }, 80)
  }
  function closeDrawer() {
    setDrawerOpen(false)
    setTimeout(() => {
      setDrawerProduct(null)
      setDrawerFocusVariant(null)
    }, 220)
  }

  return (
    <div className="flex flex-col gap-6 pb-44">
      {/* HEADER + ACTION */}
      <PageHeader
        icon={Boxes}
        title="Catálogo"
        subtitle={`${filtered.length} productos`}
        stats={[
          { label: "Total", value: headerStats.total, tone: "primary", icon: Package },
          ...(headerStats.outOfStock > 0
            ? [{ label: "Agotados", value: headerStats.outOfStock, tone: "rose" as const, icon: AlertTriangle }]
            : []),
          ...(headerStats.lowStock > 0
            ? [{ label: "Bajo stock", value: headerStats.lowStock, tone: "amber" as const, icon: TrendingDown }]
            : []),
        ]}
        right={
          <button
            onClick={openCreate}
            className="h-10 px-4 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom press-hard"
          >
            <Plus size={14} strokeWidth={3} /> Nuevo
          </button>
        }
        noDivider
      />

      {/* Banner guía para "Nueva variante" desde el Action Hub */}
      <AnimatePresence>
        {pickForVariant && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-1 -mt-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-2xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 text-violet-700 dark:text-violet-300"
          >
            <span className="text-base" aria-hidden>📦</span>
            <p className="text-[10px] font-black uppercase tracking-widest flex-1 leading-tight">
              Elige el producto al que quieres agregar una variante
            </p>
            <button
              type="button"
              onClick={() => setPickForVariant(false)}
              aria-label="Cancelar"
              className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-violet-500 press"
            >
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SEARCH */}
      <div className="relative px-1">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
          <Search size={16} />
        </div>
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            pickForVariant
              ? "Busca el producto para agregarle variante..."
              : "Buscar producto, variante o SKU..."
          }
          className="w-full h-12 pl-12 pr-5 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none shadow-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/15 transition-all"
        />
        <AnimatePresence>
          {q && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                <Sparkles size={10} /> {filtered.length}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* LISTADO */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-1">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="aspect-square w-full" rounded="xl" />
          ))}
        </div>
      ) : filtered.length ? (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 px-1"
        >
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              refresh={refresh}
              onEdit={openEdit}
              onQuickStock={openQuickStock}
              onAddVariant={openAddVariant}
            />
          ))}
        </motion.div>
      ) : q ? (
        <EmptyStateIllustration
          variant="no-results"
          title="Sin resultados"
          subtitle={`No encontramos productos para "${q}". Revisa el nombre, variante o SKU.`}
          cta={
            <button
              type="button"
              onClick={() => setQ("")}
              className="h-10 px-4 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest press"
            >
              Limpiar búsqueda
            </button>
          }
        />
      ) : (
        <EmptyStateIllustration
          variant="no-products"
          title="Sin productos aún"
          subtitle="Agrega tu primer producto al catálogo para empezar a vender."
          cta={
            <button
              type="button"
              onClick={openCreate}
              className="h-11 px-5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom press-hard"
            >
              <Plus size={12} strokeWidth={3} /> Crear primer producto
            </button>
          }
        />
      )}

      {/* DRAWER ÚNICO */}
      <ProductDrawer
        open={drawerOpen}
        mode={drawerMode}
        product={drawerProduct}
        focusVariantId={drawerFocusVariant}
        knownCategories={knownCategories}
        onClose={closeDrawer}
        onSaved={refresh}
      />
    </div>
  )
}

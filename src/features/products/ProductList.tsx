import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, FilterX, Sparkles, Boxes, Plus } from "lucide-react"
import toast from "react-hot-toast"

import ProductCard from "./ProductCard"
import ProductDrawer from "./ProductDrawer"
import { getProducts } from "./productService"
import type { Product } from "../../types/database"

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
    } catch (e) {
      console.error("Error cargando productos:", e)
      toast.error("No se pudieron cargar los productos")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // Permite abrir el drawer "Nuevo producto" desde el Action Hub global
  useEffect(() => {
    const handler = () => openCreate()
    window.addEventListener("products:new", handler)
    return () => window.removeEventListener("products:new", handler)
  }, [])

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
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2">
            <Boxes size={14} className="text-primary" /> Catálogo
          </h2>
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
            {filtered.length} productos
          </p>
        </div>

        <button
          onClick={openCreate}
          className="h-10 px-4 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom active:scale-90 transition-all"
        >
          <Plus size={14} strokeWidth={3} /> Nuevo
        </button>
      </div>

      {/* SEARCH */}
      <div className="relative px-1">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-300">
          <Search size={16} />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto, variante o SKU..."
          className="w-full h-12 pl-12 pr-5 rounded-[2rem] bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 text-[11px] font-black text-slate-700 dark:text-slate-200 placeholder:text-slate-300 outline-none shadow-sm focus:border-primary/30"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse"
            />
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
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.6, y: 0 }}
          className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2.5rem] mx-2"
        >
          <FilterX className="mx-auto mb-2 text-slate-300" size={28} />
          <p className="text-[10px] font-black uppercase tracking-widest">
            Sin resultados
          </p>
          {q && (
            <button
              onClick={() => setQ("")}
              className="mt-4 text-[9px] font-black text-primary uppercase tracking-widest"
            >
              Limpiar búsqueda
            </button>
          )}
        </motion.div>
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

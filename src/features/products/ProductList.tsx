import { motion, AnimatePresence } from "framer-motion"
import { Search, FilterX, Sparkles, Boxes, Plus } from "lucide-react"
import { useEffect } from "react"
import ProductCard from "./ProductCard"
import Button from "../../components/ui/Button"

import {
  CreateProductModal,
  CreateVariantModal,
  MovementModal
} from "../movements/ProductModals"

import EditProductModal from "./EditProductModal"
import { useProductList } from "./useProductList"

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 }
  }
}

export default function ProductList() {
  const ui = useProductList()

  // Permite abrir el modal "Nuevo producto" desde el Action Hub global
  useEffect(() => {
    const handler = () => ui.setOpenNewProduct(true)
    window.addEventListener("products:new", handler)
    return () => window.removeEventListener("products:new", handler)
  }, [ui])

  return (
    <div className="flex flex-col gap-10 pb-44">

      {/* HEADER + ACTION */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2">
            <Boxes size={14} className="text-primary" /> Catálogo Activo
          </h2>
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">
            {ui.filtered.length} productos disponibles
          </p>
        </div>

        {/* BOTÓN AGREGAR (MISMA LÓGICA QUE CALCULATOR) */}
        <button
          onClick={() => ui.setOpenNewProduct(true)}
          className="h-10 px-4 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-90 transition-all"
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
          value={ui.q}
          onChange={e => ui.setQ(e.target.value)}
          placeholder="Buscar producto o SKU..."
          className="w-full h-12 pl-12 pr-5 rounded-[2rem] bg-white border border-slate-100 text-[11px] font-black text-slate-700 placeholder:text-slate-300 outline-none shadow-sm focus:border-primary/20"
        />

        <AnimatePresence>
          {ui.q && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-primary bg-primary/5 px-3 py-1.5 rounded-full border border-primary/10">
                <Sparkles size={10} /> {ui.filtered.length}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* LISTADO */}
      {ui.loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div
              key={i}
              className="h-20 rounded-[2rem] bg-slate-100 animate-pulse border border-slate-100"
            />
          ))}
        </div>
      ) : ui.filtered.length ? (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          {ui.filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onAddVariant={ui.handleAddVariant}
              onMove={ui.handleMove}
              onEdit={ui.handleEdit}
              refresh={ui.refresh}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.6, y: 0 }}
          className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem]"
        >
          <FilterX className="mx-auto mb-2 text-slate-300" size={28} />
          <p className="text-[10px] font-black uppercase tracking-widest">
            Sin resultados
          </p>
          <button
            onClick={() => ui.setQ("")}
            className="mt-4 text-[9px] font-black text-primary uppercase tracking-widest"
          >
            Limpiar búsqueda
          </button>
        </motion.div>
      )}

      {/* BOTÓN FLOTANTE (OPCIONAL - MÁS PRO) */}


      {/* MODALES */}
      <CreateProductModal
        isOpen={ui.openNewProduct}
        onClose={() => ui.setOpenNewProduct(false)}
        onSuccess={ui.refresh}
      />

      <EditProductModal
        key={ui.editProduct?.id ?? "none"}
        open={ui.openEdit}
        product={ui.editProduct}
        onClose={ui.handleCloseEdit}
        onSaved={ui.refresh}
        knownCategories={Array.from(
          new Set(
            (ui.products ?? [])
              .map((p) => (p.category ?? "").trim())
              .filter(Boolean)
          )
        )}
      />

      <CreateVariantModal
        isOpen={ui.openVariant}
        productId={ui.variantProductId}
        productName={ui.variantProductName}
        onClose={() => ui.setOpenVariant(false)}
        onSuccess={ui.refresh}
      />

      <MovementModal
        isOpen={ui.openMove}
        variantId={ui.moveVariantId}
        type={ui.moveType}
        onClose={() => ui.setOpenMove(false)}
        onSuccess={ui.refresh}
      />
    </div>
  )
}
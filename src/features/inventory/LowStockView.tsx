import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Package, MinusCircle, PlusCircle } from "lucide-react"

import { getProducts } from "../products/productService"
import type { Product, Variant } from "../../types/database"
import {
  CreateVariantModal,
  MovementModal,
} from "../movements/ProductModals"

interface LowItem {
  product: Product
  variant: Variant
  diff: number
}

/**
 * Lista las variantes cuyo stock está en o por debajo del `min_stock`
 * de su producto. Muestra cuánto falta para llegar al mínimo y permite
 * registrar una entrada rápida.
 */
export default function LowStockView() {
  const [items, setItems] = useState<LowItem[]>([])
  const [loading, setLoading] = useState(true)

  // Modales
  const [openMove, setOpenMove] = useState(false)
  const [moveVariantId, setMoveVariantId] = useState<string | null>(null)
  const [moveType, setMoveType] = useState<"entrada" | "venta">("entrada")
  const [openVariant, setOpenVariant] = useState(false)
  const [variantProduct, setVariantProduct] = useState<{
    id: string
    name: string
  } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const products = await getProducts()
      const low: LowItem[] = []
      for (const p of products) {
        const min = Number(p.min_stock ?? 0)
        for (const v of p.variants ?? []) {
          const stock = Number(v.stock ?? 0)
          if (stock <= min) {
            low.push({ product: p, variant: v, diff: min - stock })
          }
        }
      }
      setItems(low.sort((a, b) => b.diff - a.diff))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const summary = useMemo(() => {
    const empty = items.filter((i) => (i.variant.stock ?? 0) === 0).length
    return { total: items.length, empty }
  }, [items])

  const handleEntrada = (v: Variant) => {
    setMoveVariantId(v.id)
    setMoveType("entrada")
    setOpenMove(true)
  }

  return (
    <div className="space-y-3 pb-10">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
          <p className="text-[8px] font-black uppercase tracking-widest text-amber-700/70">
            Bajo mínimo
          </p>
          <p className="text-2xl font-black text-amber-700 tabular-nums">
            {summary.total}
          </p>
        </div>
        <div className="rounded-2xl bg-rose-50 border border-rose-100 p-3">
          <p className="text-[8px] font-black uppercase tracking-widest text-rose-700/70">
            Sin stock
          </p>
          <p className="text-2xl font-black text-rose-600 tabular-nums">
            {summary.empty}
          </p>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-2xl bg-slate-100/60 animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-14 text-center border-2 border-dashed border-emerald-200 rounded-3xl bg-emerald-50/30">
          <Package size={28} className="mx-auto text-emerald-500 mb-2" />
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
            Todo tu inventario está en regla
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {items.map(({ product, variant, diff }) => {
              const stock = Number(variant.stock ?? 0)
              const empty = stock === 0
              return (
                <motion.div
                  key={variant.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl border ${
                    empty
                      ? "bg-rose-50/50 border-rose-100"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-800 truncate">
                      {product.name}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 truncate">
                      {variant.variant_name}
                      {variant.sku && (
                        <span className="text-slate-400"> · {variant.sku}</span>
                      )}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-black tabular-nums ${
                        empty ? "text-rose-500" : "text-amber-600"
                      }`}
                    >
                      {stock}/{product.min_stock ?? 0}
                    </p>
                    <p className="text-[8px] font-bold text-slate-400 flex items-center gap-1 justify-end">
                      <AlertTriangle size={9} />
                      faltan {diff > 0 ? diff : 1}
                    </p>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleEntrada(variant)}
                    className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center active:scale-90 transition-transform shadow-md shadow-emerald-500/20"
                    title="Registrar entrada"
                  >
                    <PlusCircle size={16} />
                  </motion.button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modal de movimiento */}
      <MovementModal
        isOpen={openMove}
        variantId={moveVariantId}
        type={moveType}
        onClose={() => setOpenMove(false)}
        onSuccess={load}
      />
      <CreateVariantModal
        isOpen={openVariant}
        productId={variantProduct?.id ?? null}
        productName={variantProduct?.name ?? null}
        onClose={() => setOpenVariant(false)}
        onSuccess={load}
      />
      {/* Iconito sólo para evitar warning de unused */}
      <span aria-hidden className="hidden">
        <MinusCircle />
      </span>
    </div>
  )
}

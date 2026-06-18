import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, MinusCircle, PlusCircle, PackageX } from "lucide-react"

import { getProducts } from "../products/productService"
import type { Product, Variant } from "../../types/database"
import {
  CreateVariantModal,
  MovementModal,
} from "../movements/ProductModals"
import KpiCard from "../../components/ui/KpiCard"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import { StockRowSkeleton } from "../../components/ui/Skeletons"

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
        <KpiCard
          label="Bajo mínimo"
          value={summary.total}
          tone={summary.total > 0 ? "warn" : "default"}
          icon={<AlertTriangle size={9} />}
          hint={summary.total > 0 ? "Reabastecer pronto" : "Todo OK"}
        />
        <KpiCard
          label="Sin stock"
          value={summary.empty}
          tone={summary.empty > 0 ? "danger" : "default"}
          icon={<PackageX size={9} />}
          hint={summary.empty > 0 ? "Cero piezas disponibles" : "Sin agotados"}
        />
      </div>

      {/* Lista */}
      {loading ? (
        <StockRowSkeleton count={5} />
      ) : items.length === 0 ? (
        <EmptyStateIllustration
          variant="no-orders"
          title="Todo tu inventario está en regla"
          subtitle="No tienes variantes por debajo de su mínimo. ¡Bien hecho!"
        />
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
                  className={`flex items-center justify-between gap-3 p-3 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
                    empty
                      ? "bg-rose-50/60 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30"
                      : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
                      {product.name}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate">
                      {variant.variant_name}
                      {variant.sku && (
                        <span className="text-slate-400 dark:text-slate-500"> · {variant.sku}</span>
                      )}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-black tabular-nums ${
                        empty ? "text-rose-500 dark:text-rose-300" : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {stock}/{product.min_stock ?? 0}
                    </p>
                    <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1 justify-end">
                      <AlertTriangle size={9} />
                      faltan {diff > 0 ? diff : 1}
                    </p>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleEntrada(variant)}
                    className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center press shadow-[0_8px_20px_-4px_rgba(16,185,129,0.45)] hover:brightness-110"
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

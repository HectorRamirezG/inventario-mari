import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, MinusCircle, PlusCircle, PackageX, TrendingDown } from "lucide-react"

import { getProducts } from "../products/productService"
import type { Product, Variant } from "../../types/database"
import {
  CreateVariantModal,
  MovementModal,
} from "../movements/ProductModals"
import KpiCard from "../../components/ui/KpiCard"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import { StockRowSkeleton } from "../../components/ui/Skeletons"
import InlineStockStepper from "../../components/ui/InlineStockStepper"
import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

interface LowItem {
  product: Product
  variant: Variant
  diff: number
}

/** Predicción de stockout para una variante: combina stock actual con
 *  velocidad de venta de los últimos 30 días para estimar cuándo se
 *  acabaría. Solo aparece cuando hay datos suficientes. */
interface StockoutPrediction {
  product: Product
  variant: Variant
  qtyLast30Days: number
  daysToStockout: number
  suggestedReorder: number
}

/** Búsqueda agregada que NO devolvió productos en el catálogo cliente.
 *  Si la tabla `search_misses` no existe, la sección simplemente no
 *  se renderiza. */
interface SearchMiss {
  query: string
  count: number
}

/**
 * Lista las variantes cuyo stock está en o por debajo del `min_stock`
 * de su producto. Muestra cuánto falta para llegar al mínimo y permite
 * registrar una entrada rápida.
 */
export default function LowStockView() {
  const [items, setItems] = useState<LowItem[]>([])
  const [loading, setLoading] = useState(true)
  // Predicciones de stockout — calculadas a partir de sale_items
  // de los últimos 30 días. Mostramos las top 5 más urgentes.
  const [predictions, setPredictions] = useState<StockoutPrediction[]>([])
  // Top búsquedas que NO devolvieron productos en el catálogo.
  // Si la tabla search_misses no existe, queda en [] y no se renderiza.
  const [searchMisses, setSearchMisses] = useState<SearchMiss[]>([])

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
      const variantsByid = new Map<string, { product: Product; variant: Variant }>()
      for (const p of products) {
        const min = Number(p.min_stock ?? 0)
        for (const v of p.variants ?? []) {
          variantsByid.set(v.id, { product: p, variant: v })
          const stock = Number(v.stock ?? 0)
          if (stock <= min) {
            low.push({ product: p, variant: v, diff: min - stock })
          }
        }
      }
      setItems(low.sort((a, b) => b.diff - a.diff))

      // Predicción de stockout: ventas reales últimos 30 días → velocity
      // → días restantes. Best-effort: si sale_items no responde, no
      // muestra la sección. No bloquea la lista low-stock principal.
      try {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
        const { data: items30 } = await supabase
          .from("sale_items")
          .select("variant_id,qty,created_at")
          .gte("created_at", since.toISOString())
          .limit(5000)
        if (items30 && Array.isArray(items30)) {
          const qtyByVariant = new Map<string, number>()
          for (const r of items30 as any[]) {
            const k = r.variant_id
            if (!k) continue
            qtyByVariant.set(k, (qtyByVariant.get(k) || 0) + (Number(r.qty) || 0))
          }
          const preds: StockoutPrediction[] = []
          for (const [vid, q30] of qtyByVariant) {
            if (q30 <= 0) continue
            const pair = variantsByid.get(vid)
            if (!pair) continue
            const stock = Math.max(0, Number(pair.variant.stock ?? 0))
            // Si ya está agotado, lo cubre LowStock. Aquí solo cosas
            // con stock > 0 pero camino a 0.
            if (stock === 0) continue
            const velocityPerDay = q30 / 30
            if (velocityPerDay <= 0) continue
            const days = Math.ceil(stock / velocityPerDay)
            // Solo mostramos si se acaba en <= 14 días — más allá es ruido.
            if (days > 14) continue
            // Sugerencia: reordenar para cubrir 30 días.
            const suggested = Math.max(1, Math.ceil(velocityPerDay * 30) - stock)
            preds.push({
              product: pair.product,
              variant: pair.variant,
              qtyLast30Days: q30,
              daysToStockout: days,
              suggestedReorder: suggested,
            })
          }
          preds.sort((a, b) => a.daysToStockout - b.daysToStockout)
          setPredictions(preds.slice(0, 5))
        }
      } catch (e: any) {
        debug.warn("[stockout] predict:", e?.message)
        setPredictions([])
      }

      // Búsquedas sin resultado — agrupadas por query, ordenadas por
      // popularidad. Tolerante: si la tabla no existe, sección omitida.
      try {
        const sinceMisses = new Date(
          Date.now() - 30 * 24 * 3600 * 1000,
        )
        const { data: misses } = await supabase
          .from("search_misses")
          .select("query")
          .gte("created_at", sinceMisses.toISOString())
          .limit(500)
        if (misses && Array.isArray(misses)) {
          const counts = new Map<string, number>()
          for (const r of misses as any[]) {
            const q = String(r.query ?? "").trim().toLowerCase()
            if (!q) continue
            counts.set(q, (counts.get(q) || 0) + 1)
          }
          const arr: SearchMiss[] = Array.from(counts.entries())
            .map(([query, count]) => ({ query, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
          setSearchMisses(arr)
        }
      } catch (e: any) {
        debug.warn("[search-misses] load:", e?.message)
        setSearchMisses([])
      }
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

      {/* Predicción de stockout — basada en velocidad real de venta de
          los últimos 30 días. Mari ve qué reordenar antes de que pase. */}
      {predictions.length > 0 && (
        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 p-3">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-2">
            <TrendingDown size={12} />
            Se van a acabar pronto
            <span className="text-[9px] font-bold opacity-70 normal-case tracking-normal">
              · según ventas últimos 30 días
            </span>
          </h3>
          <div className="space-y-1.5">
            {predictions.map((p) => (
              <div
                key={p.variant.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white/70 dark:bg-slate-900/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black truncate">
                    {p.product.name}
                  </p>
                  <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {p.variant.variant_name} · vendiste {p.qtyLast30Days} en 30 días
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-[10px] font-black tabular-nums ${
                      p.daysToStockout <= 3
                        ? "text-rose-600 dark:text-rose-400"
                        : p.daysToStockout <= 7
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {p.daysToStockout} {p.daysToStockout === 1 ? "día" : "días"}
                  </p>
                  <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                    reordena +{p.suggestedReorder}
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handleEntrada(p.variant)}
                  className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center press shrink-0"
                  title={`Registrar entrada de ${p.suggestedReorder} piezas`}
                  aria-label="Entrada manual"
                >
                  <PlusCircle size={12} />
                </motion.button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Búsquedas sin resultado — gap inteligente del catálogo. Las
          clientas buscaron estas cosas y no encontraron nada. Pivote
          de inventario basado en demanda real. */}
      {searchMisses.length > 0 && (
        <div className="rounded-2xl border border-fuchsia-200/70 dark:border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-50 to-pink-50 dark:from-fuchsia-500/10 dark:to-pink-500/10 p-3">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-fuchsia-700 dark:text-fuchsia-300 flex items-center gap-1.5 mb-2">
            🔎 Buscado y NO encontrado
            <span className="text-[9px] font-bold opacity-70 normal-case tracking-normal">
              · últimos 30 días
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {searchMisses.map((m) => (
              <span
                key={m.query}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/70 dark:bg-slate-900/40 text-[10px] font-black text-fuchsia-800 dark:text-fuchsia-200"
                title={`Buscado ${m.count} ${m.count === 1 ? "vez" : "veces"}`}
              >
                {m.query}
                <span className="text-[8px] font-bold opacity-60">
                  ×{m.count}
                </span>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-fuchsia-700/80 dark:text-fuchsia-300/70 mt-2 leading-snug">
            Considera agregar estos productos al catálogo · convierte
            búsquedas en ventas.
          </p>
        </div>
      )}

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
                    <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500">
                      mínimo {product.min_stock ?? 0}
                    </p>
                    <p className="text-[8px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 justify-end">
                      <AlertTriangle size={9} />
                      faltan {diff > 0 ? diff : 1}
                    </p>
                  </div>

                  {/* Stepper inline: el "+" suma 1 al instante, el "-" baja 1.
                      A los 1.2s sin tocar, persiste con applyMovement().
                      Si quieres registrar una entrada con cantidad grande
                      (lote, factura), abre el modal con el botón verde. */}
                  <InlineStockStepper
                    variantId={variant.id}
                    stock={stock}
                    onCommitted={load}
                  />

                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleEntrada(variant)}
                    className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center press"
                    title="Registrar entrada con cantidad y nota"
                    aria-label="Entrada manual"
                  >
                    <PlusCircle size={14} />
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

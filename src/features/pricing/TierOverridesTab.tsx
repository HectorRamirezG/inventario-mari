import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Layers, Package, ExternalLink, Info } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { getProducts } from "../products/productService"
import type { Product } from "../../types/database"
import {
  useTierThresholds,
  DEFAULT_THRESHOLDS,
} from "./tierPricingService"
import { hasTierOverride, resolveThresholds } from "./tierResolver"
import Skeleton from "../../components/ui/Skeleton"

/* ────────────────────────────────────────────────────────────────
 * TierOverridesTab — resumen de productos con umbrales personalizados.
 * Ayuda a Mari a ver de un vistazo qué productos NO usan los umbrales
 * globales, y a saltar rápido a editarlos.
 *
 * Cascada visible:
 *   • Producto con override → chip "producto" + valores propios
 *   • Variante con override → chip "variante" + variantes específicas
 *   • Ambos → dos chips
 * ──────────────────────────────────────────────────────────────── */

export default function TierOverridesTab() {
  const navigate = useNavigate()
  const globalThresholds = useTierThresholds()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getProducts()
      .then((data) => {
        if (alive) setProducts(data)
      })
      .catch(() => {
        /* getProducts ya muestra toast interno */
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const withOverrides = useMemo(() => {
    return products.filter((p) => {
      if (hasTierOverride(p)) return true
      return (p.variants ?? []).some((v) => hasTierOverride(v))
    })
  }, [products])

  function openProduct(productId: string) {
    // Navega al catálogo y dispara evento para que ProductList abra
    // el drawer con este producto. Mantiene consistencia con
    // "productos:focus" que ya usan CommandPalette y otras rutas.
    navigate("/productos")
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("products:focus", { detail: { productId } }),
      )
    }, 60)
  }

  return (
    <div className="space-y-3 pt-2">
      {/* Header explicativo */}
      <div className="rounded-2xl bg-emerald-50/60 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3 flex items-start gap-2">
        <Info
          size={14}
          className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
        />
        <div className="min-w-0">
          <p className="text-[11px] font-black text-emerald-800 dark:text-emerald-200 uppercase tracking-widest">
            Umbrales de tier
          </p>
          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 leading-tight mt-0.5">
            Global (todos): 1 · {globalThresholds.medio_min_qty} ·{" "}
            {globalThresholds.mayoreo_min_qty} piezas para menudeo / medio /
            mayoreo. Los productos y variantes con override propio se listan
            abajo.
          </p>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : withOverrides.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
          <Layers size={22} className="mx-auto mb-1.5 text-slate-300" />
          <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Sin overrides
          </p>
          <p className="text-[10px] font-bold text-slate-400 mt-1 leading-tight">
            Todos los productos usan los umbrales globales.
            <br />
            Cambia esto desde el drawer de cualquier producto.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {withOverrides.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              globalThresholds={globalThresholds}
              onOpen={() => openProduct(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* Sub-componente: una fila resumen por producto */
function ProductRow({
  product,
  globalThresholds,
  onOpen,
}: {
  product: Product
  globalThresholds: ReturnType<typeof useTierThresholds>
  onOpen: () => void
}) {
  const productHas = hasTierOverride(product)
  const variantsWithOverride = (product.variants ?? []).filter((v) =>
    hasTierOverride(v),
  )

  // Umbrales resueltos "efectivos" al nivel del producto (sin variante).
  const productResolved = resolveThresholds(null, product, globalThresholds)

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-500/40 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <Package size={16} className="text-slate-300" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
          {product.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {productHas && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest">
              Producto
              <span className="opacity-90 tabular-nums">
                {productResolved.medio_min_qty}/{productResolved.mayoreo_min_qty}
              </span>
            </span>
          )}
          {variantsWithOverride.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-500 text-white text-[8px] font-black uppercase tracking-widest">
              {variantsWithOverride.length}{" "}
              {variantsWithOverride.length === 1 ? "variante" : "variantes"}
            </span>
          )}
        </div>
      </div>

      <ExternalLink size={13} className="shrink-0 text-slate-400" />
    </motion.button>
  )
}

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import TrendingUp from "lucide-react/dist/esm/icons/trending-up"

import {
  getMarginByCategory,
  type CategoryMargin,
} from "./analyticsService"
import { formatMoney as formatCurrency } from "../../lib/format"

interface Props {
  /** Días hacia atrás a considerar (default 30). */
  days?: number
}

/**
 * Card "Margen por categoría". Lee `sale_items.profit` agregado por
 * `products.category` para mostrar dónde Mari está ganando más dinero
 * real. Útil para decidir promos: una categoría con buen margen
 * aguanta descuento; una con bajo margen NO.
 *
 * Render: lista vertical con barra de proporción de margen, monto en
 * pesos y porcentaje. Auto-oculta si no hay ventas en el período.
 */
export default function MarginByCategoryCard({ days = 30 }: Props) {
  const [data, setData] = useState<CategoryMargin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getMarginByCategory(days)
      .then((d) => setData(d.slice(0, 6))) // top 6 para que la card no crezca
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 h-44 animate-pulse" />
    )
  }

  if (data.length === 0) return null

  const maxProfit = Math.max(...data.map((c) => c.profit), 1)
  const totalProfit = data.reduce((a, c) => a + c.profit, 0)
  const totalRevenue = data.reduce((a, c) => a + c.revenue, 0)
  const overallMargin =
    totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 grid place-items-center">
            <TrendingUp size={14} />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Margen por categoría
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Dónde se gana más · últimos {days} días
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-widest font-black text-emerald-700 dark:text-emerald-300">
            Margen global
          </p>
          <p className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">
            {overallMargin.toFixed(1)}%
          </p>
        </div>
      </header>

      <div className="space-y-2">
        {data.map((c, i) => {
          const w = (c.profit / maxProfit) * 100
          return (
            <div key={c.category} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px] gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200 truncate flex-1">
                  {c.category}
                </span>
                <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(c.profit)}
                </span>
                <span className="font-bold tabular-nums text-slate-400 w-12 text-right">
                  {c.margin_pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{
                    duration: 0.55,
                    delay: i * 0.05,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                />
              </div>
              <p className="text-[9px] text-slate-400 tabular-nums">
                {c.items_sold} {c.items_sold === 1 ? "pieza" : "piezas"} ·
                ventas {formatCurrency(c.revenue)}
              </p>
            </div>
          )
        })}
      </div>

      {data.length > 0 && (
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug italic text-center pt-1">
          La categoría con más ganancia real es{" "}
          <span className="font-black text-emerald-700 dark:text-emerald-300">
            {data[0].category}
          </span>{" "}
          ({data[0].margin_pct.toFixed(0)}% de margen). Es la que aguanta más
          descuento si quieres impulsar 🚀
        </p>
      )}
    </section>
  )
}

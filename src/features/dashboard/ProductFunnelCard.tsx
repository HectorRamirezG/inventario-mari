import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Filter from "lucide-react/dist/esm/icons/filter"
import Eye from "lucide-react/dist/esm/icons/eye"
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart"
import Bookmark from "lucide-react/dist/esm/icons/bookmark"
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2"

import {
  getProductFunnels,
  type ProductFunnel,
} from "./analyticsService"

/**
 * Funnel por producto: visto → carrito → apartado → pagado.
 * Mari ve qué producto pierde gente en qué paso. Ejemplo de uso:
 * "el lipstick X tiene 80 vistas pero solo 3 ventas → revisar precio o foto".
 */

interface Props {
  days?: number
}

export default function ProductFunnelCard({ days = 30 }: Props) {
  const [data, setData] = useState<ProductFunnel[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    getProductFunnels(days)
      .then((f) => setData(f))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 h-40 animate-pulse" />
    )
  }
  if (data.length === 0) return null

  // Producto con peor conversión (más vistas vs ventas)
  const worstConversion = [...data]
    .filter((d) => d.viewed >= 5)
    .sort(
      (a, b) =>
        a.paid / Math.max(1, a.viewed) - b.paid / Math.max(1, b.viewed),
    )[0]

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
      <header className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 grid place-items-center shrink-0">
            <Filter size={14} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Embudo por producto
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Visto → carrito → apartado → pagado
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 press"
        >
          {open ? "Ocultar" : "Ver detalle"}
        </button>
      </header>

      {worstConversion && (
        <div className="px-4 pb-3">
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-3">
            <p className="text-[9px] uppercase tracking-widest font-black text-rose-700 dark:text-rose-300">
              ⚠️ Más interés que conversión
            </p>
            <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate mt-0.5">
              {worstConversion.product_name}
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
              <span className="font-black tabular-nums text-rose-700 dark:text-rose-300">
                {worstConversion.viewed}
              </span>{" "}
              vistas ·{" "}
              <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {worstConversion.paid}
              </span>{" "}
              pagaron · revisa precio o foto principal
            </p>
          </div>
        </div>
      )}

      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t border-slate-100 dark:border-slate-800 overflow-hidden"
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.map((p) => {
              const conversion =
                p.viewed > 0 ? ((p.paid / p.viewed) * 100).toFixed(0) : "—"
              const tone =
                p.viewed === 0
                  ? "slate"
                  : p.paid >= p.viewed * 0.3
                  ? "emerald"
                  : p.paid >= p.viewed * 0.1
                  ? "amber"
                  : "rose"
              return (
                <li
                  key={p.product_id}
                  className="px-4 py-2.5 flex items-center gap-3"
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-slate-200 dark:bg-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 truncate">
                      {p.product_name}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Eye size={9} /> {p.viewed}
                      </span>
                      <span className="text-slate-300">→</span>
                      <span className="flex items-center gap-1">
                        <ShoppingCart size={9} /> {p.in_carts}
                      </span>
                      <span className="text-slate-300">→</span>
                      <span className="flex items-center gap-1">
                        <Bookmark size={9} /> {p.layaways}
                      </span>
                      <span className="text-slate-300">→</span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={9} /> {p.paid}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[12px] font-black tabular-nums px-2 py-0.5 rounded-full ${
                      tone === "emerald"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : tone === "amber"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                        : tone === "rose"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {conversion}%
                  </span>
                </li>
              )
            })}
          </ul>
        </motion.div>
      )}
    </section>
  )
}

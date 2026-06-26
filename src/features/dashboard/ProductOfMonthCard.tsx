import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import Crown from "lucide-react/dist/esm/icons/crown"

import {
  getProductOfMonth,
  type ProductOfMonth,
} from "./analyticsService"

/**
 * Card celebratoria del "Producto del mes" — el más vendido del mes
 * anterior. Aparece en Dashboard (admin) y en ClientHomePage (cliente)
 * como hero rotatorio. Sin esfuerzo de Mari, se autocalcula.
 */

interface Props {
  /** Si es para cliente, hace tap → navega al producto */
  asLink?: boolean
}

export default function ProductOfMonthCard({ asLink = false }: Props) {
  const [data, setData] = useState<ProductOfMonth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProductOfMonth()
      .then((p) => setData(p))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-3xl bg-slate-100 dark:bg-slate-800/40 h-32 animate-pulse" />
    )
  }
  if (!data) return null

  const Wrap: any = asLink ? "a" : "div"
  const wrapProps = asLink
    ? { href: `/?q=${encodeURIComponent(data.product_name)}` }
    : {}

  return (
    <Wrap
      {...wrapProps}
      className="block group"
    >
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 via-pink-50 to-violet-50 dark:from-amber-500/10 dark:via-pink-500/10 dark:to-violet-500/10 overflow-hidden relative"
      >
        {/* Orbe decorativo */}
        <span className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-amber-300/40 dark:bg-amber-400/20 blur-3xl" />
        <span className="absolute -bottom-16 -left-12 w-48 h-48 rounded-full bg-pink-300/40 dark:bg-pink-400/20 blur-3xl" />

        <div className="relative p-4 flex items-center gap-3">
          <div className="shrink-0">
            {data.image_url ? (
              <img
                src={data.image_url}
                alt={data.product_name}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-lg group-hover:scale-105 transition-transform"
              />
            ) : (
              <span className="w-20 h-20 rounded-2xl bg-amber-200 dark:bg-amber-500/30 grid place-items-center text-3xl">
                👑
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest mb-1">
              <Crown size={9} /> Producto del mes
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
              {data.product_name}
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
              <span className="font-black tabular-nums">{data.total_qty}</span>{" "}
              piezas en{" "}
              <span className="font-black tabular-nums">{data.total_orders}</span>{" "}
              pedidos
            </p>
            <p className="text-[9px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
              ganador de {data.monthLabel}
            </p>
          </div>
        </div>
      </motion.section>
    </Wrap>
  )
}

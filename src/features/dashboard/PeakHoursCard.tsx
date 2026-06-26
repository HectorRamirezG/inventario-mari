import { useEffect, useState, useMemo } from "react"
import { motion } from "framer-motion"
import Clock from "lucide-react/dist/esm/icons/clock"

import { getPeakHours, type PeakHour } from "./analyticsService"

/**
 * Gráfica simple de "hora pico" — barras de 24 horas con visitas y
 * ventas overlay. Mari ve a qué hora postear stories / mandar promos.
 */

interface Props {
  /** Días hacia atrás a considerar (default 30). */
  days?: number
}

export default function PeakHoursCard({ days = 30 }: Props) {
  const [data, setData] = useState<PeakHour[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getPeakHours(days)
      .then((d) => setData(d))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [days])

  const maxV = useMemo(() => Math.max(1, ...data.map((d) => d.visits)), [data])
  const maxS = useMemo(() => Math.max(1, ...data.map((d) => d.sales)), [data])
  const topHour = useMemo(() => {
    if (data.length === 0) return null
    const sorted = [...data].sort((a, b) => b.visits - a.visits)
    return sorted[0]
  }, [data])

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 h-44 animate-pulse" />
    )
  }

  // Si todas las visitas son 0, no hace sentido mostrar la card
  const totalVisits = data.reduce((s, d) => s + d.visits, 0)
  if (totalVisits === 0) return null

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 grid place-items-center">
            <Clock size={14} />
          </span>
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Hora pico
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Visitas vs ventas · últimos {days} días
            </p>
          </div>
        </div>
        {topHour && (
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-widest font-black text-sky-700 dark:text-sky-300">
              Pico
            </p>
            <p className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">
              {formatHour(topHour.hour)}
            </p>
          </div>
        )}
      </header>

      {/* Barras */}
      <div className="relative h-32 flex items-end gap-[2px]">
        {data.map((d) => {
          const hVisits = (d.visits / maxV) * 100
          const hSales = (d.sales / maxS) * 60
          return (
            <div
              key={d.hour}
              className="flex-1 relative group"
              title={`${formatHour(d.hour)} · ${d.visits} visitas · ${d.sales} ventas`}
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${hVisits}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-0 left-0 right-0 rounded-t bg-sky-200 dark:bg-sky-500/30 group-hover:bg-sky-300 dark:group-hover:bg-sky-400/50"
              />
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${hSales}%` }}
                transition={{
                  duration: 0.5,
                  delay: 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute bottom-0 left-0 right-0 rounded-t bg-emerald-500/70 dark:bg-emerald-400/70"
              />
            </div>
          )
        })}
      </div>

      {/* Eje X: solo algunas horas */}
      <div className="flex justify-between text-[9px] text-slate-400 font-bold tabular-nums">
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{formatHour(h)}</span>
        ))}
      </div>

      {/* Leyenda */}
      <div className="flex items-center justify-center gap-4 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-sky-200 dark:bg-sky-500/30" />
          <span className="text-slate-500 dark:text-slate-400">Visitas</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-500/70" />
          <span className="text-slate-500 dark:text-slate-400">Ventas</span>
        </span>
      </div>

      {topHour && (
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug italic text-center pt-1">
          Tus clientas visitan más a las{" "}
          <span className="font-black text-sky-700 dark:text-sky-300">
            {formatHour(topHour.hour)}
          </span>
          . Postea historias y promos a esa hora 🎯
        </p>
      )}
    </section>
  )
}

function formatHour(h: number): string {
  const period = h < 12 ? "AM" : "PM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${period}`
}

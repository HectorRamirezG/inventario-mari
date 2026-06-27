import { useEffect, useState, useMemo } from "react"
import { motion } from "framer-motion"
import Clock from "lucide-react/dist/esm/icons/clock"
import Grid3x3 from "lucide-react/dist/esm/icons/grid-3x3"
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3"

import {
  getPeakHours,
  getPeakHoursHeatmap,
  type PeakHour,
  type PeakSlot,
} from "./analyticsService"

/**
 * Gráfica de "hora pico" — dos vistas:
 *  - Barras 24h (default): visitas+ventas por hora del día.
 *  - Heatmap 7×24: intensidad de visitas por día de la semana y hora.
 * Mari ve a qué hora postear stories / mandar promos y qué días son más fuertes.
 */

interface Props {
  /** Días hacia atrás a considerar (default 30). */
  days?: number
}

const DAYS_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

export default function PeakHoursCard({ days = 30 }: Props) {
  const [data, setData] = useState<PeakHour[]>([])
  const [heatmap, setHeatmap] = useState<PeakSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"bars" | "heatmap">("bars")

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getPeakHours(days).catch(() => [] as PeakHour[]),
      getPeakHoursHeatmap(days).catch(() => [] as PeakSlot[]),
    ])
      .then(([d, h]) => {
        setData(d)
        setHeatmap(h)
      })
      .finally(() => setLoading(false))
  }, [days])

  const maxV = useMemo(() => Math.max(1, ...data.map((d) => d.visits)), [data])
  const maxS = useMemo(() => Math.max(1, ...data.map((d) => d.sales)), [data])
  const maxSlotVisits = useMemo(
    () => Math.max(1, ...heatmap.map((s) => s.visits)),
    [heatmap],
  )
  const topHour = useMemo(() => {
    if (data.length === 0) return null
    const sorted = [...data].sort((a, b) => b.visits - a.visits)
    return sorted[0]
  }, [data])

  const topSlot = useMemo(() => {
    if (heatmap.length === 0) return null
    return [...heatmap].sort((a, b) => b.visits - a.visits)[0]
  }, [heatmap])

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
              {view === "bars"
                ? `Visitas vs ventas · últimos ${days} días`
                : `Heatmap día×hora · últimos ${days} días`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle vista barras / heatmap */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setView("bars")}
              aria-pressed={view === "bars"}
              title="Vista barras"
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                view === "bars"
                  ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-sm"
                  : "text-slate-400"
              }`}
            >
              <BarChart3 size={12} />
            </button>
            <button
              type="button"
              onClick={() => setView("heatmap")}
              aria-pressed={view === "heatmap"}
              title="Vista heatmap"
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                view === "heatmap"
                  ? "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-sm"
                  : "text-slate-400"
              }`}
            >
              <Grid3x3 size={12} />
            </button>
          </div>
          {topHour && view === "bars" && (
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest font-black text-sky-700 dark:text-sky-300">
                Pico
              </p>
              <p className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">
                {formatHour(topHour.hour)}
              </p>
            </div>
          )}
          {topSlot && view === "heatmap" && (
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest font-black text-sky-700 dark:text-sky-300">
                Pico
              </p>
              <p className="text-sm font-black tabular-nums text-slate-900 dark:text-slate-100">
                {DAYS_LABEL[topSlot.dayOfWeek]} {formatHour(topSlot.hour)}
              </p>
            </div>
          )}
        </div>
      </header>

      {view === "bars" && (
        <>
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
        </>
      )}

      {view === "heatmap" && (
        <>
          {/* Heatmap 7×24 */}
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="inline-block min-w-full">
              {/* Eje X (horas, compactas: cada 3h) */}
              <div className="flex items-center pl-9 mb-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <span
                    key={h}
                    className="flex-1 text-[8px] text-slate-400 font-bold tabular-nums text-center"
                  >
                    {h % 3 === 0 ? h : ""}
                  </span>
                ))}
              </div>
              {/* Filas: días */}
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <div key={day} className="flex items-center gap-0.5 mb-0.5">
                  <span className="w-8 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0">
                    {DAYS_LABEL[day]}
                  </span>
                  <div className="flex-1 flex items-center gap-[1px]">
                    {Array.from({ length: 24 }, (_, h) => {
                      const slot = heatmap.find(
                        (s) => s.dayOfWeek === day && s.hour === h,
                      )
                      const intensity =
                        slot && maxSlotVisits > 0 ? slot.visits / maxSlotVisits : 0
                      return (
                        <div
                          key={h}
                          className="flex-1 h-4 rounded-sm"
                          style={{
                            backgroundColor:
                              intensity > 0
                                ? `rgba(14, 165, 233, ${0.15 + intensity * 0.8})`
                                : "rgba(148, 163, 184, 0.12)",
                          }}
                          title={`${DAYS_LABEL[day]} ${formatHour(h)} · ${slot?.visits ?? 0} visitas · ${slot?.sales ?? 0} ventas`}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {topSlot && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug italic text-center pt-1">
              Mejor momento:{" "}
              <span className="font-black text-sky-700 dark:text-sky-300">
                {DAYS_LABEL[topSlot.dayOfWeek]} a las {formatHour(topSlot.hour)}
              </span>{" "}
              ({topSlot.visits} visitas)
            </p>
          )}
        </>
      )}
    </section>
  )
}

function formatHour(h: number): string {
  const period = h < 12 ? "AM" : "PM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${period}`
}

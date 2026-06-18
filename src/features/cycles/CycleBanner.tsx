import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { TrendingUp, Trophy, Target, ChevronRight, PlayCircle } from "lucide-react"

import {
  getActiveCycle,
  getCycleSnapshot,
  type CycleSnapshot,
  type InventoryCycle,
} from "../cycles/cyclesService"
import { formatMoney } from "../../lib/format"

/**
 * Banner compacto para el Dashboard que muestra el estado del ciclo
 * activo. Si no hay ciclo, ofrece CTA para abrir uno.
 *
 * Click → navega a la sección "ciclos" del shell admin.
 */
export default function CycleBanner() {
  const [cycle, setCycle] = useState<InventoryCycle | null>(null)
  const [snapshot, setSnapshot] = useState<CycleSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const c = await getActiveCycle()
        if (!alive) return
        setCycle(c)
        if (c) {
          const s = await getCycleSnapshot(c.id)
          if (alive) setSnapshot(s)
        }
      } catch {
        /* silencio: si el SQL aún no se corre, no rompemos el dashboard */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (loading) return null

  const go = () =>
    window.dispatchEvent(
      new CustomEvent("app:navigate", { detail: { tab: "ciclos" } })
    )

  if (!cycle) {
    return (
      <button
        onClick={go}
        className="w-full rounded-2xl p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-primary/40 transition-colors text-left flex items-center gap-3 group"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-bloom shrink-0"
          className="bg-brand"
        >
          <PlayCircle className="text-white" size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black">Abre tu primer ciclo</p>
          <p className="text-[10px] text-slate-500">
            Mide cuándo recuperas la inversión y cuándo ya estás generando
            ganancia neta libre.
          </p>
        </div>
        <ChevronRight size={16} className="text-slate-400 group-hover:text-primary" />
      </button>
    )
  }

  if (!snapshot) return null

  const beReached = !!snapshot.break_even_at
  const pct = Math.min(100, snapshot.break_even_pct || 0)

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={go}
      className="w-full rounded-2xl p-4 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:shadow-md transition-shadow text-left relative overflow-hidden"
    >
      {/* Banda lateral de color */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{
          background: beReached
            ? "linear-gradient(180deg,#10b981,#34d399)"
            : "linear-gradient(180deg, var(--brand-from), var(--brand-to))",
        }}
      />
      <div className="flex items-center gap-3 mb-2 pl-2">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: beReached
              ? "linear-gradient(135deg,#10b981,#34d399)"
              : "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
          }}
        >
          {beReached ? (
            <Trophy className="text-white" size={16} />
          ) : (
            <Target className="text-white" size={16} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none">
            Ciclo activo
          </p>
          <p className="text-xs font-black truncate mt-0.5">{cycle.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[8px] font-black uppercase text-slate-400">
            {beReached ? "Cobrado" : "Recuperado"}
          </p>
          <p
            className={`text-sm font-black tabular-nums ${
              beReached ? "text-emerald-600" : "text-primary"
            }`}
          >
            {pct.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="pl-2 mb-2">
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6 }}
            className="h-full"
            style={{
              background: beReached
                ? "linear-gradient(90deg,#10b981,#34d399)"
                : "linear-gradient(90deg, var(--brand-from), var(--brand-to))",
            }}
          />
        </div>
      </div>

      <div className="pl-2 flex items-center justify-between text-[10px]">
        {beReached ? (
          <p className="text-emerald-600 font-bold flex items-center gap-1">
            <TrendingUp size={10} /> Cada venta nueva = ganancia libre
          </p>
        ) : (
          <p className="text-slate-500 font-bold">
            Faltan{" "}
            <span className="text-slate-900 dark:text-slate-100 font-black">
              {formatMoney(snapshot.remaining_to_be)}
            </span>{" "}
            para break-even
          </p>
        )}
        <ChevronRight size={12} className="text-slate-400" />
      </div>
    </motion.button>
  )
}

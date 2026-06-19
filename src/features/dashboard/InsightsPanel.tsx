import { motion } from "framer-motion"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import {
  Brain,
  ImageOff,
  PackageCheck,
  UserX,
  Clock4,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Crown,
  Layers3,
  ChevronRight,
  MessageCircle,
} from "lucide-react"

import {
  getAbcAnalysis,
  getCLV,
  getHeatmap,
  getInactiveClients,
  getMonthForecast,
  getPeakHours,
  getRestockHints,
  getWeekDelta,
  listProductsWithoutImage,
  type InsightAbcRow,
  type InsightHeatmapCell,
  type InsightInactiveClient,
  type InsightPeakHour,
  type InsightRestockHint,
  type InsightVip,
  type InsightWeekDelta,
  type InsightForecast,
  type InsightProductMissingImage,
} from "./insightsService"
import { formatMoney } from "../../lib/format"
import { useBusinessRules } from "../settings/businessRulesService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"

const DOW = ["D", "L", "M", "X", "J", "V", "S"]

export default function InsightsPanel() {
  const rules = useBusinessRules()
  const queryClient = useQueryClient()
  const monthlyGoal = rules.daily_sales_goal_enabled
    ? rules.daily_sales_goal_amount * 30
    : undefined

  const queries = useQueries({
    queries: [
      { queryKey: ["insights", "missing"], queryFn: () => listProductsWithoutImage(20), staleTime: 60_000 },
      { queryKey: ["insights", "restock"], queryFn: () => getRestockHints(6), staleTime: 60_000 },
      { queryKey: ["insights", "inactive"], queryFn: () => getInactiveClients(60, 6), staleTime: 5 * 60_000 },
      { queryKey: ["insights", "hours"], queryFn: () => getPeakHours(30), staleTime: 5 * 60_000 },
      { queryKey: ["insights", "heatmap"], queryFn: () => getHeatmap(30), staleTime: 5 * 60_000 },
      { queryKey: ["insights", "week"], queryFn: () => getWeekDelta(), staleTime: 60_000 },
      { queryKey: ["insights", "forecast", monthlyGoal ?? null], queryFn: () => getMonthForecast(monthlyGoal), staleTime: 60_000 },
      { queryKey: ["insights", "clv"], queryFn: () => getCLV(5), staleTime: 5 * 60_000 },
      { queryKey: ["insights", "abc"], queryFn: () => getAbcAnalysis(), staleTime: 5 * 60_000 },
    ],
  })

  const [missingQ, restockQ, inactiveQ, hoursQ, heatmapQ, weekQ, forecastQ, clvQ, abcQ] = queries
  const missing: InsightProductMissingImage[] = missingQ.data ?? []
  const restock: InsightRestockHint[] = restockQ.data ?? []
  const inactive: InsightInactiveClient[] = inactiveQ.data ?? []
  const hours: InsightPeakHour[] = hoursQ.data ?? []
  const heatmap: InsightHeatmapCell[] = heatmapQ.data ?? []
  const week: InsightWeekDelta | null = weekQ.data ?? null
  const forecast: InsightForecast | null = forecastQ.data ?? null
  const clv: InsightVip[] = clvQ.data ?? []
  const abc: InsightAbcRow[] = abcQ.data ?? []

  const loading = queries.some((q) => q.isLoading)

  const load = () => {
    queryClient.invalidateQueries({ queryKey: ["insights"] })
  }

  // Refresh inteligente: invalida en cambios de venta/pago/producto.
  const invalidate = useDebouncedCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["insights"] })
  }, 800)
  useRealtimeSubscription("sales", invalidate)
  useRealtimeSubscription("payments", invalidate)
  useRealtimeSubscription("products", invalidate)
  useRealtimeSubscription("variants", invalidate)

  const peakTop = [...hours].sort((a, b) => b.count - a.count).slice(0, 3)
  const maxHeat = Math.max(1, ...heatmap.map((c) => c.count))
  const aCount = abc.filter((x) => x.klass === "A").length
  const aRevenue = abc.filter((x) => x.klass === "A").reduce((s, x) => s + x.revenue, 0)
  const totalRev = abc.reduce((s, x) => s + x.revenue, 0)

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-4 sm:p-5 mb-6 space-y-4"
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-bloom shrink-0"
            style={{ background: "linear-gradient(135deg,#0ea5e9,#6366f1)" }}
          >
            <Brain size={14} />
          </div>
          <div className="min-w-0">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 leading-none">
              Insights inteligentes
            </h3>
            <p className="text-[9px] font-bold text-slate-400 leading-none mt-0.5">
              Patrones detectados en tus últimos 30 días
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refrescar"
          className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center press disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Comparador semanal */}
        {week && (
          <Card
            tone={week.pct >= 0 ? "emerald" : "rose"}
            title={week.pct >= 0 ? "Semana en alza" : "Semana a la baja"}
            icon={week.pct >= 0 ? TrendingUp : TrendingDown}
          >
            <p className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100 leading-none mt-1">
              {formatMoney(week.thisWeek)}
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              vs {formatMoney(week.lastWeek)} la semana pasada · {" "}
              <span className={week.pct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {week.pct >= 0 ? "+" : ""}
                {week.pct.toFixed(1)}%
              </span>
            </p>
          </Card>
        )}

        {/* Forecast */}
        {forecast && (
          <Card tone="sky" title="Proyección del mes" icon={Target}>
            <p className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100 leading-none mt-1">
              {formatMoney(forecast.projected)}
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              Día {forecast.daysElapsed} de {forecast.daysInMonth}
              {forecast.paceVsTarget != null && (
                <>
                  {" · "}
                  <span
                    className={
                      forecast.paceVsTarget >= 100
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }
                  >
                    {forecast.paceVsTarget.toFixed(0)}% de meta
                  </span>
                </>
              )}
            </p>
          </Card>
        )}

        {/* Restock */}
        {restock.length > 0 && (
          <Card tone="amber" title="A punto de agotarse" icon={PackageCheck} span={2}>
            <ul className="space-y-1 mt-1">
              {restock.map((r) => (
                <li
                  key={r.variant_id}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="font-bold text-slate-700 dark:text-slate-200 truncate flex-1">
                    {r.product_name}
                    {r.variant_name && (
                      <span className="text-slate-400"> · {r.variant_name}</span>
                    )}
                  </span>
                  <span className="text-[9px] font-black uppercase tabular-nums text-amber-700 dark:text-amber-300 shrink-0">
                    {r.stock} pz · {r.days_left}d
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Sin foto */}
        {missing.length > 0 && (
          <Card tone="rose" title="Sin foto" icon={ImageOff}>
            <p className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100 leading-none mt-1">
              {missing.length}
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5 line-clamp-2">
              {missing.slice(0, 3).map((p) => p.name).join(", ")}
              {missing.length > 3 ? "…" : ""}
            </p>
          </Card>
        )}

        {/* Hora pico */}
        {peakTop.length > 0 && peakTop[0].count > 0 && (
          <Card tone="violet" title="Horas pico de venta" icon={Clock4}>
            <p className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100 leading-none mt-1">
              {peakTop.map((p) => `${p.hour}:00`).join(" · ")}
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              Las 3 horas con más actividad
            </p>
          </Card>
        )}

        {/* Clientes inactivos */}
        {inactive.length > 0 && (
          <Card tone="slate" title="Clientes a recuperar" icon={UserX} span={2}>
            <ul className="space-y-1 mt-1">
              {inactive.map((c) => (
                <li
                  key={c.email}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-700 dark:text-slate-200 truncate">
                      {c.name ?? c.email}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {c.days_inactive}d sin comprar · {formatMoney(c.total_spent)} histórico
                    </p>
                  </div>
                  <a
                    href={`mailto:${c.email}?subject=${encodeURIComponent(
                      "Te extrañamos en Beauty's Me 💖",
                    )}&body=${encodeURIComponent(
                      `Hola ${c.name?.split(" ")[0] ?? ""}, hace tiempo no te vemos en la tienda. Tenemos novedades que te van a encantar 💖`,
                    )}`}
                    className="h-7 px-2.5 rounded-lg bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1 shrink-0"
                  >
                    <MessageCircle size={10} /> Mensaje
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Top clientes (CLV) */}
        {clv.length > 0 && (
          <Card tone="amber" title="Top clientes" icon={Crown}>
            <ul className="space-y-1 mt-1">
              {clv.slice(0, 4).map((c, i) => (
                <li key={c.email} className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[9px] font-black text-amber-600 w-3">
                    {i + 1}
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 truncate flex-1">
                    {c.name ?? c.email}
                  </span>
                  <span className="text-[9px] font-black tabular-nums text-slate-600 dark:text-slate-300">
                    {formatMoney(c.total)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ABC */}
        {abc.length > 0 && (
          <Card tone="emerald" title="Análisis ABC" icon={Layers3}>
            <p className="text-xl font-black tabular-nums text-slate-900 dark:text-slate-100 leading-none mt-1">
              {aCount}
              <span className="text-[10px] font-bold text-slate-500 ml-1">
                productos clase A
              </span>
            </p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              Generan {totalRev > 0 ? ((aRevenue / totalRev) * 100).toFixed(0) : 0}% de los ingresos
            </p>
          </Card>
        )}

        {/* Heatmap */}
        {heatmap.length > 0 && (
          <Card tone="sky" title="Mapa de actividad" icon={Clock4} span={2}>
            <div className="mt-2 overflow-x-auto">
              <div className="inline-grid" style={{ gridTemplateColumns: "auto repeat(24, 10px)" }}>
                <div />
                {Array.from({ length: 24 }).map((_, h) => (
                  <div
                    key={h}
                    className="text-[7px] text-center text-slate-400 tabular-nums"
                  >
                    {h % 6 === 0 ? h : ""}
                  </div>
                ))}
                {DOW.map((label, dow) => (
                  <DowRow
                    key={dow}
                    label={label}
                    dow={dow}
                    heatmap={heatmap}
                    maxHeat={maxHeat}
                  />
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </motion.section>
  )
}

function DowRow({
  label,
  dow,
  heatmap,
  maxHeat,
}: {
  label: string
  dow: number
  heatmap: InsightHeatmapCell[]
  maxHeat: number
}) {
  return (
    <>
      <div className="text-[7px] font-black uppercase text-slate-400 pr-1 flex items-center">
        {label}
      </div>
      {Array.from({ length: 24 }).map((_, hour) => {
        const cell = heatmap.find((c) => c.dow === dow && c.hour === hour)
        const intensity = cell ? cell.count / maxHeat : 0
        return (
          <div
            key={hour}
            className="w-[8px] h-[8px] m-[1px] rounded-[2px]"
            style={{
              background:
                intensity === 0
                  ? "rgba(148,163,184,0.15)"
                  : `rgba(14,165,233,${Math.min(1, 0.2 + intensity * 0.8)})`,
            }}
            title={`${label} ${hour}:00 — ${cell?.count ?? 0}`}
          />
        )
      })}
    </>
  )
}

function Card({
  tone,
  title,
  icon: Icon,
  children,
  span = 1,
}: {
  tone: "emerald" | "rose" | "amber" | "violet" | "sky" | "slate"
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  children: React.ReactNode
  span?: 1 | 2
}) {
  const toneBg: Record<typeof tone, string> = {
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
    sky: "bg-sky-500",
    slate: "bg-slate-500",
  }
  return (
    <div
      className={`rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 ${
        span === 2 ? "sm:col-span-2" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-7 h-7 rounded-lg ${toneBg[tone]} text-white flex items-center justify-center shrink-0`}
        >
          <Icon size={12} />
        </div>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex-1">
          {title}
        </p>
        <ChevronRight size={11} className="text-slate-300" />
      </div>
      <div>{children}</div>
    </div>
  )
}

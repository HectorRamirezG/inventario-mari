import { useEffect, useMemo, useState } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from "recharts"
import { formatMoney as formatCurrency } from "../../lib/format"

/**
 * TrendChart — gráfica de tendencia de ingresos + ganancia por día.
 *
 * AISLADO en su propio archivo para que `recharts` (~250kb gz) viaje
 * en un chunk separado y NO entre al bundle del dashboard si nunca
 * se renderiza (ej. dispositivos con conexión lenta que no llegan
 * a hacer scroll).
 *
 * En DashboardPage se importa con `lazy()` + `Suspense` y muestra
 * skeleton mientras carga.
 */

export interface TrendChartProps {
  data: {
    date: string
    label: string
    revenue: number
    profit: number
    operations: number
  }[]
  periodLabel: string
}

export default function TrendChart({ data, periodLabel }: TrendChartProps) {
  // Lee el color del tema desde CSS vars para que el chart se tiña
  // automáticamente al cambiar el accent en Reglas.
  const [brandColor, setBrandColor] = useState<string>(() => {
    if (typeof window === "undefined") return "#e6007e"
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--brand-from")
      .trim()
    return v || "#e6007e"
  })
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue("--brand-from")
        .trim()
      if (v && v !== brandColor) setBrandColor(v)
    }, 2000)
    return () => window.clearInterval(id)
  }, [brandColor])

  // Limita los ticks visibles del eje X según cantidad de datos
  const tickEvery = useMemo(() => {
    if (data.length <= 10) return 1
    if (data.length <= 30) return 5
    return 10
  }, [data.length])

  const customTickFormatter = (label: string, index: number) => {
    if (index % tickEvery === 0) return label
    return ""
  }

  return (
    <section className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-black flex items-center gap-1.5">
            <TrendingUp size={14} className="text-primary" />
            Tendencia
          </h4>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
            {periodLabel}
          </p>
        </div>
        <Legend />
      </div>

      {/* `touch-action: pan-y` evita que Recharts atrape el gesto vertical
          y bloquee el scroll de la página cuando Mari pasa el dedo sobre
          el chart en móvil. El tooltip sigue funcionando con tap.
          `minWidth={0}` en el ResponsiveContainer evita el warning de
          Recharts cuando el chart se monta dentro de una transición
          (AnimatePresence) y aún no tiene tamaño calculado. */}
      <div className="h-[240px] w-full min-w-0" style={{ touchAction: "pan-y" }}>
        {data.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={brandColor} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={brandColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-profit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                fontSize={10}
                interval={0}
                tickFormatter={(v: any, i: number) =>
                  customTickFormatter(String(v), i)
                }
              />
              <YAxis hide yAxisId="left" tickFormatter={(v) => String(v)} />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #f1f5f9",
                  fontSize: 11,
                  fontWeight: 700,
                }}
                formatter={
                  ((v: any, key: any) => [
                    typeof v === "number" ? formatCurrency(v) : v,
                    key === "revenue" ? "Ingresos" : "Ganancia",
                  ]) as any
                }
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke={brandColor}
                strokeWidth={2}
                fill="url(#grad-revenue)"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="profit"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#grad-profit)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
      <span className="flex items-center gap-1.5 text-primary">
        <span className="w-2.5 h-2.5 rounded-full bg-primary" />
        Ingresos
      </span>
      <span className="flex items-center gap-1.5 text-emerald-600">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
        Ganancia
      </span>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-slate-400">
      <TrendingDown size={28} className="mb-2 opacity-50" />
      <p className="text-xs font-black uppercase tracking-widest">
        Sin ventas en este período
      </p>
    </div>
  )
}

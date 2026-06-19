import { useEffect, useRef, useState, type ReactNode } from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import Sparkline from "./Sparkline"

type KpiTone = "default" | "primary" | "success" | "danger" | "warn"

interface KpiCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: KpiTone
  /** Datos opcionales para sparkline (mini gráfica al fondo). */
  sparkline?: number[]
  /** Delta % vs período anterior. Pinta flecha + color. */
  delta?: number
  /** Icono opcional para mostrar al lado del label. */
  icon?: ReactNode
}

const TONE_CLASS: Record<KpiTone, string> = {
  default: "kpi-card-tone-default",
  primary: "kpi-card-tone-primary",
  success: "kpi-card-tone-success",
  danger: "kpi-card-tone-danger",
  warn: "kpi-card-tone-warn",
}

const SPARK_COLOR: Record<KpiTone, string> = {
  default: "#94a3b8",
  primary: "#e6007e",
  success: "#10b981",
  danger: "#ef4444",
  warn: "#f59e0b",
}

/** Resuelve el color del sparkline. Para `primary` lee la CSS var
 *  --color-primary en runtime para que cambie con el tema elegido. */
function resolveSparkColor(tone: KpiTone): string {
  if (tone === "primary" && typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-primary")
      .trim()
    if (v) return v
  }
  return SPARK_COLOR[tone]
}

/**
 * Tarjeta de métrica (KPI). Tono semántico opcional.
 * Todas las KPI de la app deben usar este componente.
 *
 * Extensiones:
 *  - `sparkline`: array de números para mini-gráfica de tendencia
 *  - `delta`: % de cambio vs período anterior (auto color + flecha)
 *  - `icon`: nodo para ícono junto al label
 */
export default function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  sparkline,
  delta,
  icon,
}: KpiCardProps) {
  const sparkColor = resolveSparkColor(tone)
  const showDelta = typeof delta === "number" && Number.isFinite(delta)
  const deltaTrend = showDelta ? (delta! > 0.5 ? "up" : delta! < -0.5 ? "down" : "flat") : null
  const deltaCls =
    deltaTrend === "up"   ? "text-emerald-600 dark:text-emerald-400" :
    deltaTrend === "down" ? "text-rose-600 dark:text-rose-400" :
    "text-slate-400 dark:text-slate-500"
  const DeltaIcon = deltaTrend === "up" ? TrendingUp : deltaTrend === "down" ? TrendingDown : Minus

  // Pulse cuando cambia el valor — feedback visual en realtime sin
  // necesidad de toast. Solo dispara tras el primer render para no
  // flashear en el mount inicial.
  const prev = useRef<unknown>(value)
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    if (prev.current === value) return
    const isFirst = prev.current === undefined
    prev.current = value
    if (isFirst) return
    setPulse(true)
    const id = window.setTimeout(() => setPulse(false), 900)
    return () => window.clearTimeout(id)
  }, [value])

  return (
    <div
      className={`kpi-card ${TONE_CLASS[tone]} relative overflow-hidden group transition-shadow ${
        pulse ? "ring-2 ring-primary/40 shadow-bloom" : ""
      }`}
    >
      <div className="relative z-10">
        <p className="text-[7px] font-black uppercase tracking-widest opacity-70 flex items-center gap-1">
          {icon && <span className="opacity-80">{icon}</span>}
          {label}
        </p>
        <p className="text-sm font-black tabular-nums mt-1 leading-tight">
          {value}
        </p>
        {(hint || showDelta) && (
          <div className="flex items-center gap-1.5 mt-0.5 leading-tight">
            {showDelta && (
              <span className={`inline-flex items-center gap-0.5 text-[8px] font-black ${deltaCls}`}>
                <DeltaIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
                {Math.abs(delta!).toFixed(0)}%
              </span>
            )}
            {hint && (
              <span className="text-[8px] font-bold opacity-60">
                {hint}
              </span>
            )}
          </div>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="absolute bottom-1 right-1 opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Sparkline
            data={sparkline}
            width={48}
            height={20}
            stroke={sparkColor}
            strokeWidth={1.25}
            showDot={false}
          />
        </div>
      )}
    </div>
  )
}


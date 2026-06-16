import type { ReactNode } from "react"

type KpiTone = "default" | "primary" | "success" | "danger" | "warn"

interface KpiCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: KpiTone
}

const TONE_CLASS: Record<KpiTone, string> = {
  default: "kpi-card-tone-default",
  primary: "kpi-card-tone-primary",
  success: "kpi-card-tone-success",
  danger: "kpi-card-tone-danger",
  warn: "kpi-card-tone-warn",
}

/**
 * Tarjeta de métrica (KPI). Tono semántico opcional.
 * Todas las KPI de la app deben usar este componente.
 */
export default function KpiCard({ label, value, hint, tone = "default" }: KpiCardProps) {
  return (
    <div className={`kpi-card ${TONE_CLASS[tone]}`}>
      <p className="text-[7px] font-black uppercase tracking-widest opacity-70">
        {label}
      </p>
      <p className="text-sm font-black tabular-nums mt-1 leading-tight">
        {value}
      </p>
      {hint && (
        <p className="text-[8px] font-bold opacity-60 mt-0.5 leading-tight">
          {hint}
        </p>
      )}
    </div>
  )
}

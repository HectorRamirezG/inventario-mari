import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export interface PageHeaderStat {
  label: string
  value: string | number
  tone?: "primary" | "amber" | "emerald" | "rose" | "slate" | "sky"
  icon?: LucideIcon
}

interface PageHeaderProps {
  icon?: LucideIcon
  iconTone?: "primary" | "amber" | "emerald" | "rose" | "slate"
  title: string
  subtitle?: ReactNode
  right?: ReactNode
  /** Si true, oculta el divider gradient debajo. Default: false. */
  noDivider?: boolean
  /**
   * Mini stats horizontales que se renderizan DEBAJO del subtitle como
   * pills compactos. Útil para mostrar KPIs primarios sin meter una grid
   * de KpiCard adicional (ej. inventario: total · agotados · bajo stock).
   * Se hacen scroll horizontal en mobile si no caben.
   */
  stats?: PageHeaderStat[]
}

const ICON_TONE: Record<NonNullable<PageHeaderProps["iconTone"]>, string> = {
  primary: "text-primary",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  rose: "text-rose-500",
  slate: "text-slate-500",
}

const ICON_BG: Record<NonNullable<PageHeaderProps["iconTone"]>, string> = {
  primary: "bg-primary/10 dark:bg-primary/20",
  amber: "bg-amber-50 dark:bg-amber-500/15",
  emerald: "bg-emerald-50 dark:bg-emerald-500/15",
  rose: "bg-rose-50 dark:bg-rose-500/15",
  slate: "bg-slate-100 dark:bg-slate-800",
}

const STAT_TONE: Record<NonNullable<PageHeaderStat["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rose: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  sky: "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
}

/**
 * Encabezado de página estándar. Úsalo en TODAS las páginas/módulos:
 * - icono lucide a la izquierda con tono semántico (chip coloreado)
 * - título en mayúsculas tracking-tight
 * - subtítulo / contador de items debajo
 * - acción opcional a la derecha (botón refresh, KPI rápido, etc.)
 * - stats opcionales debajo del subtitle (pills horizontales)
 * - divider gradient debajo (opt-out con noDivider)
 */
export default function PageHeader({
  icon: Icon,
  iconTone = "primary",
  title,
  subtitle,
  right,
  noDivider = false,
  stats,
}: PageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="page-header">
        <div className="min-w-0 flex items-center gap-2.5">
          {Icon && (
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ICON_BG[iconTone]}`}
            >
              <Icon size={16} className={ICON_TONE[iconTone]} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-black italic uppercase tracking-tighter text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {subtitle !== undefined && subtitle !== null && (
              <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mt-1">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>

      {/* Mini stats — pills horizontales scrolleables */}
      {stats && stats.length > 0 && (
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 scroll-container-ios">
          {stats.map((s, i) => {
            const StatIcon = s.icon
            return (
              <div
                key={`${s.label}-${i}`}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full ${STAT_TONE[s.tone ?? "slate"]}`}
                title={`${s.label}: ${s.value}`}
              >
                {StatIcon && <StatIcon size={11} />}
                <span className="text-[9px] font-black uppercase tracking-widest opacity-70">
                  {s.label}
                </span>
                <span className="text-[11px] font-black tabular-nums">
                  {s.value}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {!noDivider && <hr className="divider-soft mt-3 mb-1" />}
    </div>
  )
}

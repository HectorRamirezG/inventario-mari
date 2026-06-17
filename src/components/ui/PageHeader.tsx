import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

interface PageHeaderProps {
  icon?: LucideIcon
  iconTone?: "primary" | "amber" | "emerald" | "rose" | "slate"
  title: string
  subtitle?: ReactNode
  right?: ReactNode
  /** Si true, oculta el divider gradient debajo. Default: false. */
  noDivider?: boolean
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

/**
 * Encabezado de página estándar. Úsalo en TODAS las páginas/módulos:
 * - icono lucide a la izquierda con tono semántico (chip coloreado)
 * - título en mayúsculas tracking-tight
 * - subtítulo / contador de items debajo
 * - acción opcional a la derecha (botón refresh, KPI rápido, etc.)
 * - divider gradient debajo (opt-out con noDivider)
 */
export default function PageHeader({
  icon: Icon,
  iconTone = "primary",
  title,
  subtitle,
  right,
  noDivider = false,
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
      {!noDivider && <hr className="divider-soft mt-3 mb-1" />}
    </div>
  )
}

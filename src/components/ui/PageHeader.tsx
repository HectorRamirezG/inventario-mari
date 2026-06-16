import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

interface PageHeaderProps {
  icon?: LucideIcon
  iconTone?: "primary" | "amber" | "emerald" | "rose" | "slate"
  title: string
  subtitle?: ReactNode
  right?: ReactNode
}

const ICON_TONE: Record<NonNullable<PageHeaderProps["iconTone"]>, string> = {
  primary: "text-primary",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  rose: "text-rose-500",
  slate: "text-slate-500",
}

/**
 * Encabezado de página estándar. Úsalo en TODAS las páginas/módulos:
 * - icono lucide a la izquierda con tono semántico
 * - título en mayúsculas tracking-tight
 * - subtítulo / contador de items debajo
 * - acción opcional a la derecha (botón refresh, KPI rápido, etc.)
 */
export default function PageHeader({
  icon: Icon,
  iconTone = "primary",
  title,
  subtitle,
  right,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-slate-900 dark:text-slate-100">
          {Icon && <Icon size={14} className={ICON_TONE[iconTone]} />}
          {title}
        </h2>
        {subtitle !== undefined && subtitle !== null && (
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

export interface TabItem<TId extends string = string> {
  id: TId
  label: string
  icon?: LucideIcon
  /** Badge numérico opcional. 0 o undefined = no se muestra. */
  badge?: number
  /** Tono del badge cuando no está activo el tab. Default: slate. */
  badgeTone?: "slate" | "primary" | "danger" | "success" | "warn"
}

interface TabBarProps<TId extends string = string> {
  tabs: readonly TabItem<TId>[]
  active: TId
  onChange: (id: TId) => void
  /** layoutId único para la animación entre tabs */
  layoutId: string
}

const BADGE_TONES: Record<NonNullable<TabItem["badgeTone"]>, string> = {
  slate: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  primary: "bg-primary/15 text-primary",
  danger: "bg-rose-500 text-white",
  success: "bg-emerald-500 text-white",
  warn: "bg-amber-500 text-white",
}

/**
 * Barra de pestañas estándar. Píldora con indicador animado (framer-motion).
 * Usada por todos los módulos con tabs (Pricing, Apartados, etc.) para que
 * compartan EXACTAMENTE el mismo radio, padding, animación y estado activo.
 */
export default function TabBar<TId extends string = string>({
  tabs,
  active,
  onChange,
  layoutId,
}: TabBarProps<TId>) {
  return (
    <nav className="tab-bar">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = active === tab.id
        const showBadge = typeof tab.badge === "number" && tab.badge > 0
        const tone = tab.badgeTone ?? "slate"
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`tab-item ${isActive ? "tab-item-active" : ""}`}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="tab-item-bg"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            {Icon && <Icon size={12} className="relative z-10" />}
            <span className="relative z-10">{tab.label}</span>
            {showBadge && (
              <span
                className={`relative z-10 min-w-4 h-4 px-1 rounded-full text-[8px] font-black tabular-nums flex items-center justify-center ${
                  isActive ? "bg-white/25 text-white" : BADGE_TONES[tone]
                }`}
              >
                {tab.badge! > 99 ? "99+" : tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}

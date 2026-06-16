import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

export interface TabItem<TId extends string = string> {
  id: TId
  label: string
  icon?: LucideIcon
}

interface TabBarProps<TId extends string = string> {
  tabs: readonly TabItem<TId>[]
  active: TId
  onChange: (id: TId) => void
  /** layoutId único para la animación entre tabs */
  layoutId: string
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
          </button>
        )
      })}
    </nav>
  )
}

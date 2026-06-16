import type { ReactNode } from "react"

interface SectionCardProps {
  children: ReactNode
  className?: string
  /** Activa hover (lift + ring rosa). Usa cuando la card es clicable. */
  interactive?: boolean
  /** Quita padding interno (útil para listas internas full-bleed) */
  noPadding?: boolean
  onClick?: () => void
  as?: "div" | "section" | "article"
}

/**
 * Contenedor de sección estándar. SUSTITUYE cualquier
 *   `bg-white/80`, `bg-white border border-slate-100`, `bg-white shadow-sm`, etc.
 * en TODA la app. Garantiza contraste consistente en light/dark.
 */
export default function SectionCard({
  children,
  className = "",
  interactive = false,
  noPadding = false,
  onClick,
  as = "div",
}: SectionCardProps) {
  const Tag = as as any
  return (
    <Tag
      onClick={onClick}
      className={`surface-card ${interactive ? "surface-card-hover" : ""} ${
        noPadding ? "" : "p-4"
      } ${className}`}
    >
      {children}
    </Tag>
  )
}

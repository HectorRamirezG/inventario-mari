import { forwardRef, type HTMLAttributes, type ReactNode } from "react"
import { motion } from "framer-motion"

/**
 * Tarjeta base reutilizable para listas del cliente (MyOrders,
 * MyWishes, MyReports, Priority). Unifica look: rounded-2xl, border
 * sutil, fondo blanco/slate-900, padding p-3, hover sutil.
 *
 * Variantes:
 *  - tone="default": gris neutro (la mayoría)
 *  - tone="primary": tinte rosa para items no leídos / con foco
 *  - tone="success" / "warn" / "danger": para estados
 *
 * Si `as="button"`, el card se renderiza como `<motion.button>` con
 * press feedback. Si `as="div"` (default), es contenedor estático.
 *
 * NOTA: NO migramos todas las cards existentes ahora (riesgo alto).
 * Este componente queda disponible para Mari pida cuándo y dónde
 * migrar (página por página). El look ya es ~80% compatible con
 * lo existente, así que la migración es replace cuasi-1-a-1.
 */
export type ClientListCardTone =
  | "default"
  | "primary"
  | "success"
  | "warn"
  | "danger"

const TONE_BG: Record<ClientListCardTone, string> = {
  default:
    "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800",
  primary:
    "bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/30",
  success:
    "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30",
  warn:
    "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30",
  danger:
    "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30",
}

const TONE_HOVER: Record<ClientListCardTone, string> = {
  default: "hover:bg-slate-50 dark:hover:bg-slate-800/60",
  primary: "hover:bg-primary/10 dark:hover:bg-primary/15",
  success: "hover:bg-emerald-100 dark:hover:bg-emerald-500/15",
  warn: "hover:bg-amber-100 dark:hover:bg-amber-500/15",
  danger: "hover:bg-rose-100 dark:hover:bg-rose-500/15",
}

interface BaseProps {
  tone?: ClientListCardTone
  className?: string
  children: ReactNode
  /** Si true, agrega el efecto de "arrow nudge" para indicar que algo se
   *  mueve al hacer click (ver `.nudge-on-hover` en index.css). */
  nudge?: boolean
}

interface DivProps extends BaseProps, HTMLAttributes<HTMLDivElement> {
  as?: "div"
}

interface ButtonProps
  extends BaseProps,
    Omit<HTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDragStart" | "onDragEnd" | "onDrag"> {
  as: "button"
  onClick: () => void
  disabled?: boolean
}

type Props = DivProps | ButtonProps

const ClientListCard = forwardRef<HTMLElement, Props>(function ClientListCard(
  props,
  ref,
) {
  const { tone = "default", className = "", children, nudge = false } = props
  const baseClasses = [
    "rounded-2xl border p-3 transition-colors",
    TONE_BG[tone],
    nudge ? "nudge-on-hover" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  if (props.as === "button") {
    const { onClick, disabled } = props
    return (
      <motion.button
        ref={ref as React.Ref<HTMLButtonElement>}
        layout
        type="button"
        onClick={onClick}
        disabled={disabled}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${baseClasses} ${TONE_HOVER[tone]} press text-left w-full disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {children}
      </motion.button>
    )
  }

  return (
    <motion.div
      ref={ref as React.Ref<HTMLDivElement>}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={baseClasses}
    >
      {children}
    </motion.div>
  )
})

export default ClientListCard

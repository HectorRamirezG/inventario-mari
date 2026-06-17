import { Star } from "lucide-react"

interface Props {
  value: number
  /** Si se pasa, hace clickable (cliente puede setear rating). */
  onChange?: (v: number) => void
  size?: number
  /** Color del icono. Default amber. */
  tone?: "amber" | "primary" | "slate"
  /** Si se muestra la cuenta numérica al lado (ej. 4.7). */
  showValue?: boolean
}

/**
 * Stars reusable para rating. Inactiva = sólo display.
 * Activa (con onChange) = input radio en estrellas.
 */
export default function ReviewStars({
  value,
  onChange,
  size = 14,
  tone = "amber",
  showValue,
}: Props) {
  const interactive = !!onChange
  const fillCls =
    tone === "amber"
      ? "text-amber-400"
      : tone === "primary"
      ? "text-primary"
      : "text-slate-500"
  const emptyCls = "text-slate-200 dark:text-slate-700"

  return (
    <div className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n
        const halfFilled = !filled && value >= n - 0.5
        const cls = filled || halfFilled ? fillCls : emptyCls
        const Element = interactive ? "button" : "span"
        return (
          <Element
            key={n}
            type={interactive ? "button" : undefined}
            onClick={interactive ? () => onChange?.(n) : undefined}
            className={`inline-flex ${interactive ? "press cursor-pointer" : ""}`}
            aria-label={interactive ? `${n} estrellas` : undefined}
          >
            <Star
              size={size}
              className={cls}
              fill={filled ? "currentColor" : "none"}
              strokeWidth={2}
            />
          </Element>
        )
      })}
      {showValue && (
        <span className="ml-1 text-[11px] font-black tabular-nums text-slate-700 dark:text-slate-200">
          {value.toFixed(1)}
        </span>
      )}
    </div>
  )
}

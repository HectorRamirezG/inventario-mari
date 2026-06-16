import { motion } from "framer-motion"

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  size?: "sm" | "md"
  label?: string
}

/**
 * Switch / toggle reutilizable. Acompaña a las reglas de negocio y a
 * cualquier otra preferencia booleana.
 */
export default function Toggle({
  checked,
  onChange,
  disabled = false,
  size = "md",
  label,
}: ToggleProps) {
  const w = size === "sm" ? "w-9 h-5" : "w-11 h-6"
  const knob = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"
  const travel = size === "sm" ? 16 : 20

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center rounded-full transition-colors duration-200 ${w} p-0.5 shrink-0 ${
        disabled
          ? "bg-slate-200 dark:bg-slate-700 opacity-50 cursor-not-allowed"
          : checked
          ? "bg-primary shadow-bloom"
          : "bg-slate-200 dark:bg-slate-700"
      }`}
    >
      <motion.span
        className={`bg-white dark:bg-slate-100 rounded-full shadow ${knob}`}
        animate={{ x: checked ? travel : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  )
}

import { Moon, Sun } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "../../lib/useTheme"

/**
 * Toggle compacto de tema. Cambia entre light/dark con animación.
 * Persiste en localStorage vía `useTheme`.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { effective, toggle } = useTheme()
  const isDark = effective === "dark"

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={`relative w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-colors ${
        isDark
          ? "bg-slate-800 text-amber-400 hover:bg-slate-700"
          : "bg-slate-100 text-primary hover:bg-pink-50"
      } ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isDark ? "moon" : "sun"}
          initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
        >
          {isDark ? <Moon size={16} /> : <Sun size={16} />}
        </motion.div>
      </AnimatePresence>
    </button>
  )
}

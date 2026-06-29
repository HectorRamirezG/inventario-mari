import { Moon, Sun, Lock } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "../../lib/useTheme"
import { useBusinessRules } from "../../features/settings/businessRulesService"
import toast from "react-hot-toast"

/**
 * Toggle compacto de tema. Cambia entre light/dark con animación.
 * Persiste en localStorage vía `useTheme`.
 *
 * Si la tienda forzó un modo (force_dark_mode o force_light_mode), el
 * toggle se muestra deshabilitado con candado para que el usuario
 * sepa que el bloqueo viene del admin, no es un bug.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { effective, toggle } = useTheme()
  const rules = useBusinessRules()
  const locked = rules.force_dark_mode || rules.force_light_mode
  const isDark = effective === "dark"

  function handleClick() {
    if (locked) {
      toast(
        rules.force_dark_mode
          ? "La tienda está en modo oscuro forzado"
          : "La tienda está en modo claro forzado",
        { duration: 2000 },
      )
      return
    }
    toggle()
  }

  return (
    <button
      onClick={handleClick}
      aria-label={
        locked
          ? "Tema bloqueado por la tienda"
          : isDark
          ? "Cambiar a modo claro"
          : "Cambiar a modo oscuro"
      }
      title={
        locked
          ? "Tema bloqueado por la tienda"
          : isDark
          ? "Cambiar a modo claro"
          : "Cambiar a modo oscuro"
      }
      className={`relative w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-colors ${
        isDark
          ? "bg-slate-800 text-amber-400 hover:bg-slate-700"
          : "bg-slate-100 text-primary hover:bg-pink-50"
      } ${locked ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
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
      {locked && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
          <Lock size={7} strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

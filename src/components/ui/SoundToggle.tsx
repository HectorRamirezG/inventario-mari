import { Volume2, VolumeX } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import toast from "react-hot-toast"

import { useUserPrefs } from "../../lib/userPrefs"
import { useFeedback } from "../../lib/useFeedback"

/**
 * Toggle compacto de sonido. Persiste en `userPrefs.sounds` (localStorage).
 * Visible en el header del shop para que el cliente pueda silenciar
 * la app rápidamente sin entrar a Settings.
 */
export default function SoundToggle({ className = "" }: { className?: string }) {
  const { prefs, set } = useUserPrefs()
  const { tap } = useFeedback()

  function handleClick() {
    tap()
    const next = !prefs.sounds
    set("sounds", next)
    toast(next ? "Sonido activado 🔊" : "Sonido silenciado 🔇", {
      duration: 1500,
      icon: next ? "🔊" : "🔇",
    })
  }

  const isOn = prefs.sounds

  return (
    <button
      onClick={handleClick}
      aria-label={isOn ? "Silenciar sonidos" : "Activar sonidos"}
      title={isOn ? "Silenciar sonidos" : "Activar sonidos"}
      className={`relative w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-colors ${
        isOn
          ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-pink-50 dark:hover:bg-slate-700"
          : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
      } ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isOn ? "on" : "off"}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {isOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </motion.div>
      </AnimatePresence>
      {!isOn && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-slate-400 dark:bg-slate-500 ring-2 ring-white dark:ring-slate-900" />
      )}
    </button>
  )
}

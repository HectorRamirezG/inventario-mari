import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles } from "lucide-react"

/**
 * Cortina blanca/oscura que se desvanece sobre la app cuando el user
 * cierra sesión. Cubre el período entre que llamamos a supabase.auth.signOut()
 * y que React rerender la pantalla de Login, eliminando el parpadeo
 * intermedio (shell admin → blanco → login).
 *
 * Se activa al evento `mari:signing-out` (disparado desde useAuth.signOut)
 * y se mantiene visible ~700ms. Sin interacción durante ese período.
 */
export default function SignOutOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const onSigningOut = () => {
      setVisible(true)
      // Mantenemos la cortina ~700ms para cubrir signOut + rerender al Login.
      window.setTimeout(() => setVisible(false), 700)
    }
    window.addEventListener("mari:signing-out", onSigningOut)
    return () => window.removeEventListener("mari:signing-out", onSigningOut)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="signout-veil"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9998] bg-white dark:bg-slate-950 flex items-center justify-center pointer-events-auto"
          style={{ willChange: "opacity" }}
        >
          <div className="flex flex-col items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-bloom"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)",
              }}
            >
              <Sparkles size={20} className="text-white" />
            </motion.div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Cerrando sesión…
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

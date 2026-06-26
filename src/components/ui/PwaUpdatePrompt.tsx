import { useEffect, useState } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { motion, AnimatePresence } from "framer-motion"
import { RefreshCw, X } from "lucide-react"
import { debug } from "../../lib/debug"

/**
 * Banner discreto que aparece cuando vite-plugin-pwa detecta que hay
 * una nueva versión de la app instalada en el Service Worker. Permite
 * actualizarla inmediatamente (recarga la página tras el nuevo SW).
 *
 * Polling: cada 60 segundos pregunta al SW si hay actualizacion para
 * que el usuario no tenga que cerrar/reabrir manualmente.
 *
 * Se monta una sola vez en App.tsx — no requiere props.
 */
export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      debug.error("SW registration error", err)
    },
    onRegisteredSW(_swUrl, registration) {
      // Polling: revisa cada 60s si hay update sin esperar a que el
      // usuario navegue/cierre la app. Vital para PWAs instaladas que
      // se mantienen abiertas dias enteros.
      if (!registration) return
      const interval = 60 * 1000
      setInterval(() => {
        registration.update().catch((e) => debug.warn("[sw] update poll", e))
      }, interval)
    },
  })

  const [hiding, setHiding] = useState(false)

  // Si la página se vuelve a abrir, el banner reaparece — no
  // persistimos "ya lo cerró" porque queremos que actualice.
  useEffect(() => {
    if (needRefresh) setHiding(false)
  }, [needRefresh])

  if (!needRefresh) return null

  return (
    <AnimatePresence>
      {needRefresh && !hiding && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed left-1/2 -translate-x-1/2 z-[350] pointer-events-auto"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 130px)" }}
        >
          {/* Pulse glow rosa de fondo — pulsa indefinidamente para
              que el banner NO pase desapercibido en mobile. */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse, var(--brand-from) 0%, transparent 70%)",
            }}
            initial={{ opacity: 0.0 }}
            animate={{ opacity: [0.0, 0.45, 0.0] }}
            transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
          />
          <div className="relative flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-2xl bg-gradient-to-br from-primary via-fuchsia-500 to-purple-500 text-white shadow-[0_20px_50px_-15px_rgba(230,0,126,0.75)] ring-2 ring-white/30">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2.4, ease: "linear", repeat: Infinity }}
              className="shrink-0"
            >
              <RefreshCw size={14} />
            </motion.div>
            <div className="flex flex-col leading-tight pr-1.5">
              <span className="text-[11px] font-black">¡Nueva versión lista!</span>
              <span className="text-[9px] font-bold opacity-90">
                Refresca para ver lo nuevo
              </span>
            </div>
            <motion.button
              type="button"
              onClick={() => updateServiceWorker(true)}
              whileTap={{ scale: 0.95 }}
              animate={{ boxShadow: [
                "0 0 0 0 rgba(255,255,255,0.0)",
                "0 0 0 6px rgba(255,255,255,0.0)",
                "0 0 0 0 rgba(255,255,255,0.0)",
              ] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="h-9 px-3 rounded-xl bg-white text-primary text-[10px] font-black uppercase tracking-widest shadow-sm press"
            >
              Actualizar
            </motion.button>
            <button
              type="button"
              onClick={() => {
                setHiding(true)
                setTimeout(() => setNeedRefresh(false), 250)
              }}
              aria-label="Cerrar"
              className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center press"
            >
              <X size={12} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

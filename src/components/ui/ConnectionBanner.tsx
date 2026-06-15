import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { WifiOff, Wifi, Loader2 } from "lucide-react"

import { supabase } from "../../lib/supabase"

type Status = "online" | "offline" | "reconnecting" | "reconnected"

/**
 * Banner sutil inferior que avisa cuando se pierde la conexión a internet
 * (o cuando Supabase pierde su canal realtime). Auto-desaparece al
 * recuperarla. No bloquea la UI.
 *
 * Comportamiento:
 *  - offline       → banner amarillo persistente "Sin conexión"
 *  - reconnecting  → banner azul con spinner "Reconectando..."
 *  - reconnected   → banner verde 2.5s "¡Conexión restablecida!" → desaparece
 *  - online        → no se muestra nada
 */
export default function ConnectionBanner() {
  const [status, setStatus] = useState<Status>(
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  )

  useEffect(() => {
    const onOffline = () => setStatus("offline")
    const onOnline = () => {
      setStatus("reconnecting")
      // Forzamos refresh de sesión para limpiar caché RLS
      supabase.auth.getSession().finally(() => {
        setStatus("reconnected")
        setTimeout(() => {
          setStatus(navigator.onLine ? "online" : "offline")
        }, 2500)
      })
    }

    window.addEventListener("offline", onOffline)
    window.addEventListener("online", onOnline)

    // Detección secundaria: ping cada 30s al supabase REST para confirmar
    // que el cliente está realmente conectado (a veces navigator.onLine
    // miente cuando hay wifi sin internet).
    let pingTimer: number | null = null
    const ping = async () => {
      if (!navigator.onLine) return
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 4000)
        // Endpoint barato: getSession no pega DB, sólo auth
        await supabase.auth.getSession()
        clearTimeout(t)
        if (status === "offline") {
          onOnline()
        }
      } catch {
        if (status === "online") {
          setStatus("offline")
        }
      }
    }
    pingTimer = window.setInterval(ping, 30_000)

    return () => {
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("online", onOnline)
      if (pingTimer) clearInterval(pingTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === "undefined") return null
  if (status === "online") return null

  const config: Record<Exclude<Status, "online">, { bg: string; icon: typeof Wifi; text: string }> = {
    offline: {
      bg: "bg-amber-500 text-white",
      icon: WifiOff,
      text: "Conexión inestable. Intentando reconectar...",
    },
    reconnecting: {
      bg: "bg-sky-500 text-white",
      icon: Loader2,
      text: "Reconectando...",
    },
    reconnected: {
      bg: "bg-emerald-500 text-white",
      icon: Wifi,
      text: "¡Conexión restablecida!",
    },
  }

  const Cfg = config[status]
  const Icon = Cfg.icon

  return createPortal(
    <AnimatePresence>
      {status !== "online" && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed left-1/2 -translate-x-1/2 z-[400] pointer-events-none"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 96px)",
          }}
        >
          <div
            className={`pointer-events-auto flex items-center gap-2 px-4 h-10 rounded-full shadow-[0_15px_40px_-10px_rgba(0,0,0,0.35)] backdrop-blur ${Cfg.bg}`}
          >
            <Icon
              size={14}
              className={status === "reconnecting" ? "animate-spin" : ""}
            />
            <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
              {Cfg.text}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

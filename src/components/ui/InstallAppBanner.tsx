import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Download, X } from "lucide-react"

import { useInstallPrompt } from "../../lib/useInstallPrompt"

const DISMISS_KEY = "mari:install-prompt-dismissed"
const DISMISS_DAYS = 14

export default function InstallAppBanner() {
  const { canPrompt, prompt } = useInstallPrompt()
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return true
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    return Date.now() - ts < DISMISS_DAYS * 86400000
  })

  useEffect(() => {
    if (canPrompt) setHidden(false)
  }, [canPrompt])

  if (!canPrompt || hidden) return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="mb-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-violet-500/10 px-3 py-2.5 flex items-center gap-3"
      >
        <div className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-bloom"
          style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}>
          <Download size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 leading-tight">
            Instalar Beauty's Me
          </p>
          <p className="text-[9px] font-bold text-slate-500 leading-snug mt-0.5">
            Acceso directo desde tu pantalla, sin abrir el navegador.
          </p>
        </div>
        <button
          type="button"
          onClick={() => prompt().then(() => setHidden(true))}
          className="h-8 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-sm press-hard shrink-0"
        >
          Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="No ahora"
          className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0"
        >
          <X size={12} />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

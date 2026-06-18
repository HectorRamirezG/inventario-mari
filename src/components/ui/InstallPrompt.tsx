import { motion, AnimatePresence } from "framer-motion"
import { Download, X } from "lucide-react"
import { usePwaInstall } from "../../lib/usePwaInstall"

interface Props {
  className?: string
}

export default function InstallPrompt({ className = "" }: Props) {
  const { canInstall, prompt, dismiss } = usePwaInstall()

  return (
    <AnimatePresence>
      {canInstall && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 280 }}
          className={`fixed left-3 right-3 bottom-20 z-[180] rounded-2xl border border-primary/20 bg-white dark:bg-slate-900 shadow-premium p-3 flex items-center gap-3 ${className}`}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-bloom"
            className="bg-brand"
          >
            <Download size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black truncate">Instala Mari</p>
            <p className="text-[10px] font-bold text-slate-500 truncate">
              Acceso directo desde tu pantalla, sin abrir el navegador.
            </p>
          </div>
          <button
            type="button"
            onClick={prompt}
            className="h-9 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shrink-0"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

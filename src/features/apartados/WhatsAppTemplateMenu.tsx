import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MessageCircle, ChevronDown } from "lucide-react"
import type { Sale } from "../../types/database"
import { APARTADO_TEMPLATES, openTemplateInWhatsApp } from "./waTemplates"

interface Props {
  sale: Sale
  compact?: boolean
}

export default function WhatsAppTemplateMenu({ sale, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white font-black uppercase tracking-widest active:scale-95 shadow-bloom ${
          compact ? "px-2 h-7 text-[9px]" : "px-3 h-9 text-[10px]"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MessageCircle size={compact ? 10 : 12} />
        Plantilla
        <ChevronDown size={compact ? 10 : 12} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="absolute right-0 mt-1 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)] border border-slate-100 dark:border-slate-700 overflow-hidden z-30"
          >
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Mensaje rápido
              </p>
            </div>
            {APARTADO_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  openTemplateInWhatsApp(t, sale)
                  setOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-left transition-colors"
              >
                <span className="text-base">{t.emoji}</span>
                <span className="text-[11px] font-black truncate">{t.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

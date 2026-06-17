import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronRight, Sparkles, ShoppingBag, Receipt, X } from "lucide-react"
import { APP_CONSTANTS } from "../../lib/constants"

const STEPS = [
  {
    icon: Sparkles,
    title: "Bienvenida a Beauty's Me",
    body: "Explora el catálogo, guarda tus favoritos y aparta sin pagar todo de una.",
  },
  {
    icon: ShoppingBag,
    title: "Aparta tu pedido",
    body: "Elige tus tonos, pulsa el botón rosa y captura tus datos (solo la primera vez).",
  },
  {
    icon: Receipt,
    title: "Sube tu pago",
    body: "Al abonar te damos un ticket en línea y notificamos al equipo para que lo apruebe.",
  },
]

function wasSeen() {
  try {
    return localStorage.getItem(APP_CONSTANTS.ONBOARDING_KEY) === "1"
  } catch {
    return true
  }
}

function markSeen() {
  try {
    localStorage.setItem(APP_CONSTANTS.ONBOARDING_KEY, "1")
  } catch {
    /* noop */
  }
}

export default function OnboardingTour() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!wasSeen()) {
      const t = setTimeout(() => setOpen(true), 700)
      return () => clearTimeout(t)
    }
  }, [])

  function close() {
    markSeen()
    setOpen(false)
  }

  function next() {
    if (step === STEPS.length - 1) close()
    else setStep((s) => s + 1)
  }

  if (typeof document === "undefined") return null
  if (!open) return null

  const s = STEPS[step]
  const Icon = s.icon

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[260] flex items-center justify-center p-5"
        >
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={close} />

          <motion.div
            initial={{ scale: 0.96, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-premium p-6"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Saltar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
            >
              <X size={13} />
            </button>

            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-bloom mb-3"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            >
              <Icon size={22} />
            </div>

            <h3 className="text-lg font-black tracking-tight">{s.title}</h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {s.body}
            </p>

            <div className="flex items-center gap-2 mt-5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-6 bg-primary" : "w-1.5 bg-slate-200 dark:bg-slate-700"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between mt-5">
              <button
                type="button"
                onClick={close}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
              >
                Saltar
              </button>
              <button
                type="button"
                onClick={next}
                className="h-11 px-5 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom"
                style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
              >
                {step === STEPS.length - 1 ? "Empezar" : "Siguiente"}
                <ChevronRight size={14} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

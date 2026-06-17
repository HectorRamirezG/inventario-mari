import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ChevronRight,
  Sparkles,
  ShoppingBag,
  Receipt,
  X,
  Heart,
  Camera,
  Star,
  type LucideIcon,
} from "lucide-react"
import { APP_CONSTANTS } from "../../lib/constants"
import { useBusinessRules } from "../../features/settings/businessRulesService"

interface Step {
  icon: LucideIcon
  title: string
  body: string
  /** Si se especifica, solo se muestra cuando la regla está activa. */
  flag?: "wishes_enabled" | "stories_enabled" | "reviews_enabled"
}

const ALL_STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Bienvenida a Beauty's Me",
    body: "Tu tienda completa de cosmética en línea. Explora el catálogo, guarda favoritos y aparta sin pagar todo de una.",
  },
  {
    icon: ShoppingBag,
    title: "Aparta tu pedido",
    body: "Elige tus tonos, toca el botón rosa y captura tus datos solo la primera vez. Después es un solo clic.",
  },
  {
    icon: Receipt,
    title: "Sube tu pago",
    body: "Al abonar te damos un ticket en línea y notificamos al equipo para que apruebe tu comprobante rápido.",
  },
  {
    icon: Heart,
    title: "Pídenos lo que no tenemos",
    body: "¿Quieres un tono, marca o modelo en específico? Mándanos foto, talla y color. Te avisamos cuando lo tengamos.",
    flag: "wishes_enabled",
  },
  {
    icon: Camera,
    title: "Stories del día",
    body: "Arriba de la tienda verás nuestras novedades del día estilo Instagram. Toca cualquiera para verla en grande.",
    flag: "stories_enabled",
  },
  {
    icon: Star,
    title: "Reseñas con foto",
    body: "Después de probarlo, deja tu reseña con foto. Ayudas a otras clientas y a nosotras a mejorar.",
    flag: "reviews_enabled",
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
  const rules = useBusinessRules()

  // Filtra los pasos según las reglas activas en este momento (Mari decide
  // qué módulos ve el cliente y el tour solo presenta lo que sí va a ver).
  const steps = useMemo(
    () => ALL_STEPS.filter((s) => !s.flag || rules[s.flag]),
    [rules]
  )

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
    if (step === steps.length - 1) close()
    else setStep((s) => s + 1)
  }

  if (typeof document === "undefined") return null
  if (!open || steps.length === 0) return null

  const s = steps[Math.min(step, steps.length - 1)]
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

            <h3 className="text-lg font-black tracking-tight leading-tight">
              {s.title}
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {s.body}
            </p>

            <div className="flex items-center gap-1.5 mt-5 flex-wrap">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step
                      ? "w-6 bg-primary"
                      : "w-1.5 bg-slate-200 dark:bg-slate-700"
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
                {step === steps.length - 1 ? "Empezar" : "Siguiente"}
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


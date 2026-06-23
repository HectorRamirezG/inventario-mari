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
  LifeBuoy,
  MessageCircle,
  Bell,
  Search,
  type LucideIcon,
} from "lucide-react"
import { APP_CONSTANTS } from "../../lib/constants"
import { useBusinessRules } from "../../features/settings/businessRulesService"

interface Step {
  icon: LucideIcon
  title: string
  body: string
  /** Pista visual: muestra una mini "demo" del botón real con su contexto. */
  hint?: { iconHint: LucideIcon; label: string; tone: "primary" | "amber" | "rose" | "sky" | "emerald" }
  /** Si se especifica, solo se muestra cuando la regla está activa. */
  flag?: "wishes_enabled" | "stories_enabled" | "reviews_enabled"
}

const ALL_STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Bienvenida a Beauty's Me",
    body: "Tu tienda completa de cosmética. Te llevamos por los botones más importantes para que no te pierdas nada.",
  },
  {
    icon: ShoppingBag,
    title: "El botón rosa = agregar",
    body: "Cuando veas un círculo rosa con un '+', es para sumar ese tono a tu carrito. Si está gris claro, ese tono se agotó.",
    hint: { iconHint: ShoppingBag, label: "Agregar al carrito", tone: "primary" },
  },
  {
    icon: Receipt,
    title: "Aparta sin pagar todo",
    body: "Captura tus datos solo la primera vez. Después puedes apartar con un toque y abonar cuando quieras.",
  },
  {
    icon: Star,
    title: "La estrella amarilla = reseñas",
    body: "Si ves '★ 4.8 (12)' en un producto, significa que 12 clientas lo calificaron 4.8 estrellas en promedio. Toca para leer sus comentarios.",
    hint: { iconHint: Star, label: "★ 4.8 (12)", tone: "amber" },
    flag: "reviews_enabled",
  },
  {
    icon: MessageCircle,
    title: "¿Tienes dudas del producto?",
    body: "Dentro del detalle de cada tono encontrarás 'Preguntas'. Escribe tu duda — la respondemos lo antes posible y queda visible para que otras clientas la lean.",
    hint: { iconHint: MessageCircle, label: "Preguntas", tone: "primary" },
  },
  {
    icon: LifeBuoy,
    title: "El salvavidas = soporte de pedido",
    body: "En 'Mis pedidos' verás un botón rojo con LifeBuoy si reportaste un problema. Toca para ver el chat con nosotras sobre ese pedido.",
    hint: { iconHint: LifeBuoy, label: "1 incidencia abierta", tone: "rose" },
  },
  {
    icon: Bell,
    title: "La campanita de avisos",
    body: "Arriba a la derecha. Te avisa cuando tu pago fue aprobado, cuando tu pedido va en camino o cuando un favorito vuelve a tener stock.",
    hint: { iconHint: Bell, label: "Avisos", tone: "sky" },
  },
  {
    icon: Heart,
    title: "El corazón = guardar para después",
    body: "Toca el corazón en una card para guardar el producto. Lo encuentras todo en la pestaña de favoritos sin perderlo.",
    hint: { iconHint: Heart, label: "Favoritos", tone: "rose" },
  },
  {
    icon: Heart,
    title: "¿Quieres algo que no tenemos?",
    body: "En 'Mis deseos' puedes pedirnos productos por nombre/foto. Te avisamos cuando los traigamos.",
    flag: "wishes_enabled",
  },
  {
    icon: Camera,
    title: "Las historias del día",
    body: "Arriba de la tienda verás historias estilo Instagram con novedades. Toca cualquiera para verla en grande.",
    flag: "stories_enabled",
  },
  {
    icon: Search,
    title: "Buscador rápido (tecla /)",
    body: "Pulsa la lupa o la tecla '/' para buscar productos, abrir tu carrito, ver tus pedidos o pedirnos ayuda. Es el atajo más rápido de toda la app.",
    hint: { iconHint: Search, label: "Buscar...", tone: "emerald" },
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

/** Permite reabrir el tour manualmente desde un menú de ayuda. */
export function reopenOnboardingTour() {
  try {
    localStorage.removeItem(APP_CONSTANTS.ONBOARDING_KEY)
  } catch {
    /* noop */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mari:open-onboarding"))
  }
}

const HINT_TONE: Record<NonNullable<Step["hint"]>["tone"], string> = {
  primary:
    "bg-primary/10 dark:bg-primary/20 text-primary border-primary/30",
  amber:
    "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-500/30",
  rose:
    "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-500/30",
  sky:
    "bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-500/30",
  emerald:
    "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30",
}

export default function OnboardingTour() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const rules = useBusinessRules()

  // Filtra los pasos según las reglas activas en este momento (decide
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

  // Escuchamos el evento global para que el botón "Ver tutorial" del
  // perfil/ayuda pueda reabrir el tour cuando quiera el cliente.
  useEffect(() => {
    const handler = () => {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener("mari:open-onboarding", handler)
    return () => window.removeEventListener("mari:open-onboarding", handler)
  }, [])

  function close() {
    markSeen()
    setOpen(false)
  }

  function next() {
    if (step === steps.length - 1) close()
    else setStep((s) => s + 1)
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1)
  }

  if (typeof document === "undefined") return null
  if (!open || steps.length === 0) return null

  const s = steps[Math.min(step, steps.length - 1)]
  const Icon = s.icon
  const HintIcon = s.hint?.iconHint

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[260] flex items-center justify-center p-5"
        >
          <div className="absolute inset-0 bg-slate-950/80" onClick={close} />

          <motion.div
            key={step}
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
              style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
            >
              <Icon size={22} />
            </div>

            <h3 className="text-lg font-black tracking-tight leading-tight">
              {s.title}
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {s.body}
            </p>

            {/* Hint visual: muestra cómo se ve el botón real en la app
                para que el cliente lo reconozca cuando lo vea. */}
            {s.hint && HintIcon && (
              <div className="mt-4">
                <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-1.5">
                  Así se ve
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black border ${HINT_TONE[s.hint.tone]}`}
                >
                  <HintIcon size={13} />
                  {s.hint.label}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-5 flex-wrap">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`Ir al paso ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step
                      ? "w-6 bg-primary"
                      : "w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between mt-5">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={prev}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                >
                  Atrás
                </button>
              ) : (
                <button
                  type="button"
                  onClick={close}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                >
                  Saltar
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="h-11 px-5 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom"
                style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
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


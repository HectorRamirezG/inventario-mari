import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  ChevronRight,
  Star,
  ShoppingBag,
  Heart,
  Camera,
  PartyPopper,
} from "lucide-react"
import { useBusinessRules } from "../../features/settings/businessRulesService"

interface Slide {
  title: string
  subtitle: string
  accent: string
  icon: React.ReactNode
  /** Si se especifica, solo aparece cuando la regla está activa. */
  flag?: "wishes_enabled" | "stories_enabled" | "reviews_enabled"
}

const ALL_SLIDES: Slide[] = [
  {
    title: "Aparta sin pagar todo hoy",
    subtitle: "Anticipo desde 20% · liquidas cuando puedas",
    accent: "from-fuchsia-500 to-pink-500",
    icon: <Sparkles size={16} className="text-white" />,
  },
  {
    title: "Mientras más, más barato",
    subtitle: "Combina productos y activa precios de mayoreo",
    accent: "from-amber-500 to-orange-500",
    icon: <Star size={16} className="text-white" />,
  },
  {
    title: "Tu ticket vive en línea",
    subtitle: "Comparte el link, revisa tu saldo cuando quieras",
    accent: "from-emerald-500 to-teal-500",
    icon: <ShoppingBag size={16} className="text-white" />,
  },
  {
    title: "Pídenos lo que no tenemos",
    subtitle: "Mándanos foto, talla y color · te avisamos al llegar",
    accent: "from-pink-500 to-purple-500",
    icon: <Heart size={16} className="text-white" />,
    flag: "wishes_enabled",
  },
  {
    title: "Mira las stories del día",
    subtitle: "Novedades y promos arriba · estilo Instagram",
    accent: "from-orange-500 to-rose-500",
    icon: <Camera size={16} className="text-white" />,
    flag: "stories_enabled",
  },
  {
    title: "Reseñas reales de clientas",
    subtitle: "Mira fotos y comentarios antes de elegir",
    accent: "from-amber-500 to-pink-500",
    icon: <Star size={16} className="text-white" />,
    flag: "reviews_enabled",
  },
  {
    title: "Bienvenida a Beauty's Me",
    subtitle: "Cosmética premium con catálogo siempre fresco",
    accent: "from-violet-500 to-fuchsia-500",
    icon: <PartyPopper size={16} className="text-white" />,
  },
]

interface Props {
  customerName?: string | null
  isLogged?: boolean
}

export default function ClientHero({ customerName, isLogged }: Props) {
  const rules = useBusinessRules()
  const [idx, setIdx] = useState(0)

  // Filtra slides según reglas activas. Cuando apaga un módulo
  // (wishes, stories, reviews) el slide correspondiente desaparece sin
  // tocar código de este componente.
  const slides = useMemo(
    () => ALL_SLIDES.filter((s) => !s.flag || rules[s.flag]),
    [rules]
  )

  // Si las reglas cambian y el índice queda fuera, reset.
  useEffect(() => {
    if (idx >= slides.length) setIdx(0)
  }, [idx, slides.length])

  useEffect(() => {
    if (slides.length <= 1) return
    const t = setInterval(
      () => setIdx((i) => (i + 1) % slides.length),
      4800
    )
    return () => clearInterval(t)
  }, [slides.length])

  if (slides.length === 0) return null

  const slide = slides[Math.min(idx, slides.length - 1)]
  const greeting = isLogged ? "Hola de nuevo" : "Bienvenida"
  const firstName = (customerName ?? "").split(" ")[0] || "Linda"

  return (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
        {greeting}
      </p>
      <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
        {firstName}
        <Sparkles size={18} className="text-primary" />
      </h1>

      <AnimatePresence mode="wait">
        <motion.button
          key={`${slide.title}-${idx}`}
          type="button"
          onClick={() => setIdx((i) => (i + 1) % slides.length)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={`mt-3 w-full text-left rounded-2xl p-4 bg-gradient-to-br ${slide.accent} text-white shadow-bloom flex items-center gap-3`}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
            {slide.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black leading-tight line-clamp-2">
              {slide.title}
            </p>
            <p className="text-[11px] opacity-90 leading-snug line-clamp-2 mt-0.5">
              {slide.subtitle}
            </p>
          </div>
          <ChevronRight size={16} className="opacity-80 shrink-0" />
        </motion.button>
      </AnimatePresence>

      {slides.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5 flex-wrap">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === idx
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-slate-300 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}


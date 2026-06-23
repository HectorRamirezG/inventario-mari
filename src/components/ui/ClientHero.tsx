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
import type { WelcomeSlide as RuleSlide } from "../../features/settings/businessRulesService"

interface Slide {
  title: string
  subtitle: string
  accent: string
  icon: React.ReactNode
  /** Si se especifica, solo aparece cuando la regla está activa. */
  flag?: "wishes_enabled" | "stories_enabled" | "reviews_enabled"
}

/** Mapeo del tema del WelcomeSlide a las propiedades visuales. */
const SLIDE_VISUAL: Record<RuleSlide["theme"], { accent: string; icon: React.ReactNode }> = {
  promo: { accent: "from-fuchsia-500 to-pink-500", icon: <Sparkles size={16} className="text-white" /> },
  mayoreo: { accent: "from-amber-500 to-orange-500", icon: <Star size={16} className="text-white" /> },
  ticket: { accent: "from-emerald-500 to-teal-500", icon: <ShoppingBag size={16} className="text-white" /> },
  wishes: { accent: "from-pink-500 to-purple-500", icon: <Heart size={16} className="text-white" /> },
  stories: { accent: "from-orange-500 to-rose-500", icon: <Camera size={16} className="text-white" /> },
  reviews: { accent: "from-amber-500 to-pink-500", icon: <Star size={16} className="text-white" /> },
  bienvenida: { accent: "from-violet-500 to-fuchsia-500", icon: <PartyPopper size={16} className="text-white" /> },
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
  //
  // Si la regla `welcome_slides_enabled` está ON y hay slides custom
  // configurados desde Reglas, los reemplazamos al set hardcodeado.
  const slides = useMemo(() => {
    if (rules.welcome_slides_enabled && rules.welcome_slides.length > 0) {
      return rules.welcome_slides.map<Slide>((s) => {
        const visual = SLIDE_VISUAL[s.theme] ?? SLIDE_VISUAL.bienvenida
        return {
          title: s.title,
          subtitle: s.subtitle,
          accent: visual.accent,
          icon: visual.icon,
        }
      })
    }
    return ALL_SLIDES.filter((s) => !s.flag || rules[s.flag])
  }, [rules])

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

  // Estilos del banner anclado según tono elegido
  const BANNER_TONE = {
    info: "bg-sky-50 dark:bg-sky-500/15 border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-200",
    warn: "bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200",
    success: "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200",
    promo: "bg-fuchsia-50 dark:bg-fuchsia-500/15 border-fuchsia-200 dark:border-fuchsia-500/30 text-fuchsia-800 dark:text-fuchsia-200",
  }[rules.pinned_banner_tone]
  const showBanner =
    rules.pinned_banner_enabled && rules.pinned_banner_message.trim().length > 0

  return (
    <div className="relative mb-4">
      {/* Aurora MUY sutil detrás del bloque — decoración. Reducida en
          opacidad para no competir con el slide colorido de abajo. */}
      <div className="absolute -top-4 -left-4 -right-4 h-28 -z-10 pointer-events-none overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.12, 1], x: [0, 14, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-6 left-1/3 w-44 h-44 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(236,72,153,0.14), transparent 65%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      {/* GREETING — 1 sola línea limpia. Caption mini + nombre + sparkle.
          Antes el caption iba arriba y el nombre debajo (2 alturas). */}
      <div className="flex items-baseline gap-2 mb-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 font-black shrink-0">
          {rules.holiday_mode_enabled && rules.holiday_mode_emoji ? (
            <span aria-hidden className="mr-1">{rules.holiday_mode_emoji}</span>
          ) : null}
          {greeting},
        </p>
        {rules.holiday_mode_enabled && rules.holiday_mode_name && (
          <span className="text-[10px] font-bold text-primary italic">
            · {rules.holiday_mode_name}
          </span>
        )}
      </div>
      <h1 className="text-[26px] font-black tracking-tight leading-[1.05] flex items-center gap-1.5">
        <span className="text-slate-900 dark:text-slate-50">{firstName}</span>
        <motion.span
          animate={{ rotate: [0, 14, -8, 14, 0], scale: [1, 1.15, 1, 1.1, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 6, ease: "easeInOut" }}
          className="inline-flex"
        >
          <Sparkles size={18} className="text-primary" />
        </motion.span>
      </h1>

      {/* PRIORIDAD 1: Banner anclado (info urgente del negocio).
          Sube ARRIBA del slide porque es lo más importante operativamente. */}
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`mt-3 rounded-2xl border px-3 py-2 flex items-center gap-2 ${BANNER_TONE}`}
        >
          <span className="text-base shrink-0 leading-none" aria-hidden>
            {rules.pinned_banner_tone === "warn"
              ? "⚠️"
              : rules.pinned_banner_tone === "success"
              ? "✅"
              : rules.pinned_banner_tone === "promo"
              ? "🔥"
              : "ℹ️"}
          </span>
          <p className="text-[11px] font-black leading-snug flex-1">
            {rules.pinned_banner_message}
          </p>
        </motion.div>
      )}

      {/* PRIORIDAD 2: Slide rotativo — card con accent en lugar de full
          gradient (menos saturado). El icono en círculo conserva el color
          del slide para mantener identidad visual; el resto es neutro. */}
      <AnimatePresence mode="wait">
        <motion.button
          key={`${slide.title}-${idx}`}
          type="button"
          onClick={() => setIdx((i) => (i + 1) % slides.length)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-3 w-full text-left rounded-2xl p-3 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3 overflow-hidden press"
          aria-label="Cambiar mensaje"
        >
          {/* Accent en el borde izquierdo + glow sutil */}
          <span
            aria-hidden
            className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${slide.accent}`}
          />
          <div
            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${slide.accent} text-white flex items-center justify-center shrink-0 shadow-sm`}
          >
            {slide.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-black text-slate-900 dark:text-slate-100 leading-tight line-clamp-1">
              {slide.title}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-1 mt-0.5">
              {slide.subtitle}
            </p>
          </div>
          <ChevronRight
            size={14}
            className="text-slate-300 dark:text-slate-600 shrink-0"
          />
        </motion.button>
      </AnimatePresence>

      {/* Dots minimalistas — solo si hay >1 slide. Antes ocupaban su
          propia línea pesada; ahora son micro-dots casi imperceptibles. */}
      {slides.length > 1 && (
        <div className="mt-2 flex justify-center gap-1">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1 rounded-full transition-all ${
                i === idx
                  ? "w-5 bg-primary"
                  : "w-1 bg-slate-300 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}


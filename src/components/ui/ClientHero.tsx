import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  ChevronRight,
  Star,
  ShoppingBag,
  Heart,
  Camera,
  PartyPopper,
  Info,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Trophy,
  Package,
} from "lucide-react"
import { useBusinessRules } from "../../features/settings/businessRulesService"
import type { WelcomeSlide as RuleSlide } from "../../features/settings/businessRulesService"
import { useUserPrefs } from "../../lib/userPrefs"
import { useFeedback } from "../../lib/useFeedback"
import { useCountUp } from "../../lib/useCountUp"

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
  /** Stats opcionales del cliente para pills navegacionales bajo el nombre.
   *  El padre los calcula (loyalty, racha, pedidos activos) y los pasa
   *  como números. Cada pill solo aparece si su valor > 0. */
  stats?: {
    points?: number
    streak?: number
    activeOrders?: number
    trophies?: number
  }
}

/** Saludo dinámico según la hora local del cliente. Más cálido que el
 *  genérico "Hola de nuevo". Considera holiday_mode (si está activo
 *  el caller puede preferir mantener el genérico, pero por defecto el
 *  saludo por hora gana porque se siente vivo). */
function timeBasedGreeting(isLogged: boolean | undefined): string {
  const h = new Date().getHours()
  if (h < 5) return isLogged ? "Aún despierta" : "Hola"
  if (h < 12) return "Buenos días"
  if (h < 19) return "Buenas tardes"
  return "Buenas noches"
}

export default function ClientHero({ customerName, isLogged, stats }: Props) {
  const rules = useBusinessRules()
  const { prefs } = useUserPrefs()
  const navigate = useNavigate()
  const { tap } = useFeedback()
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
  const greeting = isLogged ? timeBasedGreeting(true) : "Bienvenida"
  const firstName = (customerName ?? "").split(" ")[0] || "Linda"

  // Pills navegacionales: solo aparecen si logueado Y el valor > 0.
  // Cada una es atajo directo a su área (loyalty / trofeos / pedidos).
  // El `numericValue` se anima con count-up al cargar (de 0 al target)
  // dentro del sub-componente <StatPill> para no romper reglas de hooks.
  const pills: Array<{
    icon: typeof Star
    numericValue: number
    label: string
    tone: string
    href: string
  }> = []
  if (isLogged && (stats?.points ?? 0) > 0) {
    pills.push({
      icon: Star,
      numericValue: stats!.points!,
      label: "pts",
      tone: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
      href: "/mis-premios",
    })
  }
  if (isLogged && (stats?.streak ?? 0) >= 2) {
    pills.push({
      icon: Flame,
      numericValue: stats!.streak!,
      label: "días",
      tone: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30",
      href: "/mis-trofeos",
    })
  }
  if (isLogged && (stats?.trophies ?? 0) > 0) {
    pills.push({
      icon: Trophy,
      numericValue: stats!.trophies!,
      label: "trofeos",
      tone: "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30",
      href: "/mis-trofeos",
    })
  }
  if (isLogged && (stats?.activeOrders ?? 0) > 0) {
    pills.push({
      icon: Package,
      numericValue: stats!.activeOrders!,
      label: stats!.activeOrders === 1 ? "pedido" : "pedidos",
      tone: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
      href: "/mis-pedidos",
    })
  }

  // Estilos del banner anclado según tono elegido. Cada tono mapea a un
  // icono de lucide (sin emojis-char) para mantener consistencia con el
  // resto de la UI interna.
  const BANNER_CFG = {
    info: {
      cls: "bg-sky-50 dark:bg-sky-500/15 border-sky-200 dark:border-sky-500/30 text-sky-800 dark:text-sky-200",
      Icon: Info,
    },
    warn: {
      cls: "bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200",
      Icon: AlertTriangle,
    },
    success: {
      cls: "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200",
      Icon: CheckCircle2,
    },
    promo: {
      cls: "bg-fuchsia-50 dark:bg-fuchsia-500/15 border-fuchsia-200 dark:border-fuchsia-500/30 text-fuchsia-800 dark:text-fuchsia-200",
      Icon: Sparkles,
    },
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
        {/* Emoji personal del cliente — si lo eligió en su perfil, lo
            mostramos junto a su nombre. Aporta identidad visual y rompe
            la monotonía del saludo. Si no eligió, ponemos el sparkle
            clásico como fallback animado. */}
        {prefs.clientEmoji ? (
          <span
            className="inline-flex text-[22px] leading-none"
            aria-hidden
            title="Tu emoji personal"
          >
            {prefs.clientEmoji}
          </span>
        ) : (
          <motion.span
            animate={{ rotate: [0, 14, -8, 14, 0], scale: [1, 1.15, 1, 1.1, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 6, ease: "easeInOut" }}
            className="inline-flex"
          >
            <Sparkles size={18} className="text-primary" />
          </motion.span>
        )}
      </h1>

      {/* PILLS NAVEGACIONALES — atajos a las áreas personales del cliente.
          Aparecen solo si logueado Y tiene datos en cada métrica. Es la
          forma más rápida de ver "qué tengo" y "a dónde voy". */}
      {pills.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto scroll-container-ios -mx-1 px-1 pb-0.5">
          {pills.map((p) => (
            <StatPill
              key={p.label + p.numericValue}
              icon={p.icon}
              numericValue={p.numericValue}
              label={p.label}
              tone={p.tone}
              onClick={() => {
                tap()
                navigate(p.href)
              }}
            />
          ))}
        </div>
      )}

      {/* PRIORIDAD 1: Banner anclado (info urgente del negocio).
          Sube ARRIBA del slide porque es lo más importante operativamente.
          Usa icon de lucide-react (no emoji-char) para consistencia con
          el resto de la UI interna. */}
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`mt-3 rounded-2xl border px-3 py-2 flex items-center gap-2 ${BANNER_CFG.cls}`}
        >
          <BANNER_CFG.Icon size={14} strokeWidth={2.5} className="shrink-0" />
          <p className="text-[11px] font-black leading-snug flex-1">
            {rules.pinned_banner_message}
          </p>
        </motion.div>
      )}

      {/* PRIORIDAD 2: Slide rotativo — versión COMPACTA (single line) para
          que no compita con el hero ni con la sección de pendientes que
          va justo abajo. Mensaje inspiracional sutil. */}
      <AnimatePresence mode="wait">
        <motion.button
          key={`${slide.title}-${idx}`}
          type="button"
          onClick={() => setIdx((i) => (i + 1) % slides.length)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-2.5 w-full text-left rounded-full pl-2 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center gap-2 overflow-hidden press"
          aria-label="Cambiar mensaje"
        >
          <div
            className={`w-6 h-6 rounded-full bg-gradient-to-br ${slide.accent} text-white flex items-center justify-center shrink-0`}
          >
            <span className="scale-75">{slide.icon}</span>
          </div>
          <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
            <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
              {slide.title}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight truncate hidden sm:block">
              · {slide.subtitle}
            </p>
          </div>
          {slides.length > 1 && (
            <div className="flex gap-0.5 shrink-0">
              {slides.slice(0, 5).map((_, i) => (
                <span
                  key={i}
                  className={`block h-1 rounded-full transition-all ${
                    i === idx
                      ? "w-3 bg-primary"
                      : "w-1 bg-slate-300 dark:bg-slate-700"
                  }`}
                />
              ))}
            </div>
          )}
          <ChevronRight
            size={12}
            className="text-slate-300 dark:text-slate-600 shrink-0"
          />
        </motion.button>
      </AnimatePresence>
    </div>
  )
}

/**
 * Sub-componente para cada pill del hero. Aislado para poder llamar
 * `useCountUp` dentro (los hooks no pueden vivir en un .map() callback).
 * Anima el número de 0 al target al montar — micro-detalle que hace el
 * hero sentir "vivo" sin distraer.
 */
function StatPill({
  icon: Icon,
  numericValue,
  label,
  tone,
  onClick,
}: {
  icon: typeof Star
  numericValue: number
  label: string
  tone: string
  onClick: () => void
}) {
  const animated = useCountUp(numericValue, 850)
  const display = Math.max(0, Math.round(animated))
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-black tabular-nums press transition-transform hover:scale-105 ${tone}`}
      aria-label={`${numericValue} ${label}`}
    >
      <Icon size={11} strokeWidth={2.5} />
      <span>{display}</span>
      <span className="opacity-70 font-bold">{label}</span>
    </button>
  )
}


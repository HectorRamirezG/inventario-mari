import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ChevronRight, Star, ShoppingBag } from "lucide-react"

interface Slide {
  title: string
  subtitle: string
  accent: string
  icon: React.ReactNode
}

const SLIDES: Slide[] = [
  {
    title: "Aparta sin pagar todo hoy",
    subtitle: "Bloquea tu pieza con un anticipo, paga el resto cuando puedas.",
    accent: "from-fuchsia-500 to-pink-500",
    icon: <Sparkles size={16} className="text-white" />,
  },
  {
    title: "Mientras más, más barato",
    subtitle: "Activa precios de mayoreo combinando productos del carrito.",
    accent: "from-amber-500 to-orange-500",
    icon: <Star size={16} className="text-white" />,
  },
  {
    title: "Tu ticket vive en linea",
    subtitle: "Comparte el link con quien quieras y revisa tu saldo cuando quieras.",
    accent: "from-emerald-500 to-teal-500",
    icon: <ShoppingBag size={16} className="text-white" />,
  },
]

interface Props {
  customerName?: string | null
  isLogged?: boolean
}

export default function ClientHero({ customerName, isLogged }: Props) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 4500)
    return () => clearInterval(t)
  }, [])

  const slide = SLIDES[idx]
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
          key={idx}
          type="button"
          onClick={() => setIdx((i) => (i + 1) % SLIDES.length)}
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
            <p className="text-sm font-black truncate">{slide.title}</p>
            <p className="text-[11px] opacity-90 leading-snug truncate">
              {slide.subtitle}
            </p>
          </div>
          <ChevronRight size={16} className="opacity-80 shrink-0" />
        </motion.button>
      </AnimatePresence>

      <div className="mt-2 flex justify-center gap-1.5">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? "w-6 bg-primary" : "w-1.5 bg-slate-300 dark:bg-slate-700"
            }`}
          />
        ))}
      </div>
    </div>
  )
}

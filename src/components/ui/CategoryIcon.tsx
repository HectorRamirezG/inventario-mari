import {
  Sparkles,
  Shirt,
  Footprints,
  Watch,
  HandHeart,
  Backpack,
  Gem,
  Palette,
  Package,
  type LucideIcon,
} from "lucide-react"

const MATCHERS: { match: RegExp; icon: LucideIcon; tone: string }[] = [
  { match: /skin|piel|crema|cosm/i, icon: Palette, tone: "from-pink-400 to-rose-400" },
  { match: /maquilla|labial|sombra|base|polvo/i, icon: Sparkles, tone: "from-fuchsia-400 to-pink-500" },
  { match: /ropa|blusa|playera|vestido|panta|jean/i, icon: Shirt, tone: "from-sky-400 to-indigo-400" },
  { match: /calza|tenis|zapat|sandali|bota/i, icon: Footprints, tone: "from-amber-400 to-orange-400" },
  { match: /joya|collar|arete|anillo|pulser/i, icon: Gem, tone: "from-purple-400 to-violet-400" },
  { match: /bolso|mochila|cartera|backpack/i, icon: Backpack, tone: "from-emerald-400 to-teal-400" },
  { match: /reloj|watch/i, icon: Watch, tone: "from-slate-500 to-slate-700" },
  { match: /acces|adorn/i, icon: HandHeart, tone: "from-rose-400 to-pink-400" },
]

export function getCategoryVisual(category: string | null | undefined) {
  if (!category) return { Icon: Package, tone: "from-slate-300 to-slate-400" }
  for (const m of MATCHERS) {
    if (m.match.test(category)) return { Icon: m.icon, tone: m.tone }
  }
  return { Icon: Package, tone: "from-slate-300 to-slate-400" }
}

interface Props {
  category: string | null | undefined
  size?: number
  className?: string
}

export default function CategoryIcon({ category, size = 14, className = "" }: Props) {
  const { Icon, tone } = getCategoryVisual(category)
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${tone} text-white ${className}`}
      style={{ width: size + 10, height: size + 10 }}
    >
      <Icon size={size} />
    </span>
  )
}

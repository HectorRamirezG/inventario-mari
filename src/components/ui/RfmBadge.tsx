import { Crown, Heart, Moon, Sparkles, type LucideIcon } from "lucide-react"

export type RfmTier = "vip" | "regular" | "dormant" | "new"

export function classifyRfm(opts: {
  visits: number
  totalSpent: number
  lastVisitIso: string | null
}): RfmTier {
  const daysSince = opts.lastVisitIso
    ? Math.max(0, Math.round((Date.now() - new Date(opts.lastVisitIso).getTime()) / 86400000))
    : Infinity

  if (opts.visits === 1) return "new"
  if (daysSince > 90) return "dormant"
  if (opts.visits >= 5 || opts.totalSpent >= 5000) return "vip"
  return "regular"
}

const META: Record<RfmTier, { label: string; icon: LucideIcon; classes: string }> = {
  vip: {
    label: "VIP",
    icon: Crown,
    classes: "bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 border-amber-300",
  },
  regular: {
    label: "Regular",
    icon: Heart,
    classes: "bg-gradient-to-br from-fuchsia-50 to-pink-100 text-pink-700 border-pink-200",
  },
  dormant: {
    label: "Dormido",
    icon: Moon,
    classes: "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 border-slate-300",
  },
  new: {
    label: "Nuevo",
    icon: Sparkles,
    classes: "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 border-emerald-200",
  },
}

interface Props {
  tier: RfmTier
  className?: string
}

export default function RfmBadge({ tier, className = "" }: Props) {
  const m = META[tier]
  const Icon = m.icon
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${m.classes} ${className}`}
    >
      <Icon size={8} />
      {m.label}
    </span>
  )
}

import { useMemo } from "react"
import { motion } from "framer-motion"
import { Sparkles, ChevronRight } from "lucide-react"

import { imageMedium } from "../../lib/imageTransform"
import { formatMoney } from "../../lib/format"

interface VariantLite {
  id: string
  stock: number
  price_menudeo?: number | null
  price?: number | null
  image_urls?: string[] | null
}
interface ProductLite {
  id: string
  name: string
  image_url?: string | null
  variants: VariantLite[]
}

interface Props {
  products: ProductLite[]
  onOpen: (p: ProductLite) => void
}

/** Pick estable por día: hashea YYYY-MM-DD y rota entre productos con stock. */
function pickOfTheDay(products: ProductLite[]): ProductLite | null {
  const candidates = products.filter((p) => {
    const v = p.variants?.[0]
    return v && Number(v.stock) > 2
  })
  if (!candidates.length) return null
  const dayKey = new Date().toISOString().slice(0, 10)
  let h = 0
  for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0
  return candidates[h % candidates.length]
}

export default function ProductOfTheDay({ products, onOpen }: Props) {
  const pick = useMemo(() => pickOfTheDay(products), [products])
  if (!pick) return null
  const v = pick.variants[0]
  const cover = v?.image_urls?.[0] ?? pick.image_url ?? null
  const price = Number(v?.price_menudeo ?? v?.price ?? 0)

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(pick)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full mb-4 rounded-2xl overflow-hidden text-left bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 text-white shadow-bloom"
    >
      <div className="p-3 flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-white/20 backdrop-blur">
          {cover ? (
            <img
              src={imageMedium(cover) || cover}
              alt={pick.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Sparkles size={20} className="text-white/80" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest opacity-90 leading-none">
            ✨ Producto del día
          </p>
          <p className="text-sm font-black leading-tight line-clamp-1 mt-1">
            {pick.name}
          </p>
          <p className="text-[11px] font-bold tabular-nums opacity-95 mt-0.5">
            {formatMoney(price)}
          </p>
        </div>
        <ChevronRight size={18} className="opacity-90 shrink-0" />
      </div>
    </motion.button>
  )
}

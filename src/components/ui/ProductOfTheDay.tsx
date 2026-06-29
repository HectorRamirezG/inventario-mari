import { useMemo } from "react"
import { motion } from "framer-motion"
import { Sparkles, ChevronRight, Package } from "lucide-react"

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
    // Solo productos con AL MENOS una variante con stock>2 Y foto.
    // Sin foto el hero queda feo (placeholder gigante).
    return p.variants?.some((v) => {
      const hasPhoto = (v?.image_urls?.length ?? 0) > 0 || !!p.image_url
      return Number(v?.stock) > 2 && hasPhoto
    })
  })
  if (!candidates.length) return null
  const dayKey = new Date().toISOString().slice(0, 10)
  let h = 0
  for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0
  return candidates[h % candidates.length]
}

/**
 * Hero grande del "Producto del día". Full-width con imagen como fondo
 * + overlay gradient inferior con nombre, precio y CTA. Es el primer
 * gancho visual del catálogo después del hero personal: tiene que
 * detener el scroll.
 *
 * Si NO hay candidatos con stock+foto, no renderiza (silencioso).
 */
export default function ProductOfTheDay({ products, onOpen }: Props) {
  const pick = useMemo(() => pickOfTheDay(products), [products])
  if (!pick) return null
  // Prioridad de foto: primera de la primera variante con imagen >
  // legacy product.image_url > null.
  const firstVarWithPhoto = pick.variants.find(
    (v) => (v?.image_urls?.length ?? 0) > 0,
  )
  const cover =
    firstVarWithPhoto?.image_urls?.[0] ?? pick.image_url ?? null
  const v = firstVarWithPhoto ?? pick.variants[0]
  const price = Number(v?.price_menudeo ?? v?.price ?? 0)
  const stock = Number(v?.stock ?? 0)
  const lowStock = stock > 0 && stock <= 5

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(pick)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full mb-3 rounded-3xl overflow-hidden text-left bg-slate-100 dark:bg-slate-800 shadow-bloom press group"
      aria-label={`Producto del día: ${pick.name}`}
    >
      {/* Foto hero: aspect 16:11 — alto suficiente para impacto visual
          sin tragar toda la pantalla. */}
      <div className="relative w-full aspect-[16/11] overflow-hidden bg-gradient-to-br from-fuchsia-200 via-pink-200 to-amber-200 dark:from-fuchsia-500/30 dark:via-pink-500/30 dark:to-amber-500/30">
        {cover ? (
          <img
            src={imageMedium(cover) || cover}
            alt={pick.name}
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package size={56} className="text-white/70" />
          </div>
        )}

        {/* Gradient overlay para legibilidad del texto inferior. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent pointer-events-none" />

        {/* Badge superior izquierdo */}
        <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/90 backdrop-blur shadow-sm">
          <Sparkles size={11} className="text-pink-500" strokeWidth={2.5} />
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">
            Producto del día
          </span>
        </div>

        {/* Badge stock bajo arriba a la derecha — solo si quedan ≤5 */}
        {lowStock && (
          <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500 text-white shadow-sm animate-pulse">
            <span className="text-[9px] font-black uppercase tracking-widest">
              {stock === 1 ? "Última" : `Quedan ${stock}`}
            </span>
          </div>
        )}

        {/* Info inferior sobre el gradient */}
        <div className="absolute bottom-0 inset-x-0 p-4 text-white">
          <p className="text-base sm:text-lg font-black leading-tight line-clamp-2 drop-shadow-md">
            {pick.name}
          </p>
          <div className="flex items-end justify-between mt-2 gap-3">
            <p className="text-2xl font-black tabular-nums leading-none drop-shadow-md">
              {formatMoney(price)}
            </p>
            <span className="inline-flex items-center gap-1 px-3 h-9 rounded-full bg-white text-slate-900 text-[11px] font-black uppercase tracking-widest shadow-md group-hover:scale-105 transition-transform">
              Lo quiero
              <ChevronRight size={13} strokeWidth={3} />
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  )
}

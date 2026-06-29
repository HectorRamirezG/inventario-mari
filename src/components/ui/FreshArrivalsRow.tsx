import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ChevronRight, Package, ArrowRight } from "lucide-react"

import { imageThumbnail } from "../../lib/imageTransform"
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
  created_at: string | null
  variants: VariantLite[]
}

interface Props {
  products: ProductLite[]
  onOpen: (id: string) => void
  /** Días desde created_at para considerar "nuevo". Default 21. */
  withinDays?: number
  /** Mínimo de productos para que la fila aparezca. Default 3. */
  minToShow?: number
  /** Máximo de productos a mostrar. Default 12. */
  limit?: number
}

/**
 * Fila scroll horizontal con productos recientemente agregados al
 * catálogo. Aparece DEBAJO del hero del producto del día para que el
 * cliente pueda explorar "lo nuevo" sin ir al tab Tienda completo.
 *
 * Reglas:
 *  - Solo productos creados dentro de `withinDays` (default 21).
 *  - Solo productos con AL MENOS una variante con stock > 0.
 *  - Solo productos con foto (sin foto se ve roto el carrusel).
 *  - Si hay menos de `minToShow` (default 3) la sección no se renderiza.
 *
 * Click en una card dispara `onOpen(productId)` — el padre redirige
 * a `/?p=PRODUCT_ID` que abre el BuySheet en la tienda.
 */
export default function FreshArrivalsRow({
  products,
  onOpen,
  withinDays = 21,
  minToShow = 3,
  limit = 12,
}: Props) {
  const navigate = useNavigate()
  const fresh = useMemo(() => {
    const cutoff = Date.now() - withinDays * 24 * 3600 * 1000
    return products
      .filter((p) => {
        const ts = p.created_at ? new Date(p.created_at).getTime() : 0
        if (!ts || ts < cutoff) return false
        // Buscar al menos UNA variante con stock>0 Y foto.
        const hasStockAndPhoto = p.variants.some((v) => {
          const stock = Number(v?.stock) || 0
          const hasPhoto = (v?.image_urls?.length ?? 0) > 0 || !!p.image_url
          return stock > 0 && hasPhoto
        })
        return hasStockAndPhoto
      })
      .sort((a, b) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0
        return tB - tA
      })
      .slice(0, limit)
  }, [products, withinDays, limit])

  if (fresh.length < minToShow) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3"
      aria-label="Recién llegados"
    >
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <Sparkles size={12} className="text-pink-500" strokeWidth={2.5} />
          Recién llegados
        </h2>
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
          últimos {withinDays} días
        </span>
      </div>

      <div className="-mx-4 px-4 flex gap-2.5 overflow-x-auto scroll-container-ios snap-x snap-mandatory pb-1">
        <AnimatePresence initial={false}>
          {fresh.map((p) => {
            const v =
              p.variants.find((x) => (x.image_urls?.length ?? 0) > 0) ??
              p.variants[0]
            const cover =
              v?.image_urls?.[0] ?? p.image_url ?? null
            const price = Number(v?.price_menudeo ?? v?.price ?? 0)
            return (
              <motion.button
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={() => onOpen(p.id)}
                className="shrink-0 w-36 snap-start text-left rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow press"
                title={p.name}
              >
                <div className="relative w-full aspect-square bg-gradient-to-br from-pink-100 to-fuchsia-100 dark:from-pink-500/20 dark:to-fuchsia-500/20">
                  {cover ? (
                    <img
                      src={imageThumbnail(cover) || cover}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/70">
                      <Package size={28} />
                    </div>
                  )}
                  {/* Badge NUEVO pequeño */}
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-pink-500 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">
                    Nuevo
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="text-[11px] font-bold leading-tight line-clamp-2 text-slate-800 dark:text-slate-200 min-h-[28px]">
                    {p.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[12px] font-black text-primary tabular-nums">
                      {formatMoney(price)}
                    </p>
                    <ChevronRight
                      size={12}
                      className="text-slate-300 dark:text-slate-600"
                    />
                  </div>
                </div>
              </motion.button>
            )
          })}
        </AnimatePresence>

        {/* CTA final "Ver todo el catálogo" — cierra la fila con un atajo
            al catálogo completo en vez de cortar seco. Misma altura que
            las cards de producto para no romper la alineación visual. */}
        <motion.button
          key="see-all"
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.22, delay: 0.06 }}
          type="button"
          onClick={() => navigate("/")}
          className="shrink-0 w-36 snap-start text-center rounded-2xl bg-gradient-to-br from-pink-50 via-fuchsia-50 to-amber-50 dark:from-pink-500/15 dark:via-fuchsia-500/15 dark:to-amber-500/15 border-2 border-dashed border-pink-300 dark:border-pink-500/40 overflow-hidden hover:shadow-md hover:border-solid transition-all press flex flex-col items-center justify-center gap-2 py-6"
          aria-label="Ver todo el catálogo"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-fuchsia-500 text-white flex items-center justify-center shadow-lg">
            <ArrowRight size={20} strokeWidth={2.5} />
          </div>
          <div className="px-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 leading-tight">
              Ver todo
            </p>
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
              Catálogo completo
            </p>
          </div>
        </motion.button>
      </div>
    </motion.section>
  )
}

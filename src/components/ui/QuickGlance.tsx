import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Eye, Package } from "lucide-react"

import { formatMoney } from "../../lib/format"

export interface QuickGlanceVariant {
  id: string
  variant_name: string
  price: number
  price_menudeo?: number | null
  stock: number
  image_url?: string | null
}

interface Props {
  open: boolean
  productName: string
  productImage?: string | null
  variants: QuickGlanceVariant[]
  /** Función para anclar el popover cerca del elemento que lo dispara. */
  anchorRect?: DOMRect | null
}

/**
 * Vista rápida (Quick Glance) que aparece al mantener presionado un
 * producto. Muestra todas las variantes con precio + stock. No es un
 * modal: no bloquea scroll, no tiene close button. Desaparece al
 * levantar el dedo. Se ancla sobre el card que lo invoca.
 */
export default function QuickGlance({
  open,
  productName,
  productImage,
  variants,
  anchorRect,
}: Props) {
  if (typeof document === "undefined") return null

  // Anclamos el popover encima del card (centrado horizontalmente).
  const top = anchorRect ? Math.max(16, anchorRect.top - 12) : 80
  const adjustedTop =
    anchorRect && top > window.innerHeight - 280
      ? Math.max(16, anchorRect.bottom - 280)
      : top
  const left = anchorRect
    ? Math.max(8, Math.min(window.innerWidth - 280 - 8, anchorRect.left + anchorRect.width / 2 - 140))
    : 16

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="quick-glance"
          initial={{ opacity: 0, scale: 0.92, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{
            top: adjustedTop,
            left,
            willChange: "transform, opacity",
          }}
          className="fixed z-[200] w-[280px] max-w-[calc(100vw-16px)] pointer-events-none rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 bg-gradient-to-r from-primary/8 to-violet-500/8">
            <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <Eye size={11} />
            </span>
            <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 truncate flex-1">
              {productName}
            </p>
          </div>
          <ul className="max-h-[280px] overflow-y-auto py-1">
            {variants.length === 0 ? (
              <li className="px-3 py-3 text-[11px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-2">
                <Package size={12} /> Sin variantes
              </li>
            ) : (
              variants.map((v) => {
                const out = v.stock <= 0
                const critical = !out && v.stock <= 3
                const price = v.price_menudeo ?? v.price
                return (
                  <li
                    key={v.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    {(v.image_url ?? productImage) && (
                      <img
                        src={(v.image_url ?? productImage) as string}
                        alt=""
                        className="w-7 h-7 rounded-lg object-cover shrink-0"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
                        {v.variant_name}
                      </p>
                      <p className="text-[10px] font-bold text-primary tabular-nums">
                        {formatMoney(price)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[9px] font-black uppercase tracking-widest tabular-nums ${
                        out
                          ? "text-rose-500"
                          : critical
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {out ? "Agotado" : `${v.stock} pz`}
                    </span>
                  </li>
                )
              })
            )}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

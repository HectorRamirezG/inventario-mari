import { motion, AnimatePresence } from "framer-motion"
import { Clock, X } from "lucide-react"

import { useRecentViews, clearRecentViews } from "../../lib/useRecentViews"
import { imageThumbnail } from "../../lib/imageTransform"
import { formatMoney } from "../../lib/format"

/**
 * Fila scroll horizontal con los últimos productos que vio el cliente.
 * Si no hay nada o solo hay 1, no aparece (no aporta valor).
 *
 * Click en un item dispara `onOpen(productId)` que el padre usa para
 * abrir el lightbox o buysheet correspondiente.
 */
export default function RecentlyViewedRow({
  onOpen,
}: {
  onOpen: (productId: string) => void
}) {
  const items = useRecentViews()
  if (items.length < 2) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4"
      aria-label="Vistos recientemente"
    >
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="text-slate-400" />
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Vistos recientemente
          </h3>
        </div>
        <button
          type="button"
          onClick={clearRecentViews}
          className="text-[9px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 press"
          aria-label="Limpiar historial"
        >
          <X size={9} /> Limpiar
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto scroll-container-ios pb-1 -mx-1 px-1">
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.button
              key={it.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={() => onOpen(it.id)}
              className="shrink-0 w-24 text-left rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 overflow-hidden lift-on-hover hover:border-primary/40 press"
              title={it.name}
            >
              <div className="w-full aspect-square bg-slate-100 dark:bg-slate-700/40">
                {it.image ? (
                  <img
                    src={imageThumbnail(it.image) || it.image}
                    alt={it.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" />
                )}
              </div>
              <div className="px-1.5 py-1">
                <p className="text-[10px] font-bold leading-tight line-clamp-1 text-slate-700 dark:text-slate-300">
                  {it.name}
                </p>
                <p className="text-[10px] font-black text-primary tabular-nums">
                  {formatMoney(it.price)}
                </p>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

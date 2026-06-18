import { motion, AnimatePresence } from "framer-motion"
import { ShoppingBag, X } from "lucide-react"
import { useAbandonedCartBanner, type PersistedCartLine } from "../../lib/useCartPersist"
import { formatMoney } from "../../lib/format"

interface Props {
  onResume: (lines: PersistedCartLine[]) => void
}

export default function AbandonedCartBanner({ onResume }: Props) {
  const { snapshot, dismiss, resume } = useAbandonedCartBanner({ onResume })

  if (!snapshot || snapshot.lines.length === 0) return null

  const totalQty = snapshot.lines.reduce((a, l) => a + l.qty, 0)
  const totalAmt = snapshot.lines.reduce((a, l) => a + l.qty * l.unit_price, 0)
  const ageMin = Math.max(1, Math.round((Date.now() - snapshot.savedAt) / 60000))
  const ageLabel = ageMin < 60 ? `hace ${ageMin} min` : `hace ${Math.round(ageMin / 60)} h`

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="mb-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-500/10 dark:to-purple-500/10 p-3 flex items-center gap-3"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-bloom shrink-0"
          style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
        >
          <ShoppingBag size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
            Tienes {totalQty} {totalQty === 1 ? "pieza" : "piezas"} en tu carrito
          </p>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
            {formatMoney(totalAmt)} · guardado {ageLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={resume}
          className="h-9 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shrink-0"
        >
          Reanudar
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Descartar"
          className="w-8 h-8 rounded-lg bg-white/70 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
        >
          <X size={12} />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

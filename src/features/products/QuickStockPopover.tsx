import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Minus, Plus, Loader2, Package, X, Check } from "lucide-react"
import toast from "react-hot-toast"
import { applyMovement } from "../movements/movementService"
import { sound } from "../../lib/sound"

interface Variant {
  id: string
  variant_name: string
  stock: number
}

interface Props {
  open: boolean
  variants: Variant[]
  productName: string
  onClose: () => void
  onSaved: () => void
}

export default function QuickStockPopover({
  open,
  variants,
  productName,
  onClose,
  onSaved,
}: Props) {
  const [deltas, setDeltas] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setDeltas({})
      return
    }
    function onDown(e: MouseEvent) {
      if (busy) return
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, busy, onClose])

  if (!open) return null

  const hasChanges = Object.values(deltas).some((d) => d !== 0)

  function bump(id: string, d: number) {
    setDeltas((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + d }))
  }

  async function apply() {
    const entries = Object.entries(deltas).filter(([, v]) => v !== 0)
    if (entries.length === 0) return
    setBusy(true)
    const tid = toast.loading("Ajustando stock...")
    try {
      const ops = entries.map(([variantId, delta]) =>
        applyMovement({
          variantId,
          type: delta > 0 ? "entrada" : "venta",
          quantity: Math.abs(delta),
        })
      )
      const results = await Promise.allSettled(ops)
      const failed = results.filter((r) => r.status === "rejected")
      sound.success()
      if (failed.length === 0) {
        toast.success(`Stock actualizado (${entries.length} cambio${entries.length === 1 ? "" : "s"})`, { id: tid })
      } else {
        toast.error(`${failed.length} ajuste(s) fallaron. Reintenta.`, { id: tid })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló el ajuste", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -4 }}
        transition={{ type: "spring", stiffness: 380, damping: 26 }}
        className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_-15px_rgba(15,23,42,0.3)] border border-slate-100 dark:border-slate-700 overflow-hidden z-30"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Package size={12} className="text-primary shrink-0" />
            <p className="text-[10px] font-black uppercase tracking-widest truncate">
              Ajustar stock
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
          >
            <X size={11} />
          </button>
        </div>

        <p className="px-3 pt-2 text-[10px] font-black text-slate-500 truncate">
          {productName}
        </p>

        <div className="max-h-72 overflow-y-auto px-3 py-2 space-y-1.5">
          {variants.length === 0 && (
            <p className="text-[10px] text-slate-400 italic py-2 text-center">
              Sin variantes para ajustar
            </p>
          )}
          {variants.map((v) => {
            const d = deltas[v.id] ?? 0
            const next = v.stock + d
            return (
              <div
                key={v.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black truncate">{v.variant_name}</p>
                  <p className="text-[9px] font-bold text-slate-400 tabular-nums">
                    {v.stock} {d !== 0 && (
                      <span className={d > 0 ? "text-emerald-600" : "text-rose-600"}>
                        {d > 0 ? `+${d}` : d} → {next}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => bump(v.id, -1)}
                  disabled={next <= 0}
                  className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-600 flex items-center justify-center disabled:opacity-30"
                  aria-label="Restar"
                >
                  <Minus size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => bump(v.id, +1)}
                  className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center active:scale-90"
                  aria-label="Sumar"
                >
                  <Plus size={12} />
                </button>
              </div>
            )
          })}
        </div>

        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={apply}
            disabled={!hasChanges || busy}
            className="w-full h-10 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 shadow-bloom"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Aplicar cambios
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

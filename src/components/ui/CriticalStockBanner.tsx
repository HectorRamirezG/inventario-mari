import { motion, AnimatePresence } from "framer-motion"
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right"
import { useEffect, useState } from "react"

import { useCriticalStockCount } from "../../lib/useCriticalStockCount"

const DISMISS_KEY = "mari:critical-stock-banner:dismissed-at"
const DISMISS_TTL_MS = 4 * 60 * 60 * 1000 // 4 horas

function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* noop */
  }
}

/**
 * Banner sticky en el AdminShell que avisa cuando hay variantes con
 * stock = 0 (productos agotados). Mari toca → va a Inventario con foco.
 *
 * UX:
 * - Solo aparece si hay >=1 variante agotada.
 * - Botón "x" lo oculta por 4 horas (se vuelve a mostrar después).
 * - El count se actualiza vía realtime de `variants` y `sales`.
 */
export default function CriticalStockBanner() {
  const count = useCriticalStockCount()
  const [dismissed, setDismissed] = useState<boolean>(() => wasRecentlyDismissed())

  // Re-evaluar dismissed al cambiar el count (si volvió a haber agotados,
  // permitimos mostrarlo de nuevo solo si NO se descartó recientemente)
  useEffect(() => {
    if (count === 0) return
    setDismissed(wasRecentlyDismissed())
  }, [count])

  const visible = count > 0 && !dismissed

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("app:navigate", {
                    detail: { tab: "inventario" },
                  }),
                )
              }}
              className="group w-full flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-50 to-orange-50 dark:from-rose-500/10 dark:to-orange-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-left hover:from-rose-100 hover:to-orange-100 dark:hover:from-rose-500/15 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                <AlertTriangle size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300 leading-tight">
                  Sin existencia
                </p>
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight truncate">
                  {count} {count === 1 ? "producto" : "productos"} en 0 — ve a
                  Inventario para reabastecer.
                </p>
              </div>
              <ChevronRight
                size={14}
                className="text-rose-500 shrink-0 group-hover:translate-x-0.5 transition-transform"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  markDismissed()
                  setDismissed(true)
                }}
                aria-label="Ocultar aviso por 4 horas"
                className="shrink-0 w-6 h-6 rounded-md text-rose-500/60 hover:text-rose-700 hover:bg-rose-200/40 dark:hover:bg-rose-500/20 flex items-center justify-center text-base leading-none -mr-1"
              >
                ×
              </button>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

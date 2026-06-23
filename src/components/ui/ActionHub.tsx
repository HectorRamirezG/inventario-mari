import { useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Zap, ScanLine, Plus, BookmarkPlus, X, Receipt,
} from "lucide-react"

import { useBodyScrollLock } from "../../lib/bodyScrollLock"

export interface HubAction {
  id: string
  label: string
  caption?: string
  icon: React.ComponentType<{ size?: number }>
  accent?: string // gradiente CSS
  onClick: () => void
  /** Diferenciador: "atajo" = acción transaccional rápida (escanear, nuevo
   *  producto, etc.). "nav" = ir a una sección del menú. Por default "atajo". */
  kind?: "atajo" | "nav"
}

interface Props {
  open: boolean
  onClose: () => void
  actions: HubAction[]
}

/**
 * Action Hub: bottom sheet con dos secciones claras:
 *  - Atajos rápidos (cards grandes con accent: escanear, cobrar, etc.)
 *  - Ir a... (pills compactos a las secciones del menú)
 *
 * Esto evita el problema de ver 14+ cards iguales scrolleando sin orden.
 * Si una HubAction no declara `kind`, se considera "atajo" salvo que sea
 * heurísticamente una sección de navegación (por defecto sigue siendo atajo).
 */
export default function ActionHub({ open, onClose, actions }: Props) {
  useBodyScrollLock(open)

  const { shortcuts, navItems } = useMemo(() => {
    const sc: HubAction[] = []
    const nv: HubAction[] = []
    for (const a of actions) {
      if (a.kind === "nav") nv.push(a)
      else sc.push(a)
    }
    return { shortcuts: sc, navItems: nv }
  }, [actions])

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="hub"
          className="fixed inset-0 z-[150]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop sin blur — backdrop-blur dispara repintados de
              todo lo que está detrás cada frame y causa parpadeos
              visibles al abrir/cerrar el sheet. */}
          <motion.div
            className="absolute inset-0 bg-slate-950/55"
            onClick={onClose}
          />

          {/* Sheet. drag solo en la handle, no en todo el sheet. */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 bottom-0 max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 border-t border-white/40 dark:border-slate-700/40 rounded-t-[2rem] pb-safe shadow-[0_-25px_60px_-15px_rgba(0,0,0,0.3)]"
            style={{ transform: "translate3d(0,0,0)" }}
          >
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) onClose()
              }}
              className="flex flex-col items-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
            >
              <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </motion.div>

            <div className="px-5 pt-2 pb-2 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black tracking-tight leading-tight">
                  Acciones rápidas
                </h3>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  ¿Qué necesitas hacer?
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 press"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contenido scrollable con padding controlado */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 scroll-container-ios space-y-4">
              {/* Sección 1: Atajos transaccionales (cards medianas) */}
              {shortcuts.length > 0 && (
                <section>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Atajos
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {shortcuts.map((a, i) => (
                      <motion.button
                        key={a.id}
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.03 * i, type: "spring", damping: 22 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => {
                          a.onClick()
                          onClose()
                        }}
                        className="flex flex-col items-center text-center gap-1.5 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors press"
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-bloom"
                          style={{
                            background:
                              a.accent ??
                              "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                          }}
                        >
                          <a.icon size={18} />
                        </div>
                        <p className="text-[10px] font-black leading-tight line-clamp-2">
                          {a.label}
                        </p>
                      </motion.button>
                    ))}
                  </div>
                </section>
              )}

              {/* Sección 2: Navegar (pills horizontales scrollables) */}
              {navItems.length > 0 && (
                <section>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Ir a
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {navItems.map((a, i) => (
                      <motion.button
                        key={a.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.02 * i }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => {
                          a.onClick()
                          onClose()
                        }}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-primary/30 transition-colors press"
                      >
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                          style={{
                            background:
                              a.accent ??
                              "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                          }}
                        >
                          <a.icon size={13} />
                        </span>
                        <p className="text-[9px] font-black leading-tight text-center line-clamp-2">
                          {a.label}
                        </p>
                      </motion.button>
                    ))}
                  </div>
                </section>
              )}

              {shortcuts.length === 0 && navItems.length === 0 && (
                <p className="text-center text-[11px] text-slate-400 italic py-8">
                  No hay acciones disponibles
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// Acciones por defecto que se pueden pasar al ActionHub.
export const DEFAULT_HUB_ICONS = {
  newSale: Zap,
  scan: ScanLine,
  newProduct: Plus,
  apartado: BookmarkPlus,
  receipt: Receipt,
}

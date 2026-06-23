import { useEffect } from "react"
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
}

interface Props {
  open: boolean
  onClose: () => void
  actions: HubAction[]
}

/**
 * Action Hub: bottom drawer estilo iOS/Linear con acciones rápidas.
 * Se invoca desde el botón flotante central del dock.
 */
export default function ActionHub({ open, onClose, actions }: Props) {
  useBodyScrollLock(open)

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
              visibles al abrir/cerrar el sheet. Usamos fondo más opaco
              para conservar contraste sin el costo del blur. */}
          <motion.div
            className="absolute inset-0 bg-slate-950/55"
            onClick={onClose}
          />

          {/* Sheet.
              NOTA: NO ponemos `drag` en todo el sheet porque eso atrapaba
              cualquier toque vertical (incluyendo intento de scroll en la
              grilla de acciones) y lo confundía con un drag para cerrar.
              El drag solo vive en la barra superior (handle). */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 bottom-0 max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 border-t border-white/40 dark:border-slate-700/40 rounded-t-[2rem] pb-safe shadow-[0_-25px_60px_-15px_rgba(0,0,0,0.3)]"
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

            <div className="px-5 pt-3 pb-2 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-black tracking-tight">Acciones rápidas</h3>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  ¿Qué necesitas hacer?
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* Grilla scrollable. Sin esto, si hay muchas acciones se
                salen del viewport y no se ven en móviles bajos. */}
            <div className="grid grid-cols-2 gap-3 px-5 pt-3 pb-7 overflow-y-auto overscroll-contain flex-1 min-h-0 scroll-container-ios">
              {actions.map((a, i) => (
                <motion.button
                  key={a.id}
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.04 * i, type: "spring", damping: 22 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    a.onClick()
                    onClose()
                  }}
                  className="text-left relative overflow-hidden rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/60 hover:shadow-md transition-shadow"
                >
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-bloom"
                    style={{ background: a.accent ?? "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
                  >
                    <a.icon size={20} />
                  </div>
                  <p className="mt-3 text-sm font-black tracking-tight leading-tight">
                    {a.label}
                  </p>
                  {a.caption && (
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                      {a.caption}
                    </p>
                  )}
                </motion.button>
              ))}
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

import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Keyboard } from "lucide-react"
import { createPortal } from "react-dom"

/**
 * Cheatsheet de atajos del admin shell. Se abre con `?` desde cualquier
 * pantalla y muestra una matriz limpia de qué tecla hace qué.
 *
 * Diseño:
 *   - Overlay translúcido con backdrop blur
 *   - Card centrada, max-w-md
 *   - Cierra con Esc, click fuera o botón X
 *
 * Si quieres añadir más atajos, edita el array `SHORTCUTS` abajo. El
 * componente NO conoce las teclas activas — solo las pinta. La lógica
 * vive en App.tsx::kbdHandler.
 */

interface Shortcut {
  /** Lista de teclas; varias para combos (ej ["g", "h"]) */
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: "Globales",
    items: [
      { keys: ["⌘", "K"], description: "Buscar / Command Palette" },
      { keys: ["?"], description: "Mostrar atajos (esta ventana)" },
      { keys: ["["], description: "Colapsar / expandir sidebar" },
      { keys: ["N"], description: "Abrir hub de acciones rápidas" },
    ],
  },
  {
    title: "Saltar a sección",
    items: [
      { keys: ["G", "H"], description: "Ir a Hoy" },
      { keys: ["G", "C"], description: "Ir a Caja" },
      { keys: ["G", "P"], description: "Ir a Pendientes (apartados)" },
      { keys: ["G", "I"], description: "Ir a Inventario (catálogo)" },
      { keys: ["G", "S"], description: "Ir a Soporte" },
      { keys: ["G", "W"], description: "Ir a Sugerencias (wishes)" },
      { keys: ["G", "R"], description: "Ir a Reseñas" },
      { keys: ["G", "Y"], description: "Ir a Ciclos (admin)" },
      { keys: ["G", "A"], description: "Ir a Ajustes" },
      { keys: ["1"], description: "Primera sección del sidebar" },
      { keys: ["2"], description: "Segunda…" },
      { keys: ["9"], description: "Hasta la novena" },
    ],
  },
]

export default function KeyboardHelpDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [open, onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md max-h-[80vh] overflow-y-auto custom-scrollbar rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-bloom"
                  style={{
                    background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                  }}
                >
                  <Keyboard size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black italic uppercase tracking-tighter text-slate-900 dark:text-slate-100 leading-tight">
                    Atajos de teclado
                  </h2>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                    Más rápido que el ratón
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 flex items-center justify-center press"
              >
                <X size={14} />
              </button>
            </div>

            {/* Grupos */}
            <div className="p-5 space-y-5">
              {SHORTCUTS.map((g) => (
                <section key={g.title}>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    {g.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {g.items.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          {s.description}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.keys.map((k, ki) => (
                            <kbd
                              key={ki}
                              className="text-[10px] font-black uppercase tracking-widest min-w-[24px] h-6 px-2 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 rounded-b-3xl">
              <p className="text-[10px] font-bold text-slate-400 text-center">
                Presiona <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">Esc</kbd> para cerrar
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Keyboard, X } from "lucide-react"

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Navegación rápida",
    shortcuts: [
      { keys: ["1"], description: "Ir a Caja" },
      { keys: ["2"], description: "Ir a Pendientes" },
      { keys: ["3"], description: "Ir a Catálogo" },
      { keys: ["4"], description: "Ir a Ciclos" },
      { keys: ["5"], description: "Ir a Soporte" },
      { keys: ["6"], description: "Ir a Reglas" },
      { keys: ["7"], description: "Ir a Calculadora" },
    ],
  },
  {
    title: "Modo \"ir a\" (estilo Vim)",
    shortcuts: [
      { keys: ["g", "d"], description: "Dashboard" },
      { keys: ["g", "i"], description: "Inventario" },
      { keys: ["g", "v"], description: "Ventas" },
      { keys: ["g", "a"], description: "Apartados" },
      { keys: ["g", "p"], description: "Precios" },
      { keys: ["g", "s"], description: "Soporte" },
      { keys: ["g", "c"], description: "Ciclos" },
      { keys: ["g", "r"], description: "Reglas" },
    ],
  },
  {
    title: "Globales",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Abrir buscador de comandos" },
      { keys: ["?"], description: "Mostrar esta ayuda" },
      { keys: ["Esc"], description: "Cerrar modal / cancelar" },
    ],
  },
  {
    title: "En Caja (Ventas)",
    shortcuts: [
      { keys: ["/"], description: "Enfocar el buscador" },
      { keys: ["S"], description: "Abrir escáner de código" },
      { keys: ["C"], description: "Cobrar el carrito actual" },
    ],
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function ShortcutsCheatsheet({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-premium overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shadow-bloom"
                  style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
                >
                  <Keyboard size={16} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">
                    Atajos de teclado
                  </h2>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    Mantente rápida con el teclado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
              >
                <X size={14} />
              </button>
            </div>

            {/* Lista de atajos */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scroll-container-ios">
              {GROUPS.map((group) => (
                <section key={group.title}>
                  <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    {group.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {group.shortcuts.map((s) => (
                      <li
                        key={s.description}
                        className="flex items-center justify-between gap-3 py-1.5"
                      >
                        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200">
                          {s.description}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.keys.map((k, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && (
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
                                  luego
                                </span>
                              )}
                              <kbd className="min-w-[28px] h-7 px-2 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-sm">
                                {k}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* Footer pista */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500">
              Presiona{" "}
              <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-black text-slate-700 dark:text-slate-200">
                ?
              </kbd>{" "}
              en cualquier momento para volver a abrir esta ayuda.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ─────────────────────────────────────────────
 * Hook para listener global del atajo `?`
 * ───────────────────────────────────────────── */

export function useShortcutsCheatsheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return
      }
      if (e.key === "?") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return { open, setOpen }
}

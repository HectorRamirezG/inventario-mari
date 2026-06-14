import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Bookmark,
  Tag,
  ScanLine,
  Moon,
  Sun,
  RefreshCcw,
  Sparkles,
  Settings,
} from "lucide-react"
import { useTheme } from "../../lib/useTheme"

interface Command {
  id: string
  label: string
  hint?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  shortcut?: string
  group: "Navegación" | "Acciones" | "Tema"
  run: () => void
}

const navigate = (tab: string) =>
  window.dispatchEvent(new CustomEvent("app:navigate", { detail: { tab } }))

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Command palette estilo Linear / Raycast. Se invoca con Cmd/Ctrl+K.
 * Filtrado fuzzy simple por substring case-insensitive.
 */
export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { effective, toggle, setTheme } = useTheme()

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const allCommands: Command[] = useMemo(
    () => [
      // ── Navegación ────────────────────────────
      {
        id: "go-dashboard",
        label: "Ir a Inicio",
        hint: "Dashboard general",
        icon: LayoutDashboard,
        shortcut: "1",
        group: "Navegación",
        run: () => navigate("dashboard"),
      },
      {
        id: "go-stock",
        label: "Ir a Stock",
        hint: "Catálogo de productos",
        icon: Package,
        shortcut: "2",
        group: "Navegación",
        run: () => navigate("inventario"),
      },
      {
        id: "go-ventas",
        label: "Nueva venta",
        hint: "Caja activa",
        icon: ShoppingCart,
        shortcut: "3",
        group: "Navegación",
        run: () => navigate("ventas"),
      },
      {
        id: "go-apartados",
        label: "Ver apartados",
        hint: "Cobros pendientes",
        icon: Bookmark,
        shortcut: "4",
        group: "Navegación",
        run: () => navigate("apartados"),
      },
      {
        id: "go-precios",
        label: "Calculadora de precios",
        hint: "Análisis y configuración",
        icon: Tag,
        shortcut: "5",
        group: "Navegación",
        run: () => navigate("precios"),
      },
      {
        id: "go-settings",
        label: "Configuración",
        hint: "Tienda y PINs",
        icon: Settings,
        group: "Navegación",
        run: () => navigate("settings"),
      },
      // ── Acciones ──────────────────────────────
      {
        id: "open-scanner",
        label: "Escanear código",
        hint: "Abre la cámara para escanear SKU",
        icon: ScanLine,
        group: "Acciones",
        run: () => {
          navigate("ventas")
          // Dejamos un pequeño delay para que la página cargue antes de abrir
          setTimeout(
            () => window.dispatchEvent(new CustomEvent("sales:open-scanner")),
            150
          )
        },
      },
      {
        id: "refresh",
        label: "Recargar datos",
        hint: "Vuelve a leer de Supabase",
        icon: RefreshCcw,
        group: "Acciones",
        run: () => window.location.reload(),
      },
      // ── Tema ───────────────────────────────────
      {
        id: "theme-toggle",
        label: effective === "dark" ? "Modo claro" : "Modo oscuro",
        hint: "Alternar tema",
        icon: effective === "dark" ? Sun : Moon,
        group: "Tema",
        run: toggle,
      },
      {
        id: "theme-system",
        label: "Usar tema del sistema",
        hint: "Auto: sigue al SO",
        icon: Sparkles,
        group: "Tema",
        run: () => setTheme("system"),
      },
    ],
    [effective, toggle, setTheme]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCommands
    return allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.hint ?? "").toLowerCase().includes(q)
    )
  }, [query, allCommands])

  // Keyboard nav
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((a) => Math.min(a + 1, filtered.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const cmd = filtered[active]
        if (cmd) {
          cmd.run()
          onClose()
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, filtered, active, onClose])

  if (typeof document === "undefined") return null

  // Agrupa por grupo manteniendo el orden de aparición
  const grouped = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    if (!acc[c.group]) acc[c.group] = []
    acc[c.group].push(c)
    return acc
  }, {})

  let runningIdx = -1

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-start justify-center pt-[12vh] px-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Box */}
          <motion.div
            initial={{ scale: 0.96, y: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: -10, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                placeholder="Buscar comandos…"
                className="flex-1 bg-transparent border-none outline-none text-sm font-bold text-slate-900 placeholder:text-slate-400"
              />
              <kbd className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-500">
                Esc
              </kbd>
            </div>

            {/* Lista */}
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar py-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Sin resultados
                </p>
              ) : (
                Object.entries(grouped).map(([group, cmds]) => (
                  <div key={group} className="mb-2">
                    <p className="px-4 py-1 text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">
                      {group}
                    </p>
                    {cmds.map((c) => {
                      runningIdx += 1
                      const isActive = runningIdx === active
                      const Icon = c.icon
                      return (
                        <button
                          key={c.id}
                          onMouseEnter={() => setActive(runningIdx)}
                          onClick={() => {
                            c.run()
                            onClose()
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isActive ? "bg-primary/10" : "bg-transparent"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isActive
                                ? "bg-primary text-white"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black text-slate-800 truncate">
                              {c.label}
                            </p>
                            {c.hint && (
                              <p className="text-[9px] font-bold text-slate-400 truncate">
                                {c.hint}
                              </p>
                            )}
                          </div>
                          {c.shortcut && (
                            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-black text-slate-500">
                              {c.shortcut}
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                    ↑↓
                  </kbd>
                  Mover
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                    ↵
                  </kbd>
                  Ejecutar
                </span>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                Mari Inv
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

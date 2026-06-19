import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate, useLocation } from "react-router-dom"
import {
  Search,
  ScanLine,
  Moon,
  Sun,
  RefreshCcw,
  Sparkles,
  Plus,
  User as UserIcon,
  Wifi,
  Receipt,
  X,
  CircleDollarSign,
  Package,
  ShoppingBag,
  Loader2,
  Tag,
  type LucideIcon,
} from "lucide-react"
import toast from "react-hot-toast"
import { useTheme } from "../../lib/useTheme"
import { supabase } from "../../lib/supabase"
import {
  ADMIN_SECTIONS,
  visibleSections,
  type AdminSectionEntry,
} from "../../lib/adminNav"
import { useBusinessRules } from "../../features/settings/businessRulesService"
import { useAuth } from "../../lib/useAuth"
import { useDebouncedValue } from "../../lib/useDebouncedValue"
import {
  universalSearch,
  type UniversalResult,
} from "../../lib/universalSearch"

interface Command {
  id: string
  label: string
  hint?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  shortcut?: string
  group: "Navegación" | "Acciones" | "Diagnóstico" | "Tema"
  run: () => void
}

const dispatch = (name: string, detail?: any) =>
  window.dispatchEvent(new CustomEvent(name, { detail }))

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Command palette estilo Linear / Raycast. Se invoca con Cmd/Ctrl+K.
 * Filtrado fuzzy por substring case-insensitive.
 *
 * Atajos numéricos (1..7) abren las pestañas principales aun con la
 * palette CERRADA — los maneja `useGlobalShortcuts`. La palette muestra
 * la pista del atajo en cada fila.
 */
export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 250)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { effective, toggle, setTheme } = useTheme()
  const rules = useBusinessRules()
  const { role } = useAuth()
  const isAdmin = role === "admin"
  const routerNavigate = useNavigate()
  const location = useLocation()

  /**
   * Navega a una sección admin. Si NO estamos en /admin (p.ej. estamos
   * en /tienda o /comanda/xxx), primero hace SPA navigate a /admin y
   * después dispara el evento que cambia la pestaña dentro del shell.
   * Si ya estamos en /admin, sólo dispara el evento.
   *
   * El delay de 60ms cuando se hace router navigate es para dar tiempo
   * al AdminShell de montarse y registrar el listener de "app:navigate".
   */
  const navigate = (tab: string) => {
    const inAdmin = location.pathname.startsWith("/admin")
    if (!inAdmin) {
      routerNavigate("/admin")
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("app:navigate", { detail: { tab } }))
      }, 60)
    } else {
      window.dispatchEvent(new CustomEvent("app:navigate", { detail: { tab } }))
    }
  }

  // Resultados dinámicos (productos / ventas / clientes) que se obtienen
  // de la BD cada vez que el usuario escribe 2+ caracteres.
  const [dynamicResults, setDynamicResults] = useState<UniversalResult[]>([])
  const [searching, setSearching] = useState(false)

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      setDynamicResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Lanza la búsqueda universal cuando cambia el query debounced.
  useEffect(() => {
    if (!open) return
    const q = debouncedQuery.trim()
    if (q.length < 2) {
      setDynamicResults([])
      setSearching(false)
      return
    }
    let alive = true
    setSearching(true)
    universalSearch(q)
      .then((res) => {
        if (alive) setDynamicResults(res)
      })
      .catch(() => {
        if (alive) setDynamicResults([])
      })
      .finally(() => {
        if (alive) setSearching(false)
      })
    return () => {
      alive = false
    }
  }, [debouncedQuery, open])

  /** Mapa AdminSection -> 'tab' que entiende el dispatcher de App.tsx */
  const sectionToTab: Record<string, string> = {
    hoy: "dashboard",
    catalogo: "inventario",
    caja: "ventas",
    pendientes: "apartados",
    calculadora: "precios",
    ajustes: "settings",
  }

  const navCommands: Command[] = useMemo(
    () =>
      visibleSections(rules, isAdmin).map(
        (s: AdminSectionEntry): Command => ({
          id: `go-${s.id}`,
          label: s.label,
          hint: s.hint ?? s.caption,
          icon: s.icon,
          shortcut: s.shortcut,
          group: "Navegación",
          run: () => navigate(sectionToTab[s.id] ?? s.id),
        })
      ),
    [rules, isAdmin]
  )

  const allCommands: Command[] = useMemo(
    () => [
      ...navCommands,

      /* ─────────── Acciones transaccionales ─────────── */
      {
        id: "open-scanner",
        label: "Escanear código de barras",
        hint: "Abre la cámara para sumar al carrito",
        icon: ScanLine,
        group: "Acciones",
        run: () => {
          navigate("ventas")
          setTimeout(() => dispatch("sales:open-scanner"), 150)
        },
      },
      {
        id: "new-product",
        label: "Nuevo producto",
        hint: "Abre el drawer de creación",
        icon: Plus,
        group: "Acciones",
        run: () => {
          navigate("inventario")
          setTimeout(() => dispatch("products:new"), 150)
        },
      },
      {
        id: "focus-customer",
        label: "Buscar cliente en caja",
        hint: "Foco al campo de nombre/teléfono",
        icon: UserIcon,
        group: "Acciones",
        run: () => {
          navigate("ventas")
          setTimeout(() => dispatch("sales:focus-customer"), 200)
        },
      },
      {
        id: "clear-cart",
        label: "Limpiar carrito de caja",
        hint: "Vacía la venta en curso",
        icon: X,
        group: "Acciones",
        run: () => dispatch("sales:clear-cart"),
      },
      {
        id: "day-close",
        label: "Corte de caja express",
        hint: "Resumen del día actual",
        icon: CircleDollarSign,
        group: "Acciones",
        run: () => {
          navigate("dashboard")
          setTimeout(() => dispatch("dashboard:open-day-close"), 150)
        },
      },
      {
        id: "overdue",
        label: "Apartados vencidos",
        hint: "Solo los que pasaron del plazo",
        icon: Receipt,
        group: "Acciones",
        run: () => {
          navigate("apartados")
          setTimeout(() => dispatch("apartados:filter-overdue"), 150)
        },
      },
      {
        id: "open-profile",
        label: "Mi perfil",
        hint: "Editar datos, cambiar contraseña",
        icon: UserIcon,
        group: "Acciones",
        run: () => dispatch("mari:open-profile"),
      },

      /* ─────────── Diagnóstico ─────────── */
      {
        id: "ping-supabase",
        label: "Verificar conexión Supabase",
        hint: "Test de latencia + realtime",
        icon: Wifi,
        group: "Diagnóstico",
        run: async () => {
          const tid = toast.loading("Probando Supabase…")
          const t0 = performance.now()
          try {
            const { error } = await supabase
              .from("pricing_config")
              .select("id", { count: "exact", head: true })
              .limit(1)
            const ms = Math.round(performance.now() - t0)
            if (error) {
              toast.error(`Error: ${error.message}`, { id: tid })
            } else {
              const rt =
                supabase.realtime.isConnected?.() === false
                  ? "realtime desconectado"
                  : "realtime OK"
              toast.success(`Supabase ${ms}ms · ${rt}`, { id: tid })
            }
          } catch (e: any) {
            toast.error(e?.message ?? "Sin red", { id: tid })
          }
        },
      },
      {
        id: "force-sync",
        label: "Forzar sincronización",
        hint: "Recarga estados globales sin refresh",
        icon: RefreshCcw,
        group: "Diagnóstico",
        run: () => {
          dispatch("mari:apartado-refresh")
          dispatch("mari:catalog-refresh")
          dispatch("mari:notif-refresh")
          toast.success("Sincronización solicitada")
        },
      },
      {
        id: "hard-reload",
        label: "Recargar página",
        hint: "Reload completo del navegador",
        icon: RefreshCcw,
        group: "Diagnóstico",
        run: () => window.location.reload(),
      },

      /* ─────────── Tema ─────────── */
      {
        id: "theme-toggle",
        label: effective === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
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
    [navCommands, effective, toggle, setTheme]
  )

  // Mezcla comandos estáticos con resultados dinámicos. Si hay query, los
  // dinámicos van ARRIBA en su propio grupo "Resultados" para que el admin
  // vea rápidamente el producto / venta / cliente que busca.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dyn: Command[] = dynamicResults.map((r) => {
      const icon: LucideIcon =
        r.kind === "product"
          ? Package
          : r.kind === "sale"
          ? ShoppingBag
          : UserIcon
      return {
        id: `dyn-${r.kind}-${r.refId}`,
        label: r.label,
        hint: r.hint,
        icon,
        group: "Resultados",
        run: () => {
          if (r.kind === "product") {
            navigate("inventario")
            setTimeout(
              () =>
                dispatch("products:focus", {
                  productId: r.refId,
                  query: r.label,
                }),
              200
            )
          } else if (r.kind === "sale") {
            navigate("apartados")
            setTimeout(
              () =>
                dispatch("apartados:focus", {
                  saleId: r.refId,
                  query: r.label.split(" · ")[0],
                }),
              200
            )
          } else {
            navigate("apartados")
            setTimeout(
              () =>
                dispatch("apartados:focus", {
                  query: r.refId, // email/nombre normalizado
                }),
              200
            )
          }
        },
      }
    })

    if (!q) return [...dyn, ...allCommands]

    const staticFiltered = allCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.hint ?? "").toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q)
    )
    return [...dyn, ...staticFiltered]
  }, [query, allCommands, dynamicResults])

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
            className="absolute inset-0 bg-slate-900/65"
            onClick={onClose}
          />

          {/* Box */}
          <motion.div
            initial={{ scale: 0.96, y: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: -10, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              {searching ? (
                <Loader2
                  size={16}
                  className="text-primary shrink-0 animate-spin"
                />
              ) : (
                <Search size={16} className="text-slate-400 shrink-0" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                placeholder="Busca productos, clientes, folios, acciones…"
                className="flex-1 bg-transparent border-none outline-none text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              <kbd className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Esc
              </kbd>
            </div>

            {/* Lista */}
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar py-2">
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
                            isActive
                              ? "bg-primary/10"
                              : "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isActive
                                ? "bg-primary text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                            }`}
                          >
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 truncate">
                              {c.label}
                            </p>
                            {c.hint && (
                              <p className="text-[9px] font-bold text-slate-400 truncate">
                                {c.hint}
                              </p>
                            )}
                          </div>
                          {c.shortcut && (
                            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-500 dark:text-slate-400">
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
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    ↑↓
                  </kbd>
                  Mover
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    ↵
                  </kbd>
                  Ejecutar
                </span>
                <span className="hidden md:flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    1–7
                  </kbd>
                  Módulos
                </span>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                <Tag size={9} className="inline mr-0.5" /> Beauty's Me OS
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

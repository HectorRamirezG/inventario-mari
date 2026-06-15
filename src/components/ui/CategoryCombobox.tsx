import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Check, ChevronDown, Plus, Tag } from "lucide-react"

/* Categorías base sugeridas. El usuario puede escribir cualquier otra. */
export const DEFAULT_CATEGORIES = [
  "Rostro",
  "Ojos",
  "Labios",
  "Skincare",
  "Perfumería",
  "Accesorios",
] as const

interface Props {
  value: string
  onChange: (v: string) => void
  /** Lista de categorías sugeridas. Puede incluir extras detectadas en el catálogo. */
  options?: string[]
  placeholder?: string
  className?: string
}

/**
 * Combobox accesible y mobile-first inspirado en Radix/Shadcn:
 * - Click → muestra dropdown con opciones
 * - Escribir → filtra/autocompleta
 * - Si lo escrito no existe en options, se ofrece "Usar 'X' como categoría"
 * - Teclado: ArrowUp / ArrowDown / Enter / Escape
 */
export default function CategoryCombobox({
  value,
  onChange,
  options,
  placeholder = "Categoría (Rostro, Ojos, Labios...)",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [active, setActive] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

  // Lista unificada (default + extras del catálogo, sin duplicados)
  const allOptions = useMemo(() => {
    const set = new Set<string>()
    DEFAULT_CATEGORIES.forEach((c) => set.add(c))
    ;(options ?? []).forEach((o) => {
      const t = (o ?? "").trim()
      if (t) set.add(t)
    })
    return Array.from(set)
  }, [options])

  // Filtrado por búsqueda
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allOptions
    return allOptions.filter((o) => o.toLowerCase().includes(q))
  }, [allOptions, query])

  // Sincroniza el query con la prop si cambia desde fuera (al abrir un producto distinto)
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Calcula la posición del dropdown (anchor-style)
  function recalc() {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    setCoords({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return
    recalc()
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onScroll = () => recalc()
    document.addEventListener("mousedown", onDocClick)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open])

  function commit(v: string) {
    const clean = v.trim()
    onChange(clean)
    setQuery(clean)
    setOpen(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (open && filtered[active]) commit(filtered[active])
      else commit(query)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const showCustom =
    query.trim().length > 0 &&
    !filtered.some((o) => o.toLowerCase() === query.trim().toLowerCase())

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Tag
          size={14}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="w-full h-12 pl-10 pr-10 rounded-[1.5rem] bg-white border border-slate-100 text-[11px] font-black outline-none focus:border-primary/40 transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o)
            inputRef.current?.focus()
          }}
          aria-label="Abrir opciones"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90 transition-transform"
        >
          <motion.div animate={{ rotate: open ? 180 : 0 }}>
            <ChevronDown size={12} />
          </motion.div>
        </button>
      </div>

      {/* Dropdown como portal (no se corta dentro de modales) */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  width: coords.width,
                  zIndex: 250,
                }}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)] overflow-hidden max-h-72 overflow-y-auto"
              >
                {filtered.length === 0 && !showCustom && (
                  <p className="text-[10px] font-bold text-slate-400 italic px-3 py-2 text-center">
                    Sin coincidencias
                  </p>
                )}
                {filtered.map((opt, i) => {
                  const isActive = i === active
                  const isSelected = opt === value
                  return (
                    <button
                      key={opt}
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commit(opt)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-black text-left transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="truncate">{opt}</span>
                      {isSelected && <Check size={13} className="text-primary shrink-0" />}
                    </button>
                  )
                })}
                {showCustom && (
                  <button
                    type="button"
                    onClick={() => commit(query)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[12px] font-black text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border-t border-slate-100 dark:border-slate-700"
                  >
                    <Plus size={13} className="shrink-0" />
                    <span className="truncate">Usar "{query.trim()}" como categoría</span>
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}

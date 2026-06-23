import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Search from "lucide-react/dist/esm/icons/search"
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right"
import Heart from "lucide-react/dist/esm/icons/heart"
import Receipt from "lucide-react/dist/esm/icons/receipt"
import X from "lucide-react/dist/esm/icons/x"
import Sparkles from "lucide-react/dist/esm/icons/sparkles"

import { useAuth } from "../../lib/useAuth"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Modal de búsqueda universal del cliente. Se abre desde el header
 * (icono lupa). Permite:
 *   - Escribir → al submit navega a `/?q=texto` (catálogo aplica el filter).
 *   - Atajos visuales: ir a Mis pedidos, Mis deseos (si está logueado).
 *
 * NO trae resultados en vivo aquí — para evitar duplicar la query del
 * catálogo. El catálogo es la fuente de verdad de la búsqueda.
 */
export default function ClientSearchModal({ open, onClose }: Props) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(open)

  // Focus automático al abrir
  useEffect(() => {
    if (!open) {
      setValue("")
      return
    }
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  // ESC cierra
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const submit = (override?: string) => {
    const v = (override ?? value).trim()
    if (v) {
      navigate(`/?q=${encodeURIComponent(v)}`)
    } else {
      navigate("/")
    }
    onClose()
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-20 sm:pt-28 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60"
            aria-hidden
          />

          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={OVERLAY_PANEL_TRANSITION}
            style={OVERLAY_PANEL_STYLE}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.45)] border border-slate-100 dark:border-slate-800 overflow-hidden"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
              className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800"
            >
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Buscar productos…"
                className="flex-1 bg-transparent outline-none text-[13px] font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    setValue("")
                    inputRef.current?.focus()
                  }}
                  aria-label="Limpiar"
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="hidden sm:inline-flex items-center text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2"
              >
                ESC
              </button>
            </form>

            {/* Atajos rápidos */}
            <div className="p-2 space-y-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-2 pt-1">
                Atajos
              </p>
              <Row
                icon={<Sparkles size={14} className="text-primary" />}
                label="Ver todo el catálogo"
                onClick={() => submit("")}
              />
              {session && (
                <>
                  <Row
                    icon={<Receipt size={14} className="text-emerald-600" />}
                    label="Mis pedidos"
                    onClick={() => {
                      navigate("/mis-pedidos")
                      onClose()
                    }}
                  />
                  <Row
                    icon={<Heart size={14} className="text-rose-500" />}
                    label="Mis deseos"
                    onClick={() => {
                      navigate("/mis-deseos")
                      onClose()
                    }}
                  />
                </>
              )}
              {value.trim() && (
                <Row
                  icon={<Search size={14} className="text-slate-500" />}
                  label={`Buscar "${value.trim()}" en el catálogo`}
                  onClick={() => submit()}
                  highlight
                />
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Row({
  icon,
  label,
  onClick,
  highlight = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
        highlight
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200"
      }`}
    >
      <span className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="flex-1 text-[12px] font-bold truncate">{label}</span>
      <ArrowRight size={12} className="text-slate-400 shrink-0" />
    </button>
  )
}

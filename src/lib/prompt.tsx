import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import { AnimatePresence, motion } from "framer-motion"
import { MessageSquare, X } from "lucide-react"

interface PromptOptions {
  title: string
  description?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  required?: boolean
  multiline?: boolean
  maxLength?: number
}

/**
 * Reemplazo imperativo de `window.prompt()` que muestra un dialog
 * estilizado y dark-mode-friendly. Resuelve la promesa con el string
 * capturado, o `null` si el usuario canceló.
 *
 *   const reason = await promptDialog({
 *     title: "Motivo del rechazo",
 *     description: "El cliente lo verá",
 *     placeholder: "Ej. El monto no coincide",
 *     multiline: true,
 *   })
 *   if (reason) { await rejectProof(id, reason) }
 */
export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null)
      return
    }
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root: Root = createRoot(host)

    const finish = (value: string | null) => {
      render(false)
      setTimeout(() => {
        root.unmount()
        host.remove()
        resolve(value)
      }, 220)
    }

    function render(open: boolean) {
      root.render(
        <PromptDialog
          open={open}
          opts={opts}
          onConfirm={(v) => finish(v)}
          onCancel={() => finish(null)}
        />,
      )
    }

    render(true)
  })
}

function PromptDialog({
  open,
  opts,
  onConfirm,
  onCancel,
}: {
  open: boolean
  opts: PromptOptions
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(opts.defaultValue ?? "")
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 80)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
      else if (
        e.key === "Enter" &&
        !opts.multiline &&
        (!opts.required || value.trim().length > 0)
      ) {
        onConfirm(value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, value, opts.multiline, opts.required, onConfirm, onCancel])

  if (typeof document === "undefined") return null

  const canConfirm = !opts.required || value.trim().length > 0
  const max = opts.maxLength ?? 280

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-950/65"
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-[0_20px_60px_rgba(0,0,0,0.25)] p-6 space-y-4"
          >
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-500 dark:hover:text-rose-300 transition press"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-primary/10 dark:bg-primary/20 text-primary shrink-0">
                <MessageSquare size={18} />
              </div>
              <div className="flex-1 min-w-0 pr-6">
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-100 leading-tight">
                  {opts.title}
                </h3>
                {opts.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
                    {opts.description}
                  </p>
                )}
              </div>
            </div>

            {opts.multiline ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={opts.placeholder}
                rows={3}
                maxLength={max}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none transition-all"
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={opts.placeholder}
                maxLength={max}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 transition-all"
              />
            )}

            {opts.maxLength && (
              <p className="text-[10px] font-bold text-slate-400 text-right -mt-2">
                {value.length}/{max}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest press"
              >
                {opts.cancelLabel ?? "Cancelar"}
              </button>
              <button
                type="button"
                onClick={() => canConfirm && onConfirm(value)}
                disabled={!canConfirm}
                className="flex-1 h-11 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-bloom press-hard disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {opts.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

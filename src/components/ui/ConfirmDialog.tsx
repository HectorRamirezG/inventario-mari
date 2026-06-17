import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, X } from "lucide-react"
import Button from "./Button"
import clsx from "clsx"
import { useEffect } from "react"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: "danger" | "primary"
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel
}: ConfirmDialogProps) {

  /* ESC para cerrar */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  const toneStyles = {
    danger: "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-100 dark:border-rose-500/30",
    primary: "bg-pink-50 dark:bg-primary/15 text-pink-600 dark:text-primary border-pink-100 dark:border-primary/30"
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">

          {/* BACKDROP */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
          />

          {/* MODAL */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className={clsx(
              "relative w-full sm:max-w-sm",
              "rounded-t-[2rem] sm:rounded-[2rem]",
              "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800",
              "shadow-[0_20px_60px_rgba(0,0,0,0.25)]",
              "p-6"
            )}
          >

            {/* CLOSE */}
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-500 dark:hover:text-rose-300 transition press"
            >
              <X size={16} />
            </button>

            {/* CONTENT */}
            <div className="flex items-start gap-4">

              <div
                className={clsx(
                  "flex items-center justify-center h-11 w-11 rounded-xl border shrink-0",
                  toneStyles[tone]
                )}
              >
                <AlertTriangle size={18} />
              </div>

              <div className="flex-1">
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-100 leading-tight">
                  {title}
                </h3>

                {description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
                    {description}
                  </p>
                )}
              </div>

            </div>

            {/* ACTIONS */}
            <div className="flex flex-col sm:flex-row gap-2 mt-6">

              <Button
                variant="ghost"
                onClick={onCancel}
                className="w-full sm:w-auto"
              >
                {cancelLabel}
              </Button>

              <Button
                variant={tone === "danger" ? "danger" : "primary"}
                onClick={onConfirm}
                className="w-full sm:w-auto"
              >
                {confirmLabel}
              </Button>

            </div>

          </motion.div>

        </div>
      )}
    </AnimatePresence>
  )
}
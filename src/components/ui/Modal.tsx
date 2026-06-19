import { X } from "lucide-react"
import { clsx } from "clsx"

import OverlayShell from "./OverlayShell"

interface ModalProps {
  open: boolean
  title?: string
  children: React.ReactNode
  onClose: () => void
  size?: "sm" | "md" | "lg"
}

export default function Modal({
  open,
  title,
  children,
  onClose,
  size = "md",
}: ModalProps) {
  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
  }

  return (
    <OverlayShell
      open={open}
      variant="modal"
      onClose={onClose}
      zIndex={100}
      panelClassName={clsx(
        "w-full overflow-hidden flex flex-col",
        "rounded-[2.5rem] bg-white dark:bg-slate-900",
        "shadow-[0_32px_80px_-20px_rgba(0,0,0,0.3)]",
        "border border-white/20 dark:border-slate-700/40",
        "ring-1 ring-black/5 dark:ring-white/10",
        sizes[size],
      )}
    >
      {title && (
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-pink-50/50 to-transparent dark:from-primary/10">
          <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 italic tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="group flex items-center justify-center rounded-2xl h-10 w-10 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 transition-all hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-500 dark:hover:text-rose-300 hover:rotate-90"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {!title && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex items-center justify-center rounded-full h-9 w-9 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-500 dark:hover:text-rose-300 transition-all"
          aria-label="Cerrar"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      )}

      <div className="px-8 py-8 overflow-y-auto max-h-[75vh] custom-scrollbar text-slate-700 dark:text-slate-200">
        <div className="space-y-6">{children}</div>
      </div>

      <div className="h-2 bg-gradient-to-r from-transparent via-primary/5 to-transparent opacity-50" />
    </OverlayShell>
  )
}
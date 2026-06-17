import { toast, type Toast } from "react-hot-toast"
import { CheckCircle2 } from "lucide-react"

interface Options {
  message: string
  actionLabel: string
  onAction: () => void
  duration?: number
  icon?: React.ReactNode
}

export function toastWithAction({
  message,
  actionLabel,
  onAction,
  duration = 5000,
  icon,
}: Options) {
  return toast.custom(
    (t: Toast) => (
      <div
        className={`flex items-center gap-2 max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg rounded-2xl px-3 py-2 transition-all ${
          t.visible ? "animate-enter" : "animate-leave opacity-0"
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          {icon ?? <CheckCircle2 size={14} />}
        </div>
        <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 flex-1 leading-tight">
          {message}
        </p>
        <button
          type="button"
          onClick={() => {
            onAction()
            toast.dismiss(t.id)
          }}
          className="h-8 px-3 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-widest shrink-0"
        >
          {actionLabel}
        </button>
      </div>
    ),
    { duration }
  )
}

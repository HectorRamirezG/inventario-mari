import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"
import { toast, Toaster as SonnerToaster } from "sonner"
import { cn } from "../../lib/utils"

// 1. Configurador Global (Pon esto en tu App.tsx una sola vez)
export function GlobalToaster() {
  return (
    <SonnerToaster
      position="bottom-center" // Perfecto para pulgar en móvil
      toastOptions={{
        className: "rounded-[2rem] border-none shadow-premium backdrop-blur-xl",
      }}
    />
  )
}

// 2. El Componente Estilizado (Uso: notify.success("Titulo", "Desc"))
export const notify = {
  success: (title: string, description?: string) => 
    toast.custom((t) => (
      <div className="flex items-center gap-4 bg-emerald-50/90 border border-emerald-100 p-5 rounded-[2rem] w-full max-w-sm shadow-bloom">
        <div className="bg-emerald-500 text-white p-2 rounded-2xl shadow-lg shadow-emerald-200">
          <CheckCircle2 size={20} strokeWidth={3} />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-black text-emerald-900 leading-none">{title}</p>
          {description && <p className="text-[11px] font-bold text-emerald-700/70 mt-1">{description}</p>}
        </div>
        <button onClick={() => toast.dismiss(t)} className="text-emerald-300 hover:text-emerald-500">
          <X size={18} />
        </button>
      </div>
    )),

  error: (title: string, description?: string) => 
    toast.custom((t) => (
      <div className="flex items-center gap-4 bg-rose-50/90 border border-rose-100 p-5 rounded-[2rem] w-full max-w-sm shadow-lg">
        <div className="bg-rose-500 text-white p-2 rounded-2xl shadow-lg shadow-rose-200">
          <AlertCircle size={20} strokeWidth={3} />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-black text-rose-900 leading-none">{title}</p>
          {description && <p className="text-[11px] font-bold text-rose-700/70 mt-1">{description}</p>}
        </div>
        <button onClick={() => toast.dismiss(t)} className="text-rose-300 hover:text-rose-500">
          <X size={18} />
        </button>
      </div>
    )),

  info: (title: string, description?: string) => 
    toast.custom((t) => (
      <div className="flex items-center gap-4 bg-white/80 border border-pink-100 p-5 rounded-[2rem] w-full max-w-sm shadow-premium backdrop-blur-md">
        <div className="bg-primary text-white p-2 rounded-2xl shadow-bloom">
          <Info size={20} strokeWidth={3} />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-black text-slate-800 leading-none">{title}</p>
          {description && <p className="text-[11px] font-bold text-slate-400 mt-1">{description}</p>}
        </div>
        <button onClick={() => toast.dismiss(t)} className="text-slate-300 hover:text-primary">
          <X size={18} />
        </button>
      </div>
    ))
}
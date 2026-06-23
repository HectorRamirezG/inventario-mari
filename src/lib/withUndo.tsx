import { toast, type Toast } from "react-hot-toast"
import { Undo2 } from "lucide-react"

interface Options {
  /** Texto principal del toast (ej: "Pedido cancelado"). */
  message: string
  /** Función real que se ejecuta cuando expira el undo. Si lanza, se notifica con un toast.error. */
  commit: () => Promise<void> | void
  /** Hook para pintar la UI optimista (ej: ocultar la card). Se llama YA, antes del delay. */
  optimisticUI?: () => void
  /** Hook para revertir la UI si el user dio undo. */
  revertUI?: () => void
  /** Ms que el user tiene para presionar Deshacer. Default 5000. */
  delayMs?: number
  /** Texto del botón. Default "Deshacer". */
  undoLabel?: string
}

/**
 * Ejecuta una acción destructiva con ventana de undo estilo Gmail.
 *   1. Llama optimisticUI() para que la pantalla refleje el cambio inmediato.
 *   2. Muestra toast con botón "Deshacer".
 *   3. Si el user lo presiona ANTES del delay, llama revertUI() y nunca
 *      llega a commit().
 *   4. Si pasa el delay, llama commit() de verdad.
 *
 * Pensado para acciones que no son fácilmente reversibles en BD (cancel
 * de venta libera stock, etc): preferimos diferir el commit que armar
 * una RPC inversa que pueda no funcionar.
 */
export function runWithUndo({
  message,
  commit,
  optimisticUI,
  revertUI,
  delayMs = 5000,
  undoLabel = "Deshacer",
}: Options) {
  // Pintamos el cambio ya — el user ve que "pasó".
  try {
    optimisticUI?.()
  } catch {
    /* sin red, sin pánico */
  }

  let undone = false
  // El timeout es el que dispara el commit real al expirar el undo.
  const timer = setTimeout(async () => {
    if (undone) return
    toast.dismiss(toastId)
    try {
      await commit()
    } catch (e: any) {
      // Si el commit falla, intentamos revertir la UI y avisamos.
      try {
        revertUI?.()
      } catch {
        /* sin red, sin pánico */
      }
      toast.error(e?.message ?? "No se pudo completar la acción")
    }
  }, delayMs)

  const toastId = toast.custom(
    (t: Toast) => (
      <div
        className={`flex items-center gap-2 max-w-sm bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 shadow-lg rounded-2xl px-3 py-2 transition-all ${
          t.visible ? "animate-enter" : "animate-leave opacity-0"
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-200 flex items-center justify-center shrink-0">
          <Undo2 size={14} />
        </div>
        <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 flex-1 leading-tight">
          {message}
        </p>
        <button
          type="button"
          onClick={() => {
            undone = true
            clearTimeout(timer)
            try {
              revertUI?.()
            } catch {
              /* sin red, sin pánico */
            }
            toast.dismiss(t.id)
          }}
          className="h-8 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest shrink-0"
        >
          {undoLabel}
        </button>
      </div>
    ),
    { duration: delayMs + 500 },
  )
}

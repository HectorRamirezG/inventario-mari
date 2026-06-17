/**
 * Wrapper centralizado sobre react-hot-toast.
 *
 * 1. `toastAsync(fn, msgs)` — patrón loading→success/error con traducción
 *    automática de errores de Supabase. Reemplaza el copy-paste de:
 *
 *      const tid = toast.loading("Guardando...")
 *      try { await fn(); toast.success("OK", { id: tid }) }
 *      catch (e) { toast.error(translateError(e), { id: tid }) }
 *
 * 2. `toastUndo(message, onUndo, opts?)` — toast con botón "Deshacer" 5s.
 *    Estilo Gmail: la acción se considera definitiva si pasa el timeout
 *    o el usuario cierra el toast. Si presiona "Deshacer", llama `onUndo`.
 *
 * 3. `toastSuccess`, `toastError`, `toastInfo` — wrappers tipados para
 *    estilos consistentes (sin tener que importar react-hot-toast en
 *    cada archivo).
 */

import baseToast from "react-hot-toast"
import { translateError } from "./supabaseErrors"

interface AsyncMessages {
  loading: string
  success: string | ((result: unknown) => string)
  /** Fallback si translateError no encuentra match. Default: "Ocurrió un error". */
  error?: string
}

/**
 * Envuelve una promesa con toast.loading → success/error, traduciendo
 * errores de Supabase a español amigable.
 *
 *   await toastAsync(
 *     () => saveProduct(p),
 *     { loading: "Guardando producto...", success: "Producto guardado", error: "No se pudo guardar" }
 *   )
 *
 * Regresa el resultado de la promesa o `null` si falló.
 */
export async function toastAsync<T>(
  fn: () => Promise<T>,
  msgs: AsyncMessages,
): Promise<T | null> {
  const tid = baseToast.loading(msgs.loading)
  try {
    const result = await fn()
    const okMsg = typeof msgs.success === "function" ? msgs.success(result) : msgs.success
    baseToast.success(okMsg, { id: tid })
    return result
  } catch (e) {
    baseToast.error(translateError(e, msgs.error), { id: tid })
    return null
  }
}

interface UndoOptions {
  /** Milisegundos antes de que la acción sea definitiva. Default 5000. */
  duration?: number
  /** Texto del botón. Default "Deshacer". */
  actionLabel?: string
  /** ID custom (útil si quieres reemplazar un toast previo). */
  id?: string
}

/**
 * Toast con botón "Deshacer" estilo Gmail.
 *
 *   toastUndo("Producto eliminado", async () => {
 *     await restoreProduct(id)
 *   })
 *
 * Pasa `duration` para cambiar la ventana (default 5s). Si el usuario no
 * presiona el botón antes del timeout, la acción queda firme y el toast
 * desaparece silenciosamente.
 */
export function toastUndo(
  message: string,
  onUndo: () => void | Promise<void>,
  opts: UndoOptions = {},
): string {
  const { duration = 5000, actionLabel = "Deshacer", id } = opts
  let undone = false

  const tid = baseToast.custom(
    (t) => (
      <div
        className={`flex items-center gap-3 pl-4 pr-1.5 h-12 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.45)] border border-slate-700/40 dark:border-slate-300/40 ${
          t.visible ? "animate-[fade-in-up_0.2s_ease-out]" : "opacity-0"
        }`}
        role="alert"
      >
        <span className="text-[12px] font-bold whitespace-nowrap">{message}</span>
        <button
          type="button"
          onClick={async () => {
            if (undone) return
            undone = true
            baseToast.dismiss(t.id)
            try {
              await onUndo()
            } catch (e) {
              baseToast.error(translateError(e, "No se pudo deshacer"))
            }
          }}
          className="ml-1 h-9 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition"
        >
          {actionLabel}
        </button>
      </div>
    ),
    { id, duration, position: "bottom-center" },
  )

  return tid
}

/* ─────────────────────────────────────────────
 * Wrappers tipados con estilos consistentes
 * ───────────────────────────────────────────── */

export const toastSuccess = (msg: string, id?: string) =>
  baseToast.success(msg, { id })

export const toastError = (err: unknown, fallback?: string, id?: string) =>
  baseToast.error(translateError(err, fallback), { id })

export const toastInfo = (msg: string, id?: string) =>
  baseToast(msg, { id, icon: "ℹ️" })

/** Re-export del default para casos avanzados. */
export { baseToast as toast }

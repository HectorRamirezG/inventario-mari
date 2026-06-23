import { useEffect, useRef, useState } from "react"
import { Minus, Plus } from "lucide-react"
import toast from "react-hot-toast"

import { applyMovement } from "../../features/movements/movementService"

interface Props {
  variantId: string
  /** Stock actual desde el servidor; cambia disparan re-sync optimista. */
  stock: number
  /** Notifica al padre cuando el stock final cambió (post-debounce). */
  onCommitted?: (newStock: number) => void
  /** Cota inferior. Default 0 — no permite stock negativo. */
  min?: number
  /** Ms a esperar sin toques antes de commitear a Supabase. Default 1200. */
  debounceMs?: number
  /** Tema: success (verde) para entradas predominantes, neutral. */
  tone?: "success" | "neutral"
}

/**
 * Stepper compacto [-] [N] [+] para ajustar stock sin abrir modal.
 * Cada toque actualiza el número visible YA. El movimiento real a la BD
 * se aplica cuando el usuario deja de tocar durante `debounceMs`. Si
 * llega delta positivo registra "entrada"; si negativo registra "venta"
 * (que la RPC traduce a "salida"). Si delta=0 no hace nada.
 *
 * Silencioso por diseño: no muestra toast en éxito ni loading. Solo
 * toast.error si la BD rechaza.
 */
export default function InlineStockStepper({
  variantId,
  stock,
  onCommitted,
  min = 0,
  debounceMs = 1200,
  tone = "success",
}: Props) {
  const [optimistic, setOptimistic] = useState(stock)
  const baselineRef = useRef(stock)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    // El padre puede traer un nuevo stock desde Realtime; resync solo si
    // no hay un cambio pendiente que aún no se commitea.
    if (timerRef.current === null) {
      setOptimistic(stock)
      baselineRef.current = stock
    }
  }, [stock])

  useEffect(() => {
    return () => {
      aliveRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function scheduleCommit() {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const delta = optimistic - baselineRef.current
      timerRef.current = null
      if (delta === 0) return
      try {
        await applyMovement({
          variantId,
          type: delta > 0 ? "entrada" : "venta",
          quantity: Math.abs(delta),
        })
        if (!aliveRef.current) return
        baselineRef.current = optimistic
        onCommitted?.(optimistic)
      } catch (e: any) {
        // Revertimos al último stock confirmado por el servidor.
        if (!aliveRef.current) return
        setOptimistic(baselineRef.current)
        toast.error(e?.message ?? "No se pudo guardar el cambio")
      }
    }, debounceMs)
  }

  function bump(by: number) {
    setOptimistic((prev) => {
      const next = Math.max(min, prev + by)
      if (next === prev) return prev
      scheduleCommit()
      return next
    })
  }

  const pending = optimistic !== baselineRef.current
  const numTone =
    optimistic === 0
      ? "text-rose-500 dark:text-rose-300"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-slate-800 dark:text-slate-100"

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-xl border px-1 py-0.5 transition-colors ${
        pending
          ? "border-primary/40 bg-primary/5"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      }`}
    >
      <button
        type="button"
        onClick={() => bump(-1)}
        disabled={optimistic <= min}
        aria-label="Quitar 1"
        className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 active:scale-90 press"
      >
        <Minus size={12} />
      </button>
      <span
        className={`min-w-8 text-center text-sm font-black tabular-nums ${numTone}`}
        aria-live="polite"
      >
        {optimistic}
      </span>
      <button
        type="button"
        onClick={() => bump(1)}
        aria-label="Agregar 1"
        className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500 text-white active:scale-90 press shadow-sm"
      >
        <Plus size={12} />
      </button>
    </div>
  )
}

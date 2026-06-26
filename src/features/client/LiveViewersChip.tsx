import { useEffect, useState } from "react"
import Users from "lucide-react/dist/esm/icons/users"

import { supabase } from "../../lib/supabase"

/**
 * "X personas vieron esto en la última hora" — honesto, calculado en
 * vivo desde `site_visitors.pages_viewed` (jsonb array que ya guardamos
 * con `trackProductView`).
 *
 * Lógica:
 *   - Trae visitors con last_seen_at >= NOW() - 1h.
 *   - Para cada uno, revisa si pages_viewed incluye `/p/{productId}`.
 *   - Cuenta visitors únicos (no page views).
 *   - Si count >= minToShow → muestra chip; si menos, esconde (evita
 *     decir "1 persona vio esto" que se siente vacío y a veces es el
 *     mismo cliente refrescando).
 *
 * Cache: 60 segundos en memoria, key = `${productId}:${windowMin}`.
 */

interface CacheEntry {
  count: number
  loadedAt: number
}
const cache = new Map<string, CacheEntry>()
const TTL_MS = 60_000

interface RowSnapshot {
  pages_viewed: any
  last_seen_at: string | null
}

export async function countRecentViewers(
  productId: string,
  windowMinutes = 60,
): Promise<number> {
  const cacheKey = `${productId}:${windowMinutes}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.count

  const sinceIso = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  // Limit defensivo: si la tienda es enorme, queremos paginar más adelante.
  const { data, error } = await supabase
    .from("site_visitors")
    .select("pages_viewed, last_seen_at")
    .gte("last_seen_at", sinceIso)
    .limit(500)
  if (error || !Array.isArray(data)) {
    cache.set(cacheKey, { count: 0, loadedAt: Date.now() })
    return 0
  }
  const needle = `/p/${productId}`
  let count = 0
  for (const v of data as RowSnapshot[]) {
    const arr = Array.isArray(v.pages_viewed) ? v.pages_viewed : []
    const lastSeen = v.last_seen_at ? new Date(v.last_seen_at) : null
    const sinceDate = new Date(sinceIso)
    const hit = arr.some((p: any) => {
      const path = typeof p === "object" ? p?.path : p
      const at = typeof p === "object" && p?.at ? new Date(p.at) : lastSeen
      if (!path || typeof path !== "string") return false
      if (!path.startsWith(needle)) return false
      // Solo contar si la página fue vista en la ventana
      return at != null && at >= sinceDate
    })
    if (hit) count++
  }
  cache.set(cacheKey, { count, loadedAt: Date.now() })
  return count
}

/* ─────────── Hook + Component ─────────── */

interface Props {
  productId: string
  /** Ventana en minutos (default 60 = "última hora") */
  windowMinutes?: number
  /** Mínimo para empezar a mostrar (default 3 — evita social proof falso) */
  minToShow?: number
  /** Estilo: "chip" (compacto) o "line" (texto suelto) */
  variant?: "chip" | "line"
}

export default function LiveViewersChip({
  productId,
  windowMinutes = 60,
  minToShow = 3,
  variant = "chip",
}: Props) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    countRecentViewers(productId, windowMinutes)
      .then((c) => {
        if (!cancelled) setCount(c)
      })
      .catch(() => {
        if (!cancelled) setCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [productId, windowMinutes])

  if (count == null || count < minToShow) return null

  const windowLabel =
    windowMinutes === 60 ? "última hora" : `últimos ${windowMinutes} min`

  if (variant === "line") {
    return (
      <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <Users size={11} className="text-emerald-600 dark:text-emerald-300" />
        <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {count}
        </span>{" "}
        personas vieron esto en la {windowLabel}
      </p>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase tracking-widest">
      <Users size={10} /> {count} viendo · {windowLabel}
    </span>
  )
}

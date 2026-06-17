import { useEffect, useState } from "react"

/**
 * Devuelve un valor que sólo se actualiza después de `delay` ms desde
 * el último cambio. Útil para búsquedas donde no quieres disparar el
 * filtro en cada tecla.
 *
 *   const q = useDebouncedValue(searchInput, 200)
 *   const filtered = useMemo(() => fuse.search(q), [q])
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    if (delay <= 0) {
      setDebounced(value)
      return
    }
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}

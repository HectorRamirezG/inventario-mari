import { useEffect, useState } from "react"

/**
 * useState que persiste su valor en localStorage. Compatible con cualquier
 * tipo JSON-serializable. Si la lectura inicial falla (clave nueva o JSON
 * corrupto), regresa `initial`.
 *
 *   const [tab, setTab] = useLocalStorageState<"open"|"all">("support:tab", "open")
 *
 * Útil para filtros de página, orden seleccionado, pestaña activa, etc.
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) return initial
      return JSON.parse(raw) as T
    } catch {
      return initial
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }, [key, value])

  return [value, setValue]
}

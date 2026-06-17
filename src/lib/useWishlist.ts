import { useCallback, useEffect, useState } from "react"
import { APP_CONSTANTS } from "./constants"

const KEY = APP_CONSTANTS.WISHLIST_KEY

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
    window.dispatchEvent(new CustomEvent("mari:wishlist-change"))
  } catch {
    /* noop */
  }
}

export function useWishlist() {
  const [ids, setIds] = useState<string[]>(() => read())

  useEffect(() => {
    const handler = () => setIds(read())
    window.addEventListener("mari:wishlist-change", handler)
    window.addEventListener("storage", handler)
    return () => {
      window.removeEventListener("mari:wishlist-change", handler)
      window.removeEventListener("storage", handler)
    }
  }, [])

  const has = useCallback((id: string) => ids.includes(id), [ids])

  const toggle = useCallback(
    (id: string) => {
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
      write(next)
      setIds(next)
    },
    [ids]
  )

  const clear = useCallback(() => {
    write([])
    setIds([])
  }, [])

  return { ids, count: ids.length, has, toggle, clear }
}

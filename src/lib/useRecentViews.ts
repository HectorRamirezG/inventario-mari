/**
 * Mantiene el historial de productos que el cliente ha abierto en su
 * sesión. Persiste en localStorage para no atosigar la BD ni hacer
 * tracking server-side. Máximo 8 productos, FIFO.
 *
 * Útil para pintar una fila "Visto recientemente" en la tienda y darle
 * al cliente un atajo para volver al producto que estaba mirando.
 */

import { useEffect, useState } from "react"

export interface RecentViewItem {
  id: string
  name: string
  image: string | null
  price: number
  viewedAt: number // timestamp ms
}

const KEY = "mari:recent-views:v1"
const MAX_ITEMS = 8

function read(): RecentViewItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentViewItem[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x) => x && typeof x.id === "string" && typeof x.name === "string",
    )
  } catch {
    return []
  }
}

function write(items: RecentViewItem[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
    window.dispatchEvent(new CustomEvent("mari:recent-views-change"))
  } catch {}
}

/**
 * Marca un producto como visto. Si ya estaba en la lista lo mueve al
 * frente. Si no, lo agrega y recorta a MAX_ITEMS.
 */
export function trackProductView(item: Omit<RecentViewItem, "viewedAt">): void {
  const items = read().filter((x) => x.id !== item.id)
  items.unshift({ ...item, viewedAt: Date.now() })
  write(items.slice(0, MAX_ITEMS))
}

/** Hook reactivo: re-renderiza cuando cambia el historial. */
export function useRecentViews(): RecentViewItem[] {
  const [items, setItems] = useState<RecentViewItem[]>(() => read())

  useEffect(() => {
    const handler = () => setItems(read())
    window.addEventListener("mari:recent-views-change", handler)
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) handler()
    })
    return () => {
      window.removeEventListener("mari:recent-views-change", handler)
    }
  }, [])

  return items
}

export function clearRecentViews(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(KEY)
    window.dispatchEvent(new CustomEvent("mari:recent-views-change"))
  } catch {}
}

import { useCallback, useEffect, useState } from "react"
import { APP_CONSTANTS } from "./constants"

export interface PersistedCartLine {
  variant_id: string
  product_id: string
  product_name: string
  variant_name: string
  image_url: string | null
  unit_price: number
  qty: number
  stock: number
  /** Costo unitario congelado al agregar. Permite calcular profit en
   *  el checkout aún cuando el carrito se hidrata desde localStorage. */
  cost?: number
  /** Marca esta línea como compra de preventa (stock=0 al apartar).
   *  Si está true, el precio NO se reprice por tier; ya viene con el
   *  descuento preventa aplicado. */
  is_preorder?: boolean
}

interface CartSnapshot {
  lines: PersistedCartLine[]
  savedAt: number
}

const KEY = APP_CONSTANTS.CART_PERSIST_KEY
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function read(): CartSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.lines)) return null
    const savedAt = Number(parsed.savedAt) || 0
    if (Date.now() - savedAt > MAX_AGE_MS) return null
    return { lines: parsed.lines as PersistedCartLine[], savedAt }
  } catch {
    return null
  }
}

function write(lines: PersistedCartLine[]) {
  try {
    if (lines.length === 0) {
      localStorage.removeItem(KEY)
      return
    }
    localStorage.setItem(KEY, JSON.stringify({ lines, savedAt: Date.now() }))
  } catch {
    /* noop */
  }
}

export function loadPersistedCart(): CartSnapshot | null {
  return read()
}

export function clearPersistedCart() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}

export function useCartPersist(lines: PersistedCartLine[]) {
  useEffect(() => {
    write(lines)
  }, [lines])
}

export function useAbandonedCartBanner(opts: { onResume: (lines: PersistedCartLine[]) => void }) {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null)

  useEffect(() => {
    setSnapshot(read())
  }, [])

  const dismiss = useCallback(() => {
    clearPersistedCart()
    setSnapshot(null)
  }, [])

  const resume = useCallback(() => {
    if (!snapshot) return
    opts.onResume(snapshot.lines)
    setSnapshot(null)
  }, [opts, snapshot])

  return { snapshot, dismiss, resume }
}

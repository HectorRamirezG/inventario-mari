import { useEffect, useState } from "react"
import {
  loadPersistedCart,
  type PersistedCartLine,
} from "./useCartPersist"
import { APP_CONSTANTS } from "./constants"

/**
 * Resumen del carrito persistido en localStorage.
 *
 * - `count` = total de piezas (suma de qty)
 * - `total` = suma qty * unit_price
 * - `lineCount` = cuántas líneas distintas hay
 * - `isEmpty` = atajo
 *
 * Reacciona a:
 *   - `storage` event (cambios desde otra pestaña / ventana)
 *   - `mari:cart-changed` (custom event que dispara el componente que
 *      escribió el cart en localStorage, porque el evento `storage` NO
 *      se dispara en la misma pestaña que escribió)
 *
 * Diseñado para que el header del ShopShell muestre badge + total
 * actualizados al instante sin tener que conocer el estado interno
 * de ClientShopPage.
 */
export interface CartSummary {
  count: number
  total: number
  lineCount: number
  isEmpty: boolean
  lines: PersistedCartLine[]
}

function compute(lines: PersistedCartLine[]): CartSummary {
  const count = lines.reduce((acc, l) => acc + (Number(l.qty) || 0), 0)
  const total = lines.reduce(
    (acc, l) => acc + (Number(l.qty) || 0) * (Number(l.unit_price) || 0),
    0,
  )
  return {
    count,
    total,
    lineCount: lines.length,
    isEmpty: lines.length === 0,
    lines,
  }
}

function readSummary(): CartSummary {
  const snap = loadPersistedCart()
  return compute(snap?.lines ?? [])
}

const STORAGE_KEY = APP_CONSTANTS.CART_PERSIST_KEY
export const CART_CHANGED_EVENT = "mari:cart-changed"
export const CART_OPEN_EVENT = "mari:open-cart"

export function useCartSummary(): CartSummary {
  const [summary, setSummary] = useState<CartSummary>(() => readSummary())

  useEffect(() => {
    const refresh = () => setSummary(readSummary())

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) refresh()
    }
    const onCustom = () => refresh()

    window.addEventListener("storage", onStorage)
    window.addEventListener(CART_CHANGED_EVENT, onCustom)
    // Re-leer al volver a la pestaña (por si el storage cambió mientras
    // estaba en background)
    window.addEventListener("focus", onCustom)

    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(CART_CHANGED_EVENT, onCustom)
      window.removeEventListener("focus", onCustom)
    }
  }, [])

  return summary
}

/** Helper para que cualquier componente notifique cambios en el carrito. */
export function notifyCartChanged() {
  try {
    window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT))
  } catch {
    /* noop */
  }
}

/** Helper para que el header pida abrir el cart drawer. */
export function requestOpenCart() {
  try {
    window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT))
  } catch {
    /* noop */
  }
}

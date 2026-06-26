import { useCallback, useEffect, useState } from "react"

/**
 * Información de la tienda — sale en tickets, recibos y como header.
 * Se guarda en localStorage; cada dispositivo puede tener su config
 * (útil si tienes varias cajas).
 */
export interface StoreInfo {
  name: string
  tagline: string
  phone: string
  address: string
  thanks_message: string
  footer_note: string
  /** Mini-bio personal de Mari — aparece en el footer del BuySheet
   *  para humanizar el carrito ("soy Mari, llevo 4 años..."). Vacío = no se muestra. */
  owner_bio: string
}

const DEFAULT: StoreInfo = {
  name: "Beauty's Me",
  tagline: "Tu tienda de confianza",
  phone: "",
  address: "",
  thanks_message: "¡Gracias por tu compra!",
  footer_note: "Conserva este ticket para cualquier aclaración.",
  owner_bio: "",
}

const KEY = "mari-store-info"

function load(): StoreInfo {
  if (typeof window === "undefined") return DEFAULT
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    return { ...DEFAULT, ...JSON.parse(raw) }
  } catch {
    return DEFAULT
  }
}

export function useStoreInfo() {
  const [info, setInfo] = useState<StoreInfo>(() => load())

  // Sync entre pestañas
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === KEY) setInfo(load())
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  const update = useCallback((patch: Partial<StoreInfo>) => {
    setInfo((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* localStorage lleno o privado: ignoramos */
      }
      return next
    })
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(KEY)
    setInfo(DEFAULT)
  }, [])

  return { info, update, reset }
}

/** Lectura sincrónica (para componentes que sólo necesitan leer una vez). */
export const getStoreInfo = load

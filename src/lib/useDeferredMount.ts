import { useEffect, useState } from "react"

import { OVERLAY_DEFER_MS } from "./overlayMotion"

// Devuelve `true` solo después de `delay` ms desde que el overlay se abre.
// Sirve para renderizar Q&A, charts y otros bloques pesados después de
// que la animación de entrada del panel haya terminado.
export function useDeferredMount(open: boolean, delay = OVERLAY_DEFER_MS) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!open) {
      setMounted(false)
      return
    }
    const id = window.setTimeout(() => setMounted(true), delay)
    return () => window.clearTimeout(id)
  }, [open, delay])

  return mounted
}

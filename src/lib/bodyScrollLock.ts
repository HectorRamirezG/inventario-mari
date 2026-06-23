import { useEffect } from "react"

// Contador global. Cuando >= 1 overlay activo, el body se mantiene
// `overflow: hidden`. Al volver a 0, se restaura el valor original
// que tenía antes del PRIMER lock. Esto evita el bug clásico de
// múltiples overlays leyendo "hidden" como "original" y quedando
// pegado para siempre cuando se cierran en orden invertido.

let lockCount = 0
let savedOverflow: string | null = null

function applyLock() {
  if (typeof document === "undefined") return
  document.body.style.overflow = "hidden"
}

function applyRestore() {
  if (typeof document === "undefined") return
  // Si nunca guardamos un valor (catastrophe insurance), limpiamos.
  document.body.style.overflow = savedOverflow ?? ""
  savedOverflow = null
}

/** Lockea el scroll del body. Devuelve la función para liberar. */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {}
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    applyLock()
  }
  lockCount++
  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) applyRestore()
  }
}

/**
 * Hook que activa el lock mientras `active` sea true. Cleanup automático
 * al desmontarse el componente o cuando `active` pase a false. Pensado
 * como reemplazo directo del patrón manual:
 *
 *   useEffect(() => {
 *     if (!open) return
 *     const o = document.body.style.overflow
 *     document.body.style.overflow = "hidden"
 *     return () => { document.body.style.overflow = o }
 *   }, [open])
 *
 * que es vulnerable a races cuando dos overlays se solapan.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const release = lockBodyScroll()
    return release
  }, [active])
}

/**
 * Catastrophe insurance: si por algún bug el body queda bloqueado sin
 * locks activos (ej: hot reload, error boundary que desmonta sin cleanup),
 * fuerza la restauración. NO restaura `savedOverflow` — solo limpia.
 */
export function forceUnlockBodyScroll(): void {
  if (typeof document === "undefined") return
  lockCount = 0
  savedOverflow = null
  document.body.style.overflow = ""
}

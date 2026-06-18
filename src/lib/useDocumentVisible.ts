import { useEffect, useState } from "react"

/**
 * Hook minimalista que devuelve true cuando la pestaña está visible
 * (foco del navegador) y false cuando está oculta (otro tab, app en
 * background, pantalla bloqueada).
 *
 * Lo usamos para pausar trabajo en background:
 *  - No mostrar toasts de realtime mientras el tab está oculto (los
 *    eventos llegan igual, pero no interrumpen)
 *  - No hacer polling de checkpoints
 *  - No refrescar imágenes/queries hasta que el usuario regrese
 *
 * Implementado con la `Page Visibility API`, soportado en todos los
 * navegadores modernos.
 */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  )

  useEffect(() => {
    if (typeof document === "undefined") return
    const handler = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }, [])

  return visible
}

/**
 * Versión sin React: util para servicios. Devuelve true si el tab está
 * visible al momento de la llamada.
 */
export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true
  return !document.hidden
}

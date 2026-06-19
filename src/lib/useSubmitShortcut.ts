import { useEffect } from "react"

/**
 * Atajo Ctrl/Cmd + Enter para disparar `onSubmit` desde cualquier
 * formulario o modal. Solo se activa cuando el componente está montado
 * (`enabled` true).
 *
 * Importante: no se activa si el evento ocurre dentro de un <textarea>
 * con el solo Enter (deja al usuario meter saltos de línea normales).
 */
export function useSubmitShortcut(onSubmit: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const isCmdEnter = (e.metaKey || e.ctrlKey) && e.key === "Enter"
      if (!isCmdEnter) return
      e.preventDefault()
      onSubmit()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onSubmit, enabled])
}

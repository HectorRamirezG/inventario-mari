import { toastInfo, toastError } from "./toast"

/**
 * Copia texto al portapapeles con toast de confirmación.
 * Fallback a `document.execCommand("copy")` para navegadores antiguos.
 *
 * Uso:
 *   await copyToClipboard("abc-123", "Folio copiado")
 */
export async function copyToClipboard(
  text: string,
  successMessage = "Copiado al portapapeles",
): Promise<boolean> {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      toastInfo(successMessage)
      // Haptic feedback opcional
      if ("vibrate" in navigator) {
        try { navigator.vibrate(10) } catch {}
      }
      return true
    }
    // Fallback
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    if (ok) {
      toastInfo(successMessage)
      return true
    }
    throw new Error("execCommand copy failed")
  } catch (e) {
    toastError(e, "No se pudo copiar")
    return false
  }
}

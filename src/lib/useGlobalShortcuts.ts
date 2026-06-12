import { useEffect } from "react"

/**
 * Atajos de teclado globales.
 * - 1..5 → cambia de pestaña
 * - g d/i/v/a/p → "go to ___" (estilo Vim)
 *
 * Ignora atajos cuando hay un input/textarea con foco para no romper escritura.
 */
const TAB_BY_NUMBER: Record<string, string> = {
  "1": "dashboard",
  "2": "inventario",
  "3": "ventas",
  "4": "apartados",
  "5": "precios",
}

const TAB_BY_LETTER: Record<string, string> = {
  d: "dashboard",
  i: "inventario",
  v: "ventas",
  a: "apartados",
  p: "precios",
}

export function useGlobalShortcuts() {
  useEffect(() => {
    let waitingForG = false
    let waitingTimer: ReturnType<typeof setTimeout> | null = null

    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      )
    }

    const navigate = (tab: string) => {
      window.dispatchEvent(new CustomEvent("app:navigate", { detail: { tab } }))
    }

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditable(e.target)) return

      const k = e.key.toLowerCase()

      // Esc cancela el modo "g"
      if (k === "escape") {
        waitingForG = false
        if (waitingTimer) clearTimeout(waitingTimer)
        return
      }

      if (waitingForG) {
        const tab = TAB_BY_LETTER[k]
        waitingForG = false
        if (waitingTimer) clearTimeout(waitingTimer)
        if (tab) {
          e.preventDefault()
          navigate(tab)
        }
        return
      }

      if (k === "g") {
        waitingForG = true
        waitingTimer = setTimeout(() => {
          waitingForG = false
        }, 1200)
        return
      }

      const tab = TAB_BY_NUMBER[k]
      if (tab) {
        e.preventDefault()
        navigate(tab)
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
      if (waitingTimer) clearTimeout(waitingTimer)
    }
  }, [])
}

import { useEffect } from "react"

/**
 * Atajos de teclado globales.
 * - 1..7 → cambia de pestaña principal
 * - g d/i/v/a/p/s/c/r → "go to ___" (estilo Vim)
 *
 * Ignora atajos cuando hay un input/textarea con foco para no romper escritura.
 */
const TAB_BY_NUMBER: Record<string, string> = {
  "1": "ventas",      // Caja
  "2": "apartados",   // Pendientes
  "3": "inventario",  // Catálogo
  "4": "ciclos",      // Ciclos
  "5": "soporte",     // Incidencias
  "6": "reglas",      // Políticas
  "7": "precios",     // Calculadora
}

const TAB_BY_LETTER: Record<string, string> = {
  d: "dashboard",
  i: "inventario",
  v: "ventas",
  a: "apartados",
  p: "precios",
  s: "soporte",
  c: "ciclos",
  r: "reglas",
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

      // Shift+N → Nueva venta directo (sin pasar por ActionHub)
      // Conviven: `n` solo = abre hub (App.tsx line ~517). Shift+N = atajo directo.
      if (e.shiftKey && k === "n") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("app:navigate", { detail: { tab: "ventas" } }))
        return
      }

      if (e.shiftKey) return

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

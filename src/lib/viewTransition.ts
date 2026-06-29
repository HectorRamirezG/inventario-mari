/**
 * Wrapper de la View Transitions API nativa del browser.
 *
 * Permite que cambios de DOM (cambios de ruta, toggle de modo oscuro,
 * etc.) animen con un fade/morph automático SIN configurar nada extra.
 * El browser captura snapshots del DOM antes y después del cambio y
 * los anima con la transición default (fade).
 *
 * Soporte:
 *  - Chrome 111+ ✅
 *  - Edge 111+ ✅
 *  - Safari 18+ ✅
 *  - Firefox 🟡 (detrás de bandera; degrada bien — el cambio sucede sin
 *    transición pero sin romper).
 *
 * Uso típico desde un componente React:
 *
 *   import { useTransitionNavigate } from "../lib/viewTransition"
 *   const navigate = useTransitionNavigate()
 *   navigate("/mis-pedidos")  // transición suave en browsers que soporten
 *
 * Para cambios que NO usan react-router (ej. toggle de tema), usar
 * `startViewTransition(() => { ... })` directamente.
 */

import { useCallback } from "react"
import { flushSync } from "react-dom"
import { useNavigate, type NavigateOptions, type To } from "react-router-dom"

interface DocumentWithVT extends Document {
  startViewTransition?: (cb: () => void | Promise<void>) => {
    finished: Promise<void>
    ready: Promise<void>
    updateCallbackDone: Promise<void>
    skipTransition: () => void
  }
}

/**
 * Ejecuta una mutación del DOM dentro de una View Transition si el
 * browser la soporta. Si no, simplemente ejecuta el callback.
 *
 * Internamente usa `flushSync` para que React aplique el cambio de
 * forma síncrona dentro de la transición — sin esto, react-router
 * actualizaría el DOM en el siguiente tick y el browser no capturaría
 * el "after" snapshot correctamente.
 *
 * Respeta `prefers-reduced-motion`: si el user pidió menos animación,
 * saltamos la transición (la app se siente igual de rápida sin animar).
 */
export function startViewTransition(callback: () => void): void {
  if (typeof document === "undefined") {
    callback()
    return
  }
  const doc = document as DocumentWithVT
  // Respetar prefers-reduced-motion — si el user lo prefiere, sin animar.
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  if (reduceMotion || typeof doc.startViewTransition !== "function") {
    callback()
    return
  }
  doc.startViewTransition(() => {
    flushSync(() => {
      callback()
    })
  })
}

/**
 * Hook que retorna un `navigate` envuelto con View Transitions.
 * API idéntica al `useNavigate` de react-router-dom, así que es drop-in.
 *
 * Mantiene compatibilidad total: si la API no existe, el navigate
 * funciona como siempre.
 */
export function useTransitionNavigate() {
  const navigate = useNavigate()
  return useCallback(
    (to: To | number, opts?: NavigateOptions) => {
      startViewTransition(() => {
        if (typeof to === "number") {
          navigate(to)
        } else {
          navigate(to, opts)
        }
      })
    },
    [navigate],
  )
}

/**
 * Helper para envolver UN cambio de estado React (no navigation) con
 * View Transitions. Útil para toggles de tema, cambios de viewMode,
 * apertura/cierre de paneles grandes, etc.
 *
 *   transitionStateUpdate(() => setDark(!dark))
 */
export function transitionStateUpdate(update: () => void): void {
  startViewTransition(update)
}

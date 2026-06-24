import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/**
 * Hace scroll al top automáticamente cuando cambia la ruta. Maneja:
 *   - El scroll de `window` (que casi nunca es el activo en esta app).
 *   - El scroll del shell mobile/desktop (`.scroll-container-ios`),
 *     que es el contenedor real con `overflow-y-auto`.
 *
 * No interfiere con scroll restoration cuando se usa "Atrás" del
 * navegador, porque solo se ejecuta en PUSH (no POP). Eso preserva
 * la posición previa esperada al volver.
 *
 * Excepciones (paths donde NO debemos scrollear):
 *   - Si la URL trae fragment `#xxx` (ancla), el usuario quiere ir a
 *     un punto específico — no lo pisamos.
 */
export default function ScrollToTopOnRoute() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) return // respetar anclas
    // Scroll del window (por si alguna página no usa scroll-container).
    if (typeof window !== "undefined") {
      try {
        window.scrollTo({ top: 0, behavior: "auto" })
      } catch {
        /* noop */
      }
    }
    // Scroll del contenedor principal del shell (es lo que de verdad
    // hace scroll en mobile/PWA).
    if (typeof document === "undefined") return
    const containers = document.querySelectorAll<HTMLElement>(
      ".scroll-container-ios",
    )
    for (const c of containers) {
      if (c.scrollTop > 0) {
        c.scrollTop = 0
      }
      // Fade-in suave del nuevo contenido. Quitamos la clase ANTES de
      // re-aplicarla para que la animación se dispare aunque ya hubiera
      // una en curso (force-reflow).
      c.classList.remove("route-fade-in")
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      void c.offsetWidth // trigger reflow
      c.classList.add("route-fade-in")
    }
  }, [pathname, hash])

  return null
}

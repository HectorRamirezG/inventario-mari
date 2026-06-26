import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"
import toast from "react-hot-toast"

import { useCartSummary, requestOpenCart } from "../../lib/useCartSummary"

/**
 * Recordatorio amable: si el cliente tiene items en el carrito Y navegó
 * a otra ruta del shop (no "/") por más de 120 segundos sin tocar nada,
 * dispara un toast "Tu carrito te espera 🛍️" con CTA "Ver".
 *
 * Anti-spam:
 *  - Solo se dispara UNA vez por sesión de "salida". Si vuelve a "/" y
 *    sale de nuevo, el contador se reinicia.
 *  - Si el carrito está vacío, no se dispara.
 *  - Cancela el timer si:
 *      a) carrito vacío (canceló todo)
 *      b) navega a "/" (ya está viendo el catálogo)
 *      c) cierra/refresca (componente desmonta)
 *
 * Monta UNA vez en App root dentro del BrowserRouter del shop. NO mostrar
 * en /admin, /login, /ticket/:token, /comanda/:token.
 */
export default function CartReminderMount() {
  const loc = useLocation()
  const { count, total } = useCartSummary()
  const firedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    // Solo aplica en rutas del shop diferentes a "/"
    const isShopRoute = !loc.pathname.startsWith("/admin") &&
      !loc.pathname.startsWith("/login") &&
      !loc.pathname.startsWith("/ticket/") &&
      !loc.pathname.startsWith("/comanda/")
    const isCatalog = loc.pathname === "/"

    // Limpiar timer anterior
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Si volvió a /, reseteamos el flag para que vuelva a disparar
    // la próxima vez que salga.
    if (isCatalog) {
      firedRef.current = false
      return
    }

    // No corresponde recordar si no estamos en el shop o si ya disparamos.
    if (!isShopRoute || firedRef.current) return
    if (count === 0) return

    // Timer 120s
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true
      toast(
        (t) => (
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>
              Tu carrito te espera{" "}
              <span style={{ opacity: 0.7 }}>
                ({count} {count === 1 ? "pieza" : "piezas"} · ${total.toFixed(2)})
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id)
                requestOpenCart()
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                background: "var(--brand-from, #e6007e)",
                color: "white",
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Ver
            </button>
          </span>
        ),
        { duration: 6000, icon: "🛍️" },
      )
    }, 120_000) // 2 minutos

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [loc.pathname, count, total])

  return null
}

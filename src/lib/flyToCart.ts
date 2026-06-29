/**
 * Animación "vuelo al carrito": cuando el cliente toca + en un producto,
 * dispara un pequeño icono que se arquea desde el botón origen hasta el
 * ícono del carrito en el header. Feedback visual instantáneo que se
 * siente premium sin instalar nada nuevo.
 *
 * Uso:
 *   import { flyToCart } from "@/lib/flyToCart"
 *   flyToCart(buttonEl, { color: "#e6007e" })
 *
 * El destino se detecta por `data-cart-target="1"` en el header. Si no
 * lo encuentra, no hace nada (fallback silencioso).
 *
 * Respeta `prefers-reduced-motion` y `data-motion="off"`.
 */

interface FlyOptions {
  /** Tamaño del proyectil (px). Default 28. */
  size?: number
  /** Color del fondo del proyectil. Default brand-from CSS var. */
  color?: string
  /** Símbolo dentro (emoji o texto corto). Default "+1". */
  symbol?: string
  /** Duración total del vuelo (ms). Default 650. */
  duration?: number
}

export function flyToCart(
  fromEl: Element | null,
  opts: FlyOptions = {},
): void {
  if (typeof document === "undefined") return
  if (!fromEl) return

  // Respeto a accesibilidad / preferencia de motion.
  const motionOff =
    document.documentElement.dataset.motion === "off" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (motionOff) return

  const target = document.querySelector<HTMLElement>('[data-cart-target="1"]')
  if (!target) return

  const fromRect = fromEl.getBoundingClientRect()
  const toRect = target.getBoundingClientRect()

  const size = opts.size ?? 28
  const duration = opts.duration ?? 650
  const symbol = opts.symbol ?? "+1"
  const color = opts.color ?? "var(--brand-from, #e6007e)"

  // Coordenadas de inicio (centro del botón origen) y fin (centro del carrito)
  const startX = fromRect.left + fromRect.width / 2 - size / 2
  const startY = fromRect.top + fromRect.height / 2 - size / 2
  const endX = toRect.left + toRect.width / 2 - size / 2
  const endY = toRect.top + toRect.height / 2 - size / 2

  // Punto de control del arco (a media altura entre origen y destino,
  // pero levantado un poco hacia arriba para que la trayectoria parezca
  // un parábolico natural).
  const midX = (startX + endX) / 2
  const midY = Math.min(startY, endY) - 80

  // Crea el "proyectil" inline (sin tocar React tree).
  const el = document.createElement("div")
  el.setAttribute("aria-hidden", "true")
  el.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    width: ${size}px;
    height: ${size}px;
    border-radius: 999px;
    background: ${color};
    color: white;
    font-size: ${size * 0.42}px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    pointer-events: none;
    box-shadow: 0 8px 24px -4px rgba(0,0,0,0.25);
    will-change: transform, opacity;
    transform: scale(0.6);
    opacity: 0;
  `
  el.textContent = symbol
  document.body.appendChild(el)

  // Web Animations API: anima opacity (entrada rápida) + posición vía
  // path bezier en 3 puntos para hacer el arco.
  // El delta X/Y se aplica con transform translate (más performante
  // que cambiar left/top que reflowea).
  const dx1 = midX - startX
  const dy1 = midY - startY
  const dx2 = endX - startX
  const dy2 = endY - startY

  const anim = el.animate(
    [
      { transform: "translate(0,0) scale(0.6)", opacity: 0, offset: 0 },
      { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0.08 },
      {
        transform: `translate(${dx1}px, ${dy1}px) scale(1)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${dx2}px, ${dy2}px) scale(0.4)`,
        opacity: 0,
        offset: 1,
      },
    ],
    {
      duration,
      easing: "cubic-bezier(0.55, 0, 0.6, 1)",
      fill: "forwards",
    },
  )

  // Cuando llega, dispara un "bump" en el target (carrito icono).
  anim.onfinish = () => {
    try {
      el.remove()
    } catch {
      /* noop */
    }
    bumpCartIcon(target)
  }
}

/** Mini-rebote del icono del carrito al terminar el vuelo. */
function bumpCartIcon(el: HTMLElement) {
  try {
    el.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.18)" },
        { transform: "scale(1)" },
      ],
      { duration: 280, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    )
  } catch {
    /* navegador sin WAAPI — ignorar */
  }
}

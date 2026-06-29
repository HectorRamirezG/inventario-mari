import { useLocation, useNavigate } from "react-router-dom"
import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import ShoppingBag from "lucide-react/dist/esm/icons/shopping-bag"
import Package from "lucide-react/dist/esm/icons/package"

import { formatMoney } from "../../lib/format"
import {
  useCartSummary,
  requestOpenCart,
  CART_OPEN_EVENT,
} from "../../lib/useCartSummary"
import { useLongPress } from "../../lib/useLongPress"

/**
 * Botón de carrito en el header del ShopShell (siempre visible para el
 * cliente). Reemplaza al FAB flotante de `ClientShopPage` que solo
 * aparecía en /catalogo.
 *
 * UX:
 * - Si el carrito está vacío → no se muestra (no estorbar).
 * - Si tiene items → icono + badge (count) + total compacto.
 * - Click corto: abre el cart drawer (navega a / si está en otra página).
 * - Long-press: abre un mini-popover con los últimos 3 items + total.
 */
export default function CartHeaderButton() {
  const summary = useCartSummary()
  const navigate = useNavigate()
  const loc = useLocation()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [glanceRect, setGlanceRect] = useState<DOMRect | null>(null)

  const handleClick = () => {
    const isOnShop = loc.pathname === "/" || loc.pathname === ""
    if (isOnShop) {
      requestOpenCart()
    } else {
      // Navegamos al catálogo y disparamos el evento tras un tick para que
      // ClientShopPage ya esté montado escuchando.
      navigate("/", { state: { openCart: true } })
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT))
      }, 60)
    }
  }

  const longPress = useLongPress(
    () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setGlanceRect(r)
    },
    {
      delay: 380,
      onCancel: () => setGlanceRect(null),
    },
  )

  if (summary.isEmpty) return null

  return (
    <>
      <motion.button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        {...longPress}
        aria-label={`Carrito (${summary.count} piezas, total ${formatMoney(summary.total)})`}
        title={`Ver carrito · ${summary.count} ${summary.count === 1 ? "pieza" : "piezas"} · ${formatMoney(summary.total)} · long-press: vista rápida`}
        data-cart-target="1"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.92 }}
        className="relative h-9 px-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 active:bg-primary/20 flex items-center gap-1.5 transition-colors select-none"
      >
        <div className="relative">
          <ShoppingBag size={15} />
          {/* Badge con count — usa AnimatePresence para que el cambio
              de número haga un pop sutil */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={summary.count}
              initial={{ scale: 0.6, opacity: 0, y: -4 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.6, opacity: 0, y: -4 }}
              transition={{ type: "spring", stiffness: 380, damping: 24 }}
              className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center shadow-sm"
            >
              {summary.count > 99 ? "99+" : summary.count}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest tabular-nums">
          {formatMoney(summary.total)}
        </span>
      </motion.button>

      {/* Mini-popover de previa (long-press) */}
      {glanceRect && typeof document !== "undefined" &&
        createPortal(
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[210] w-72 rounded-2xl bg-white dark:bg-slate-900 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.35)] border border-slate-100 dark:border-slate-800 overflow-hidden pointer-events-none"
            style={{
              top: Math.min(window.innerHeight - 240, glanceRect.bottom + 6),
              right: Math.max(8, window.innerWidth - glanceRect.right),
            }}
          >
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-primary/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                Tu carrito
              </p>
              <p className="text-[11px] font-black tabular-nums text-slate-700 dark:text-slate-200">
                {formatMoney(summary.total)}
              </p>
            </div>
            <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
              {summary.lines.slice(0, 4).map((l) => (
                <div
                  key={l.variant_id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60"
                >
                  <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-700 overflow-hidden flex items-center justify-center text-slate-300 shrink-0">
                    {l.image_url ? (
                      <img
                        src={l.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={12} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold truncate text-slate-700 dark:text-slate-200">
                      {l.product_name}
                    </p>
                    <p className="text-[9px] text-slate-400 truncate">
                      {l.qty} × {formatMoney(l.unit_price)}
                    </p>
                  </div>
                </div>
              ))}
              {summary.lines.length > 4 && (
                <p className="text-[9px] text-center text-slate-400 font-bold pt-1">
                  +{summary.lines.length - 4} más
                </p>
              )}
            </div>
          </motion.div>,
          document.body,
        )}
    </>
  )
}

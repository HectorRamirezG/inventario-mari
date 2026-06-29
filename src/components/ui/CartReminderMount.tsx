import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, ShoppingBag, ArrowRight } from "lucide-react"

import { useCartSummary, requestOpenCart } from "../../lib/useCartSummary"
import { formatMoney } from "../../lib/format"

/**
 * Mini-banner persistente que aparece cuando el cliente tiene items en
 * el carrito Y lleva >90 segundos en una ruta del shop diferente a "/".
 * NO es un toast que desaparece — es un bocadillo flotante que el
 * cliente puede dismissar con × o tocar para abrir el carrito.
 *
 * Reemplaza al toast efímero anterior (era fácil de ignorar — pasaba
 * 6s y se iba). Esta versión persiste hasta que dismiss o vuelva a "/".
 *
 * Reglas:
 *  - Solo en rutas del shop (no admin, login, ticket público, comanda)
 *  - Solo si carrito no está vacío
 *  - Solo si la ruta actual NO es "/"
 *  - Solo después de 90s en la ruta (no flash inmediato al cambiar)
 *  - Dismiss persiste 4h en localStorage por hash del cart — si el
 *    cart cambia, se vuelve a ofrecer
 */
const DISMISS_KEY = "mari:cart-reminder:dismissed"
const DISMISS_TTL_MS = 4 * 60 * 60 * 1000 // 4h
const SHOW_AFTER_MS = 90_000 // 1.5 min

function readDismissedHash(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return null
    const { hash, at } = JSON.parse(raw)
    if (typeof hash !== "string" || typeof at !== "number") return null
    if (Date.now() - at > DISMISS_TTL_MS) {
      window.localStorage.removeItem(DISMISS_KEY)
      return null
    }
    return hash
  } catch {
    return null
  }
}

function writeDismissedHash(hash: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      DISMISS_KEY,
      JSON.stringify({ hash, at: Date.now() }),
    )
  } catch {
    /* localStorage lleno */
  }
}

/** Hash sencillo del carrito (count + total). Si cualquiera cambia,
 *  el dismiss anterior queda inválido y el banner se vuelve a ofrecer. */
function cartHash(count: number, total: number): string {
  return `${count}:${total.toFixed(2)}`
}

export default function CartReminderMount() {
  const loc = useLocation()
  const navigate = useNavigate()
  const { count, total } = useCartSummary()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const isShopRoute =
      !loc.pathname.startsWith("/admin") &&
      !loc.pathname.startsWith("/login") &&
      !loc.pathname.startsWith("/ticket/") &&
      !loc.pathname.startsWith("/comanda/")
    const isCatalog = loc.pathname === "/"

    setVisible(false)
    if (isCatalog || !isShopRoute || count === 0) return

    // Si el hash actual del carrito coincide con un dismiss vigente,
    // no mostrar.
    const hash = cartHash(count, total)
    if (readDismissedHash() === hash) return

    const id = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(id)
  }, [loc.pathname, count, total])

  if (!visible || count === 0) return null

  const hash = cartHash(count, total)
  const handleOpen = () => {
    setVisible(false)
    if (loc.pathname === "/") {
      requestOpenCart()
    } else {
      navigate("/", { state: { openCart: true } })
      window.setTimeout(() => requestOpenCart(), 60)
    }
  }
  const handleDismiss = () => {
    writeDismissedHash(hash)
    setVisible(false)
  }

  return (
    <AnimatePresence>
      <motion.div
        key="cart-reminder"
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed left-1/2 -translate-x-1/2 z-[170] pointer-events-auto"
        style={{ top: "calc(env(safe-area-inset-top) + 56px)" }}
      >
        <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-500/30 shadow-[0_15px_40px_-12px_rgba(230,0,126,0.35)] backdrop-blur-xl">
          <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShoppingBag size={14} />
          </span>
          <div className="flex flex-col leading-tight pr-1">
            <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">
              Tu carrito te espera
            </span>
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
              {count} {count === 1 ? "pieza" : "piezas"} ·{" "}
              {formatMoney(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpen}
            className="h-8 px-2.5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press"
          >
            Ver <ArrowRight size={11} />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Descartar recordatorio"
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
          >
            <X size={11} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

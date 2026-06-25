/**
 * ClientActionHub — Drawer del botón `+` central del dock cliente.
 *
 * PRINCIPIO: TODO el menu rapido del cliente vive aqui.
 * Avatar (UserProfileDrawer) = SOLO cuenta personal (perfil + seguridad).
 *
 * Estructura del menu:
 *  MI INFO (navega a paginas):
 *   - Pedidos     → /mis-pedidos
 *   - Monedero    → /mi-monedero
 *   - Premios     → /mis-premios (si rule)
 *   - Resenas     → /mis-resenas (o drawer, segun como las pongamos)
 *   - Deseos      → /mis-deseos (si rule)
 *
 *  ACCIONES (hace algo aquí mismo):
 *   - Mi carrito  → reabrir carrito
 *   - Pedir deseo → abre WishesDrawer (si rule)
 *   - Reportar    → abre SupportModal
 *   - WhatsApp    → wa.me link directo
 *   - Iniciar sesion (fallback solo si !logged)
 *
 * Filtra cada chip según business rules / sesión.
 */
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import {
  X,
  Heart,
  LifeBuoy,
  ShoppingBag,
  MessageCircle,
  Sparkles,
  Wallet,
  Trophy,
  Star,
  Receipt as ReceiptIcon,
} from "lucide-react"

import { useAuth } from "../../lib/useAuth"
import { useBusinessRules } from "../../features/settings/businessRulesService"
import { useStoreInfo } from "../../lib/useStoreInfo"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import { requestOpenCart } from "../../lib/useCartSummary"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import WishesDrawer from "../../features/wishes/WishesDrawer"
import SupportModal from "../../features/support/SupportModal"
import MyReviewsDrawer from "../../features/reviews/MyReviewsDrawer"

interface Props {
  open: boolean
  onClose: () => void
}

type Tone = "primary" | "rose" | "amber" | "violet" | "emerald" | "sky"

interface ActionItem {
  id: string
  label: string
  caption: string
  icon: typeof Heart
  tone: Tone
  onTap: () => void
  visible: boolean
}

const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
}

export default function ClientActionHub({ open, onClose }: Props) {
  const { session, email, fullName } = useAuth()
  const navigate = useNavigate()
  const bRules = useBusinessRules()
  const store = useStoreInfo()
  const isLogged = !!session

  // Sub-drawers que se abren desde aquí.
  const [wishesOpen, setWishesOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [reviewsOpen, setReviewsOpen] = useState(false)

  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  // wa.me con número de la tienda (si está configurado en useStoreInfo)
  const cleanPhone = (store.phone ?? "").replace(/\D/g, "")
  const waLink = cleanPhone
    ? `https://wa.me/${
        cleanPhone.length === 10 ? "52" + cleanPhone : cleanPhone
      }?text=${encodeURIComponent("Hola Beauty's Me 💖")}`
    : null

  const infoActions: ActionItem[] = [
    {
      id: "orders",
      label: "Mis pedidos",
      caption: "Tu historial",
      icon: ReceiptIcon,
      tone: "primary",
      visible: isLogged,
      onTap: () => {
        onClose()
        navigate("/mis-pedidos")
      },
    },
    {
      id: "wallet",
      label: "Mi monedero",
      caption: "Saldos y pagos",
      icon: Wallet,
      tone: "emerald",
      visible: isLogged,
      onTap: () => {
        onClose()
        navigate("/mi-monedero")
      },
    },
    {
      id: "rewards",
      label: "Mis premios",
      caption: "Puntos y logros",
      icon: Trophy,
      tone: "violet",
      visible: bRules.loyalty_enabled && isLogged,
      onTap: () => {
        onClose()
        navigate("/mis-premios")
      },
    },
    {
      id: "reviews",
      label: "Mis reseñas",
      caption: "Califica y suma puntos",
      icon: Star,
      tone: "amber",
      visible: bRules.reviews_enabled && isLogged,
      onTap: () => setReviewsOpen(true),
    },
    {
      id: "wishlist",
      label: "Mis deseos",
      caption: "Lo que has pedido",
      icon: Heart,
      tone: "rose",
      visible: bRules.wishes_enabled && isLogged,
      onTap: () => {
        onClose()
        navigate("/mis-deseos")
      },
    },
  ]

  const actions: ActionItem[] = [
    {
      id: "cart",
      label: "Mi carrito",
      caption: "Ver lo que llevas",
      icon: ShoppingBag,
      tone: "primary",
      visible: true,
      onTap: () => {
        onClose()
        requestOpenCart()
      },
    },
    {
      id: "wish",
      label: "Pedir un deseo",
      caption: "¿No lo encuentras? Pídelo",
      icon: Heart,
      tone: "rose",
      visible: bRules.wishes_enabled && isLogged,
      onTap: () => setWishesOpen(true),
    },
    {
      id: "support",
      label: "Reportar algo",
      caption: "Tuvimos un problema",
      icon: LifeBuoy,
      tone: "sky",
      visible: isLogged,
      onTap: () => setSupportOpen(true),
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      caption: "Habla directo con la tienda",
      icon: MessageCircle,
      tone: "emerald",
      visible: !!waLink,
      onTap: () => {
        if (waLink) window.open(waLink, "_blank", "noopener,noreferrer")
        onClose()
      },
    },
    {
      id: "login",
      label: "Iniciar sesión",
      caption: "Para apartar y reseñar",
      icon: Sparkles,
      tone: "primary",
      visible: !isLogged,
      onTap: () => {
        onClose()
        navigate("/login")
      },
    },
  ]

  const visibleActions = actions.filter((a) => a.visible)
  const visibleInfo = infoActions.filter((a) => a.visible)

  // ¿Algún sub-drawer está abierto? Cuando si, ocultamos el panel + backdrop
  // del ActionHub principal para que el cliente vea SOLO el sub-drawer
  // limpio (Mari: 'que se esconda y deje ver lo que abrio').
  const subDrawerOpen = wishesOpen || supportOpen || reviewsOpen

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          // Cuando hay sub-drawer abierto, ocultamos backdrop+panel del
          // hub pero el wrapper sigue montado (porque envuelve a los
          // sub-drawers como WishesDrawer/SupportModal/MyReviewsDrawer
          // y permite usar AnimatePresence con su animaci\u00f3n de exit).
          // PROBLEMA: el wrapper es fixed inset-0 y por default tiene
          // pointer-events:auto \u2192 capturaba TODOS los clicks de la
          // pantalla cuando estaba "vac\u00edo" (sub-drawer abierto), lo
          // que dejaba al usuario sin poder cerrar ni interactuar con
          // el sub-drawer (que vive en otro portal a document.body).
          // FIX: pointer-events-none cuando est\u00e1 vac\u00edo; los hijos
          // (backdrop/panel del hub) reactivan auto cuando son visibles.
          className={`fixed inset-0 z-[218] flex items-end justify-center ${
            subDrawerOpen ? "pointer-events-none" : ""
          }`}
          style={{ isolation: "isolate" }}
        >
          {/* Backdrop principal — oculto cuando hay sub-drawer (el sub
              tiene su propio backdrop, no necesitamos doble). */}
          {!subDrawerOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={OVERLAY_BACKDROP_TRANSITION}
              onClick={onClose}
              className="absolute inset-0 bg-slate-950/70"
              aria-hidden
            />
          )}

          {/* Panel principal — solo si NO hay sub-drawer abierto. */}
          {!subDrawerOpen && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={OVERLAY_PANEL_TRANSITION}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={onDragEnd}
              style={OVERLAY_PANEL_STYLE}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[88vh] flex flex-col touch-pan-y"
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-black tracking-tight">
                  Acciones rápidas
                </h3>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {isLogged
                    ? `Para ti, ${fullName?.split(" ")[0] ?? email?.split("@")[0] ?? "amiga"}`
                    : "Bienvenida a Beauty's Me"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
              >
                <X size={14} />
              </button>
            </div>

            {/* 2 secciones: MI INFO (navega) + ACCIONES (hacer aqui) */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios space-y-4">
              {visibleInfo.length > 0 && (
                <section>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-2 px-1">
                    Mi cuenta
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {visibleInfo.map((a, i) => (
                      <ActionButton key={a.id} action={a} index={i} />
                    ))}
                  </div>
                </section>
              )}

              {visibleActions.length > 0 && (
                <section>
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500 mb-2 px-1">
                    Acciones rápidas
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {visibleActions.map((a, i) => (
                      <ActionButton key={a.id} action={a} index={i} />
                    ))}
                  </div>
                </section>
              )}

              {!isLogged && (
                <p className="text-center text-[10px] text-slate-400 mt-4 italic">
                  Inicia sesión para ver más opciones
                </p>
              )}
            </div>
          </motion.div>
          )}

          {/* Sub-drawers (todos heredan z-index del portal) */}
          <WishesDrawer
            open={wishesOpen}
            onClose={() => {
              setWishesOpen(false)
              onClose()
            }}
          />
          <SupportModal
            open={supportOpen}
            saleId={null}
            customerName={fullName ?? email ?? null}
            onClose={() => {
              setSupportOpen(false)
              onClose()
            }}
          />
          <MyReviewsDrawer
            open={reviewsOpen}
            initialTab="pendientes"
            onClose={() => {
              setReviewsOpen(false)
              onClose()
            }}
          />
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Boton tarjeta individual del grid. Extraido para no duplicar JSX
 *  entre la seccion 'Mi cuenta' y 'Acciones'. */
function ActionButton({
  action: a,
  index: i,
}: {
  action: ActionItem
  index: number
}) {
  return (
    <motion.button
      type="button"
      onClick={a.onTap}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.03, 0.15) }}
      className={`text-left rounded-2xl p-3 ${TONE_CLASS[a.tone]} press active:scale-[0.97] transition-transform`}
    >
      <a.icon size={20} strokeWidth={2.2} />
      <p className="mt-2 text-[12px] font-black leading-tight">{a.label}</p>
      <p className="text-[10px] font-bold opacity-80 leading-snug mt-0.5 line-clamp-2">
        {a.caption}
      </p>
    </motion.button>
  )
}

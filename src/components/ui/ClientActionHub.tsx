/**
 * ClientActionHub — Drawer del botón `+` central del dock cliente.
 *
 * Estilo iOS sheet con grid de acciones rápidas más comunes que el
 * cliente quiere hacer "sin navegar". Cada chip es un acceso directo:
 *
 *  - "Pedir un deseo"      → abre WishesDrawer (si rule activa)
 *  - "Reportar problema"   → abre SupportModal
 *  - "Calificar productos" → abre MyReviewsDrawer en pendientes (si rule)
 *  - "Mis premios"         → abre LoyaltyDrawer (si rule)
 *  - "WhatsApp"            → wa.me link directo
 *  - "Ver mi carrito"      → dispara `mari:open-cart`
 *
 * Filtra acciones según business rules. Si una acción no aplica
 * (regla apagada / sin sesión), no aparece — UI nunca con botones rotos.
 */
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import {
  X,
  Heart,
  LifeBuoy,
  Star,
  Trophy,
  ShoppingBag,
  MessageCircle,
  Sparkles,
  Wallet,
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
import LoyaltyDrawer from "../../features/loyalty/LoyaltyDrawer"

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
  const [loyaltyOpen, setLoyaltyOpen] = useState(false)

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
      id: "wish",
      label: "Pedir un deseo",
      caption: "¿No lo encuentras? Pídelo",
      icon: Heart,
      tone: "rose",
      visible: bRules.wishes_enabled && isLogged,
      onTap: () => setWishesOpen(true),
    },
    {
      id: "review",
      label: "Calificar productos",
      caption: "Suma puntos y ayuda",
      icon: Star,
      tone: "amber",
      visible: bRules.reviews_enabled && isLogged,
      onTap: () => setReviewsOpen(true),
    },
    {
      id: "loyalty",
      label: "Mis premios",
      caption: "Tus puntos y canjes",
      icon: Trophy,
      tone: "violet",
      visible: bRules.loyalty_enabled && isLogged,
      onTap: () => setLoyaltyOpen(true),
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

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[218] flex items-end justify-center"
          style={{ isolation: "isolate" }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/70"
            aria-hidden
          />

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

            {/* Grid de acciones */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios">
              <div className="grid grid-cols-2 gap-2.5">
                {visibleActions.map((a, i) => (
                  <motion.button
                    key={a.id}
                    type="button"
                    onClick={a.onTap}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.15) }}
                    className={`text-left rounded-2xl p-3 ${TONE_CLASS[a.tone]} press active:scale-[0.97] transition-transform`}
                  >
                    <a.icon size={22} strokeWidth={2.2} />
                    <p className="mt-2 text-[12px] font-black leading-tight">
                      {a.label}
                    </p>
                    <p className="text-[10px] font-bold opacity-80 leading-snug mt-0.5 line-clamp-2">
                      {a.caption}
                    </p>
                  </motion.button>
                ))}
              </div>

              {!isLogged && (
                <p className="text-center text-[10px] text-slate-400 mt-4 italic">
                  Inicia sesión para ver más opciones
                </p>
              )}
            </div>
          </motion.div>

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
          <LoyaltyDrawer
            open={loyaltyOpen}
            onClose={() => {
              setLoyaltyOpen(false)
              onClose()
            }}
          />
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Info,
  AlertTriangle,
  CheckCircle2,
  Megaphone,
  MoonStar,
} from "lucide-react"

import { useBusinessRules } from "../../features/settings/businessRulesService"
import { useAuth, isStaffOrAdmin } from "../../lib/useAuth"

/**
 * Banner sticky superior con anuncios globales del negocio.
 *
 * Soporta DOS tipos de mensaje, en orden de prioridad:
 *  1. Modo vacaciones (`shop_closed_enabled`): tono especial púrpura,
 *     siempre visible para cliente (no descartable). Para admin solo
 *     un recordatorio sutil de que el modo está activo.
 *  2. Aviso general (`announcement_enabled`): tono y audiencia
 *     configurables. Descartable por cliente salvo `force_visible`.
 *
 * Posiciona como `fixed top-0` con z-index alto para flotar sobre
 * cualquier header existente. Padding-top en body se ajusta solo via
 * efecto cuando hay banner activo, para que no tape el contenido.
 */
export default function AnnouncementBanner() {
  const rules = useBusinessRules()
  const { role } = useAuth()
  const isAdmin = isStaffOrAdmin(role)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  // El "shop_closed" gana sobre el "announcement" cuando ambos están
  // activos. Cliente lo ve siempre; admin solo como nota.
  const showClosed = rules.shop_closed_enabled

  // Audiencia del aviso general.
  const announcementMatches =
    rules.announcement_enabled &&
    rules.announcement_text.trim().length > 0 &&
    (rules.announcement_audience === "all" ||
      (rules.announcement_audience === "admin" && isAdmin) ||
      (rules.announcement_audience === "client" && !isAdmin))

  // Cuál de los dos mostramos (closed gana).
  const active: "closed" | "announce" | null = showClosed
    ? "closed"
    : announcementMatches
    ? "announce"
    : null

  // Cargar dismissedKey al cambiar el contenido. Si el admin cambió
  // el mensaje, el viejo descartado deja de aplicar (clave incluye texto).
  const dismissKey = useMemo(() => {
    if (!active) return null
    if (active === "closed") {
      return `mari:closed-banner:${rules.shop_closed_message}:${rules.shop_closed_until ?? ""}`
    }
    return `mari:announcement:${rules.announcement_tone}:${rules.announcement_text}`
  }, [
    active,
    rules.announcement_text,
    rules.announcement_tone,
    rules.shop_closed_message,
    rules.shop_closed_until,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || !dismissKey) {
      setDismissedKey(null)
      return
    }
    const stored = localStorage.getItem(dismissKey)
    if (!stored) {
      setDismissedKey(null)
      return
    }
    const at = Date.parse(stored)
    // 24h de dismiss para anuncios normales. Para shop_closed el
    // dismiss SIEMPRE expira al recargar (se ignora storage). Esto
    // garantiza que el cliente vuelva a ver el aviso de cierre cada
    // sesión.
    if (active === "closed") {
      setDismissedKey(null)
      return
    }
    if (Number.isFinite(at) && Date.now() - at < 24 * 3600 * 1000) {
      setDismissedKey(dismissKey)
    } else {
      localStorage.removeItem(dismissKey)
      setDismissedKey(null)
    }
  }, [dismissKey, active])

  if (typeof document === "undefined") return null
  if (!active) return null

  // Para announcement: si `force_visible` está apagado y el cliente lo
  // dismisseó, no mostramos. Admin SIEMPRE lo ve (no se puede dismissear
  // sus propios avisos, así no se olvida que están encendidos).
  const isDismissed =
    active === "announce" &&
    !rules.announcement_force_visible &&
    !isAdmin &&
    dismissedKey === dismissKey
  if (isDismissed) return null

  /* ──────── Render config según tipo ──────── */

  let bg = ""
  let text = ""
  let icon = Info
  let subText: string | null = null

  if (active === "closed") {
    bg = "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-white"
    icon = MoonStar
    text =
      rules.shop_closed_message?.trim() ||
      "Estamos cerrados temporalmente. Volvemos pronto 💜"
    if (rules.shop_closed_until) {
      try {
        const d = new Date(rules.shop_closed_until + "T00:00:00")
        subText = `Volvemos el ${d.toLocaleDateString("es-MX", {
          day: "numeric",
          month: "long",
        })}`
      } catch {
        /* noop */
      }
    }
    // Admin solo ve un recordatorio compacto (no quita features, sí avisa).
    if (isAdmin) {
      bg = "bg-violet-100 dark:bg-violet-500/20 text-violet-900 dark:text-violet-100"
      text = `Modo vacaciones ACTIVO — el cliente no puede apartar`
      subText = null
    }
  } else {
    // announcement
    const TONES: Record<
      typeof rules.announcement_tone,
      { bg: string; icon: typeof Info }
    > = {
      info: { bg: "bg-sky-600 text-white", icon: Info },
      warn: { bg: "bg-amber-500 text-white", icon: AlertTriangle },
      success: { bg: "bg-emerald-600 text-white", icon: CheckCircle2 },
      promo: {
        bg: "bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white",
        icon: Megaphone,
      },
    }
    const t = TONES[rules.announcement_tone] ?? TONES.info
    bg = t.bg
    icon = t.icon
    text = rules.announcement_text.trim()
  }

  const Icon = icon

  function dismiss() {
    if (!dismissKey) return
    try {
      localStorage.setItem(dismissKey, new Date().toISOString())
    } catch {
      /* noop */
    }
    setDismissedKey(dismissKey)
  }

  // El banner empuja el contenido (no tapa). Lo logramos usando
  // padding-top sobre el body via efecto controlado: alternativa
  // simple es hacer el banner sticky NO fixed. Aquí usamos sticky
  // top-0 dentro de un portal al body — el body ya tiene un wrapper
  // que respeta document flow. Para no tocar todo el shell, optamos
  // por POSICIÓN FIXED + dejar que el ScrollToTopButton/header tengan
  // su z propio. El offset visual lo absorbe el `pt-8` del shell;
  // para evitar overlaps con headers, padding extra dinámico en body.
  return createPortal(
    <AnimatePresence>
      <motion.div
        key={dismissKey ?? active}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-[180] ${bg} shadow-lg`}
        role="status"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2.5">
          <Icon size={14} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] sm:text-[12px] font-black leading-tight truncate">
              {text}
            </p>
            {subText && (
              <p className="text-[10px] font-bold opacity-90 leading-tight truncate">
                {subText}
              </p>
            )}
          </div>
          {active === "announce" &&
            !rules.announcement_force_visible &&
            !isAdmin && (
              <button
                type="button"
                onClick={dismiss}
                aria-label="Descartar aviso"
                className="shrink-0 w-7 h-7 rounded-full bg-black/15 hover:bg-black/25 flex items-center justify-center transition-colors"
              >
                <X size={12} />
              </button>
            )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

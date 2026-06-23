import { useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import {
  X,
  Sparkles,
  Trophy,
  TrendingUp,
  TrendingDown,
  Gift,
  Check,
} from "lucide-react"

import { useBusinessRules } from "../settings/businessRulesService"
import {
  useLoyaltyRules,
  useMyLoyaltyBalance,
  useMyLoyaltyEvents,
  pointsToMoney,
} from "./loyaltyService"
import { formatMoney, formatRelative } from "../../lib/format"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import { useCountUp } from "../../lib/useCountUp"

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Drawer "Mis premios" para el cliente. Muestra:
 *   - Balance actual con animación de conteo
 *   - Valor en pesos según business rule loyalty_peso_por_punto
 *   - Historial de eventos (ganados / canjeados)
 *   - Cómo ganar más puntos (reglas activas con sus puntos)
 *
 * Solo se monta si rules.loyalty_enabled = true.
 */
export default function LoyaltyDrawer({ open, onClose }: Props) {
  const rules = useBusinessRules()
  const { balance, loading: loadingBal } = useMyLoyaltyBalance()
  const { events, loading: loadingEv } = useMyLoyaltyEvents(40)
  const { rules: catalog } = useLoyaltyRules()

  useBodyScrollLock(open)

  // ESC para cerrar
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

  const points = balance?.points ?? 0
  const animatedPoints = useCountUp(points, 700)
  const moneyValue = useMemo(
    () => pointsToMoney(points, rules.loyalty_peso_por_punto || 1),
    [points, rules.loyalty_peso_por_punto],
  )

  // Reglas habilitadas y ordenadas por puntos descendentes.
  const activeRules = useMemo(
    () => catalog.filter((r) => r.enabled).sort((a, b) => b.points - a.points),
    [catalog],
  )

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60"
          />

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={OVERLAY_PANEL_TRANSITION}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            style={OVERLAY_PANEL_STYLE}
            className="relative w-full max-w-md max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-premium overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-bloom"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                }}
              >
                <Trophy size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black tracking-tight">Mis premios</p>
                <p className="text-[10px] font-bold text-slate-500">
                  Acumula puntos por usar la app
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
              >
                <X size={14} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scroll-container-ios">
              {/* Hero card: puntos actuales */}
              <div
                className="relative overflow-hidden rounded-3xl p-5 text-white shadow-premium"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                }}
              >
                <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 blur-xl" />
                <div className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-white/10 blur-lg" />
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80 relative">
                  Tienes
                </p>
                <p className="text-5xl font-black tabular-nums leading-none mt-1 relative">
                  {loadingBal ? "—" : Math.round(animatedPoints)}
                  <span className="text-base opacity-80 ml-1">pts</span>
                </p>
                <p className="text-[11px] font-black mt-2 opacity-90 relative">
                  ≈ {formatMoney(moneyValue)} en tu próxima compra
                </p>
                {balance && balance.lifetime_earned > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-4 text-[10px] relative">
                    <div className="rounded-xl bg-white/15 px-2.5 py-1.5 backdrop-blur">
                      <p className="font-bold opacity-80">Ganados de por vida</p>
                      <p className="font-black tabular-nums">
                        {balance.lifetime_earned}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/15 px-2.5 py-1.5 backdrop-blur">
                      <p className="font-bold opacity-80">Canjeados</p>
                      <p className="font-black tabular-nums">
                        {balance.lifetime_spent}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista simple y plana: mezcla eventos (ganados/usados) en orden
                  cronológico inverso. Sin secciones separadas — Mari prefiere
                  algo rápido tipo "extracto de cuenta". */}
              <section>
                <header className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Gift size={12} className="text-primary" />
                    Mis movimientos
                  </h3>
                  {events.length > 0 && (
                    <span className="text-[9px] font-bold text-slate-400 tabular-nums">
                      {events.length}
                    </span>
                  )}
                </header>
                {loadingEv ? (
                  <p className="text-[11px] text-slate-400 italic py-3 text-center">
                    Cargando…
                  </p>
                ) : events.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center">
                    <p className="text-[12px] font-black text-slate-600 dark:text-slate-300">
                      Aún no tienes movimientos
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                      Cuando pagues tu primer apartado, completes tu perfil
                      o dejes una reseña, aquí verás tus puntos.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                    {events.map((ev) => (
                      <li
                        key={ev.id}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                            ev.delta >= 0
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                          }`}
                        >
                          {ev.delta >= 0 ? (
                            <TrendingUp size={13} />
                          ) : (
                            <TrendingDown size={13} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 truncate">
                            {ev.note ?? ev.action_key ?? "Evento"}
                          </p>
                          <p className="text-[9px] text-slate-400">
                            {formatRelative(ev.created_at)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-[12px] font-black tabular-nums ${
                            ev.delta >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {ev.delta >= 0 ? "+" : ""}
                          {ev.delta}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Hint colapsable de "cómo funciona". Se muestra como mini-pill
                  expandible para no robar atención de la lista de movimientos. */}
              {activeRules.length > 0 && (
                <details className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 group">
                  <summary className="cursor-pointer list-none flex items-center justify-between px-3 py-2.5">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Sparkles size={12} className="text-primary" />
                      ¿Cómo gano más puntos?
                    </span>
                    <span className="text-[9px] text-slate-400 group-open:rotate-90 transition-transform">
                      ›
                    </span>
                  </summary>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                    {activeRules.map((r) => (
                      <li
                        key={r.action_key}
                        className="flex items-center gap-3 px-3 py-2"
                      >
                        <span className="text-base shrink-0" aria-hidden>
                          {r.emoji ?? "✨"}
                        </span>
                        <p className="flex-1 min-w-0 text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                          {r.label}
                        </p>
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black tabular-nums">
                          +{r.points}
                          {r.one_time && (
                            <span className="opacity-70 ml-1">1×</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Hint final compacto */}
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/30 p-3 flex items-start gap-2">
                <Check
                  size={12}
                  className="text-amber-700 dark:text-amber-300 mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-[11px] font-black text-amber-800 dark:text-amber-200 leading-snug">
                    Tus puntos se aplican automáticamente al apartar tu
                    próximo pedido (mínimo {rules.loyalty_min_redeem} pts).
                  </p>
                  <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 mt-0.5 leading-snug">
                    1 pt = {formatMoney(rules.loyalty_peso_por_punto || 1)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

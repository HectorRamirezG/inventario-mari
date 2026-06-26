import { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Truck from "lucide-react/dist/esm/icons/truck"
import MapPin from "lucide-react/dist/esm/icons/map-pin"
import Clock from "lucide-react/dist/esm/icons/clock"
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2"
import Loader2 from "lucide-react/dist/esm/icons/loader-2"

import {
  listShippingZones,
  estimateShipping,
  rememberPostalCode,
  recallPostalCode,
  type ShippingEstimate,
  type ShippingZone,
} from "../settings/shippingZonesService"
import { formatMoney } from "../../lib/format"
import { useDebouncedValue } from "../../lib/useDebouncedValue"

/**
 * Estimador inline de envío. Aparece como un mini-bloque dentro del
 * BuySheet o de la pantalla de checkout. Captura el CP, busca la zona
 * y muestra UNA respuesta clara: "Te llega en 2 días por $80".
 *
 * Reutilizable: `compact` lo hace ultra-mini (solo input + chip de respuesta)
 * para meterlo dentro del BuySheet. Por default es la versión "card" más
 * grande para checkout.
 */

interface Props {
  /** CP inicial (lo recordamos en localStorage entre sesiones). */
  initialCp?: string
  /** Callback cuando el cliente confirma una estimación. */
  onEstimate?: (e: ShippingEstimate) => void
  /** Layout compacto para BuySheet. Default false (card grande). */
  compact?: boolean
  /** Cuando true, esconde el bloque si no hay zonas configuradas. */
  hideWhenEmpty?: boolean
}

export default function ShippingEstimator({
  initialCp,
  onEstimate,
  compact = false,
  hideWhenEmpty = false,
}: Props) {
  const [cp, setCp] = useState<string>(initialCp ?? recallPostalCode())
  const [zones, setZones] = useState<ShippingZone[] | null>(null)
  const [loading, setLoading] = useState(true)
  const cpDebounced = useDebouncedValue(cp, 250)

  useEffect(() => {
    setLoading(true)
    listShippingZones()
      .then((zs) => setZones(zs))
      .catch(() => setZones([]))
      .finally(() => setLoading(false))
  }, [])

  const estimate = useMemo(() => {
    if (!zones || cpDebounced.length < 4) return null
    return estimateShipping(cpDebounced, zones)
  }, [cpDebounced, zones])

  // Side-effects: recordar CP + callback hacia padre
  useEffect(() => {
    if (cpDebounced.length >= 4) rememberPostalCode(cpDebounced)
  }, [cpDebounced])

  useEffect(() => {
    if (estimate && onEstimate) onEstimate(estimate)
  }, [estimate, onEstimate])

  if (loading) {
    return (
      <div
        className={
          compact
            ? "h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
            : "h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse"
        }
      />
    )
  }

  // Esconder cuando Mari no haya configurado zonas todavía y la prop lo pide
  if (hideWhenEmpty && (zones?.length ?? 0) === 0) return null

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-2.5"
          : "rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/70 dark:bg-sky-500/5 p-3.5"
      }
    >
      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <Truck size={14} className="text-sky-600 dark:text-sky-300" />
          <p className="text-[11px] uppercase tracking-widest font-black text-sky-700 dark:text-sky-300">
            ¿Cuánto cuesta el envío?
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <MapPin
          size={14}
          className="text-slate-400 shrink-0"
        />
        <input
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="Tu código postal"
          maxLength={6}
          value={cp}
          onChange={(e) => setCp(e.target.value.replace(/[^0-9]/g, ""))}
          className="flex-1 bg-transparent border-0 outline-none text-sm font-bold tabular-nums placeholder:text-slate-400 dark:text-slate-100"
        />
        {(zones?.length ?? 0) > 0 && cp.length >= 1 && cp.length < 4 && (
          <span className="text-[10px] text-slate-400">faltan dígitos</span>
        )}
      </div>

      <AnimatePresence>
        {estimate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={
              compact
                ? "mt-2 pt-2 border-t border-slate-100 dark:border-slate-800"
                : "mt-3 pt-3 border-t border-sky-200 dark:border-sky-500/20"
            }
          >
            {estimate.is_fallback ? (
              <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                <Loader2 size={14} className="mt-0.5 shrink-0 animate-pulse" />
                <div className="min-w-0">
                  <p className="text-[12px] font-black">{estimate.label}</p>
                  {estimate.instructions && (
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                      {estimate.instructions}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <CheckCircle2
                  size={20}
                  className="text-emerald-600 dark:text-emerald-300 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-black text-slate-800 dark:text-slate-100">
                    {estimate.label}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {estimate.eta_days === 0
                        ? "Mismo día"
                        : estimate.eta_days === 1
                        ? "Mañana"
                        : `~${estimate.eta_days} días`}
                    </span>
                    <span>·</span>
                    <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                      {estimate.cost === 0
                        ? "GRATIS"
                        : formatMoney(estimate.cost)}
                    </span>
                  </p>
                  {estimate.instructions && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-1 leading-snug">
                      {estimate.instructions}
                    </p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

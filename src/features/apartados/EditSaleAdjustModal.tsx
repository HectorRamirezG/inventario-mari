import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createPortal } from "react-dom"
import {
  X,
  Loader2,
  Tag,
  Wallet,
  Send,
  Sparkles,
  AlertCircle,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { sound } from "../../lib/sound"
import { formatMoney } from "../../lib/format"
import type { Sale } from "../../types/database"

interface Props {
  open: boolean
  sale: Sale | null
  onClose: () => void
  onSaved: () => void
}

type TierForce = "" | "menudeo" | "medio" | "mayoreo"

/**
 * Modal de admin para ajustar un ticket existente:
 *   - Forzar un tier global (recalcula precios desde la tabla variants)
 *   - Aplicar un ajuste manual al total (descuento por lealtad, etc.)
 *
 * Llama la RPC `admin_adjust_sale` que:
 *   - Valida que sea admin/staff
 *   - Recalcula items + total + balance
 *   - Inserta una notificación al cliente (price_adjusted)
 */
export default function EditSaleAdjustModal({
  open,
  sale,
  onClose,
  onSaved,
}: Props) {
  const [forceTier, setForceTier] = useState<TierForce>("")
  const [adjustment, setAdjustment] = useState<number | "">("")
  const [adjustSign, setAdjustSign] = useState<"discount" | "charge">("discount")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForceTier("")
    const initialAdj = sale?.adjustment_amount ? Number(sale.adjustment_amount) : 0
    setAdjustSign(initialAdj < 0 ? "charge" : "discount")
    setAdjustment(initialAdj !== 0 ? Math.abs(initialAdj) : "")
    setReason(sale?.adjustment_reason ?? "")
  }, [open, sale])

  async function handleSave() {
    if (!sale) return
    if (adjustment !== "" && Number(adjustment) < 0) {
      toast.error("Escribe sólo el monto. Usa el selector arriba para sumar o restar.")
      return
    }
    setSaving(true)
    const tid = toast.loading("Aplicando ajuste...")
    try {
      // Signed: discount → positivo, charge → negativo
      const signed = adjustment === "" ? 0 :
        (adjustSign === "discount" ? Number(adjustment) : -Number(adjustment))
      const { data, error } = await supabase.rpc("admin_adjust_sale", {
        p_sale_id: sale.id,
        p_adjustment: signed,
        p_reason: reason.trim() || null,
        p_force_tier: forceTier || null,
      })
      if (error) throw error
      sound.success()
      const savings = (data as any)?.savings ?? 0
      toast.success(
        savings > 0
          ? `✓ Cliente ahorra ${formatMoney(savings)}`
          : savings < 0
          ? `✓ Cargo extra +${formatMoney(Math.abs(savings))}`
          : "✓ Ticket actualizado",
        { id: tid }
      )
      onSaved()
      onClose()
    } catch (e: any) {
      sound.error()
      toast.error(e?.message ?? "No se pudo ajustar", { id: tid })
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === "undefined" || !sale) return null

  const currentTotal = Number(sale.total) || 0
  const signedAdj = adjustment === "" ? 0 :
    (adjustSign === "discount" ? Number(adjustment) : -Number(adjustment))
  const proyectedTotal = currentTotal - signedAdj
  const isCharge = adjustSign === "charge"

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[230] flex items-end md:items-center justify-center"
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={() => !saving && onClose()}
          />

          <motion.div
            initial={{ y: "100%", scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: "100%", scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] md:rounded-3xl shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[92vh] flex flex-col"
          >
            <div className="flex justify-center pt-2 pb-1 md:hidden">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-black tracking-tight">
                  Ajustar ticket
                </h3>
                <p className="text-[10px] text-slate-500 font-bold">
                  {sale.customer_name ?? "Cliente"} · Total actual:{" "}
                  <span className="font-black text-primary">
                    {formatMoney(currentTotal)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios space-y-5">
              {/* Forzar tier */}
              <section className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Tag size={10} /> Forzar nivel de precio
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["", "menudeo", "medio", "mayoreo"] as const).map((t) => (
                    <button
                      key={t || "none"}
                      type="button"
                      onClick={() => setForceTier(t)}
                      className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        forceTier === t
                          ? "bg-primary text-white shadow-bloom"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {t === "" ? "Sin cambio" : t}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {forceTier
                    ? `Los precios de todos los items se recalcularán al nivel "${forceTier}".`
                    : "No se cambiarán los precios unitarios."}
                </p>
              </section>

              {/* Descuento manual / Cargo extra */}
              <section className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Wallet size={10} /> Ajuste manual al total
                </label>

                {/* Toggle Descuento vs Cargo */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAdjustSign("discount")}
                    className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      adjustSign === "discount"
                        ? "bg-emerald-500 text-white shadow-[0_10px_30px_-8px_rgba(16,185,129,0.5)]"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    − Descuento
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustSign("charge")}
                    className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      adjustSign === "charge"
                        ? "bg-amber-500 text-white shadow-[0_10px_30px_-8px_rgba(245,158,11,0.5)]"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    + Cargo extra
                  </button>
                </div>

                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={adjustment}
                  onChange={(e) =>
                    setAdjustment(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="0.00"
                  className="settings-input text-lg font-black tabular-nums"
                />
                <p className="text-[10px] text-slate-500 leading-snug">
                  {isCharge
                    ? "Ej: $200 por envío de Uber, $150 por empaque especial."
                    : "Ej: $100 de descuento por pasar a mayoreo."}
                </p>
              </section>

              {/* Razón */}
              <section className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Sparkles size={10} /> Motivo (lo verá el cliente en su notificación)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Descuento por lealtad 💖"
                  maxLength={120}
                  className="settings-input"
                />
              </section>

              {/* Preview */}
              <div className={`rounded-2xl border p-3 ${
                isCharge
                  ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 dark:border-amber-500/30"
                  : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/30"
              }`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">
                    Total actual
                  </span>
                  <span className="font-black tabular-nums">
                    {formatMoney(currentTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-slate-600 dark:text-slate-300">
                    {isCharge ? "Cargo extra" : "Descuento"}
                  </span>
                  <span className={`font-black tabular-nums ${
                    isCharge ? "text-amber-700" : "text-rose-500"
                  }`}>
                    {isCharge ? "+" : "−"}{formatMoney(Number(adjustment) || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-base mt-2 pt-2 border-t border-slate-200/40">
                  <span className="font-bold">Nuevo total estimado</span>
                  <span className={`font-black tabular-nums ${
                    isCharge ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                  }`}>
                    {formatMoney(Math.max(0, proyectedTotal))}
                  </span>
                </div>
                {forceTier && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-2 flex items-center gap-1">
                    <AlertCircle size={10} />
                    Los precios unitarios también cambiarán al tier{" "}
                    <b>{forceTier}</b>; el total final puede variar.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full h-12 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Aplicar y notificar al cliente
              </button>
              <p className="text-[10px] text-center text-slate-400">
                Se enviará una notificación instantánea al cliente con el
                motivo del ajuste.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

import { useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  ScanLine,
  CheckCircle2,
  X,
  Loader2,
  Banknote,
  Package,
  User as UserIcon,
} from "lucide-react"
import toast from "react-hot-toast"

import BarcodeScanner from "../../components/ui/BarcodeScanner"
import { supabase } from "../../lib/supabase"
import {
  getPublicDeliveryNote,
  updateDeliveryStatus,
  type PublicDeliveryNote,
} from "./deliveryService"
import { addPayment } from "../apartados/apartadosService"
import { formatMoney } from "../../lib/format"
import { translateError } from "../../lib/supabaseErrors"
import { sound } from "../../lib/sound"
import { fireConfetti } from "../../lib/confetti"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"

/**
 * FAB de "Escanear para entregar" en DeliveriesAdminPage.
 *
 * Flujo:
 *   1. Mari toca el FAB → abre cámara (BarcodeScanner reusa html5-qrcode).
 *   2. Cliente muestra el QR de su ticket (/ticket/) o comanda (/comanda/).
 *   3. Extraemos el token del URL escaneado.
 *   4. Cargamos venta + comanda + items.
 *   5. Modal de confirmación: cliente + total + saldo + items.
 *      Si hay saldo: input "Cobrar en efectivo (sugerido)" pre-llenado.
 *   6. "✓ Entregar" hace: addPayment(saleId, monto) + updateDeliveryStatus(id, "delivered").
 *
 * Una sola acción → entregado + cobrado, todo desde el celular.
 */
export default function DeliveryScanFAB({
  onAfterDeliver,
}: {
  onAfterDeliver?: () => void
}) {
  const [openScanner, setOpenScanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scanned, setScanned] = useState<PublicDeliveryNote | null>(null)
  // Token de la delivery_note (lo necesitamos para updateDeliveryStatus
  // y para mostrarlo si el usuario quiere copiarlo).
  const [deliveryId, setDeliveryId] = useState<string | null>(null)
  const [collectAmount, setCollectAmount] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

  /** Extrae el token de un URL escaneado. Soporta:
   *  - https://app/comanda/<token>
   *  - https://app/ticket/<token>
   *  - solo <token> a pelo (32-64 chars alfanum) */
  function extractToken(scan: string): { kind: "comanda" | "ticket"; token: string } | null {
    const text = scan.trim()
    const comanda = text.match(/\/comanda\/([A-Za-z0-9_-]{8,})/i)
    if (comanda) return { kind: "comanda", token: comanda[1] }
    const ticket = text.match(/\/ticket\/([A-Za-z0-9_-]{8,})/i)
    if (ticket) return { kind: "ticket", token: ticket[1] }
    // Solo token: asumimos que es de comanda (uso más probable en admin)
    if (/^[A-Za-z0-9_-]{8,64}$/.test(text)) {
      return { kind: "comanda", token: text }
    }
    return null
  }

  async function handleScan(text: string): Promise<boolean> {
    const parsed = extractToken(text)
    if (!parsed) {
      toast.error("QR no reconocido · debe ser de ticket o comanda")
      return false
    }
    setLoading(true)
    try {
      let note: PublicDeliveryNote | null = null
      let dnId: string | null = null

      if (parsed.kind === "comanda") {
        note = await getPublicDeliveryNote(parsed.token)
        if (note) {
          // Resolvemos el ID de la delivery_note (la pública no lo trae directo)
          const { data: dn } = await supabase
            .from("delivery_notes")
            .select("id")
            .eq("public_token", parsed.token)
            .maybeSingle()
          dnId = (dn as any)?.id ?? null
        }
      } else {
        // /ticket/ → buscamos la venta por public_token, luego la comanda más reciente
        const { data: sale } = await supabase
          .from("sales")
          .select("id")
          .eq("public_token", parsed.token)
          .maybeSingle()
        const saleId = (sale as any)?.id as string | undefined
        if (saleId) {
          const { data: dn } = await supabase
            .from("delivery_notes")
            .select("id,public_token")
            .eq("sale_id", saleId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          const dnToken = (dn as any)?.public_token as string | undefined
          dnId = (dn as any)?.id ?? null
          if (dnToken) note = await getPublicDeliveryNote(dnToken)
        }
      }

      if (!note) {
        toast.error("No encontré comanda para ese código")
        return false
      }
      if (note.status === "delivered") {
        toast(`Esta comanda ya estaba entregada · ${note.customer.name ?? ""}`, {
          icon: "ℹ️",
        })
        return true
      }
      if (note.sale.status === "cancelled") {
        toast.error("Esa venta está cancelada · no se puede entregar")
        return true
      }
      setScanned(note)
      setDeliveryId(dnId)
      setCollectAmount(
        note.sale.balance > 0 ? String(note.sale.balance) : "",
      )
      sound.scan()
      return true
    } catch (e) {
      toast.error(translateError(e, "Error leyendo el código"))
      return false
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    if (!scanned || !deliveryId) return
    setSubmitting(true)
    try {
      // 1) Si queda saldo y la admin capturó un monto, registrar abono.
      const amt = Number(collectAmount) || 0
      if (amt > 0) {
        await addPayment(scanned.sale.id, amt, "efectivo")
      }
      // 2) Marcar entregado.
      await updateDeliveryStatus(deliveryId, "delivered")
      sound.success()
      fireConfetti({ duration: 1200, count: 50 })
      toast.success(
        amt > 0
          ? `Entregado a ${scanned.customer.name ?? "cliente"} · ${formatMoney(amt)} cobrado`
          : `Entregado a ${scanned.customer.name ?? "cliente"}`,
        { duration: 3500 },
      )
      setScanned(null)
      setDeliveryId(null)
      setCollectAmount("")
      onAfterDeliver?.()
    } catch (e) {
      toast.error(translateError(e, "No se pudo cerrar la entrega"))
    } finally {
      setSubmitting(false)
    }
  }

  function cancel() {
    setScanned(null)
    setDeliveryId(null)
    setCollectAmount("")
  }

  return (
    <>
      {/* FAB flotante en bottom-right */}
      <button
        type="button"
        onClick={() => setOpenScanner(true)}
        aria-label="Escanear QR para entregar"
        title="Escanear QR del cliente para entregar y cobrar"
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[120] w-14 h-14 rounded-full text-white shadow-bloom active:scale-90 transition-transform flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
        }}
      >
        {loading ? (
          <Loader2 size={22} className="animate-spin" />
        ) : (
          <ScanLine size={22} strokeWidth={2.5} />
        )}
      </button>

      <BarcodeScanner
        open={openScanner}
        onClose={() => setOpenScanner(false)}
        onScan={(text) => {
          // Cerramos el scanner SOLO si la lectura fue válida.
          // (handleScan retorna true tanto en éxito como en errores
          // terminales para evitar loops infinitos de escaneo del
          // mismo QR.)
          void handleScan(text).then((ok) => ok && setOpenScanner(false))
          return false
        }}
      />

      {/* Sheet de confirmación */}
      <ConfirmDeliverySheet
        open={!!scanned}
        note={scanned}
        amount={collectAmount}
        onAmountChange={setCollectAmount}
        submitting={submitting}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </>
  )
}

/* ───────── Sheet de confirmación ───────── */

function ConfirmDeliverySheet({
  open,
  note,
  amount,
  onAmountChange,
  submitting,
  onConfirm,
  onCancel,
}: {
  open: boolean
  note: PublicDeliveryNote | null
  amount: string
  onAmountChange: (v: string) => void
  submitting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useBodyScrollLock(open)
  if (typeof document === "undefined") return null
  if (!note) return null
  const balance = Math.max(0, Number(note.sale.balance) || 0)
  const amt = Number(amount) || 0
  const willBePaid = balance <= 0 || amt >= balance

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={submitting ? undefined : onCancel}
            aria-hidden
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] pb-safe max-h-[88vh] flex flex-col shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.45)]"
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            <div className="flex items-start justify-between px-5 pb-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-black leading-none">
                  Entrega rápida
                </p>
                <h3 className="text-lg font-black tracking-tight mt-1 flex items-center gap-1.5">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  Confirmar entrega
                </h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                aria-label="Cancelar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 press disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3 scroll-container-ios space-y-3">
              {/* Cliente */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden">
                  {note.customer.avatar_url ? (
                    <img
                      src={note.customer.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate">
                    {note.customer.name ?? "Cliente"}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    {note.customer.phone ?? note.customer.email ?? "—"}
                  </p>
                </div>
              </div>

              {/* Totales */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2 text-center">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none">
                    Total
                  </p>
                  <p className="text-sm font-black tabular-nums mt-1 leading-tight">
                    {formatMoney(note.sale.total)}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/15 p-2 text-center">
                  <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 leading-none">
                    Pagado
                  </p>
                  <p className="text-sm font-black tabular-nums mt-1 leading-tight text-emerald-700 dark:text-emerald-300">
                    {formatMoney(note.sale.paid)}
                  </p>
                </div>
                <div
                  className={`rounded-xl p-2 text-center ${
                    balance > 0
                      ? "bg-amber-50 dark:bg-amber-500/15"
                      : "bg-slate-50 dark:bg-slate-800/60"
                  }`}
                >
                  <p
                    className={`text-[8px] font-black uppercase tracking-widest leading-none ${
                      balance > 0
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-slate-400"
                    }`}
                  >
                    Falta
                  </p>
                  <p
                    className={`text-sm font-black tabular-nums mt-1 leading-tight ${
                      balance > 0
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-slate-500"
                    }`}
                  >
                    {formatMoney(balance)}
                  </p>
                </div>
              </div>

              {/* Cobrar en efectivo */}
              {balance > 0 && (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-3">
                  <label className="block">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-1.5">
                      <Banknote size={12} />
                      Cobrar al entregar (efectivo)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={amount}
                      onChange={(e) => onAmountChange(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-11 px-3 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-white dark:bg-slate-900 text-base font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </label>
                  <div className="flex gap-1.5 mt-2">
                    <button
                      type="button"
                      onClick={() => onAmountChange(String(balance))}
                      className="flex-1 h-8 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[10px] font-black uppercase tracking-widest press"
                    >
                      Total {formatMoney(balance)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onAmountChange("0")}
                      className="h-8 px-3 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest press"
                    >
                      Solo entregar
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-700/80 dark:text-amber-300/70 mt-2 leading-snug">
                    {willBePaid
                      ? "Después de este cobro, el pedido queda liquidado ✨"
                      : `Quedará pendiente ${formatMoney(balance - amt)}`}
                  </p>
                </div>
              )}

              {/* Items resumen */}
              {note.items && note.items.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                    Productos a entregar
                  </p>
                  {note.items.slice(0, 6).map((it, i) => (
                    <div
                      key={`item-${i}`}
                      className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60"
                    >
                      <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900/40 overflow-hidden flex items-center justify-center text-slate-300 shrink-0">
                        {it.image ? (
                          <img
                            src={it.image}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package size={14} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black truncate">
                          {it.name}
                        </p>
                        {it.variant_name && (
                          <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                            {it.variant_name}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] font-black tabular-nums text-primary shrink-0">
                        ×{it.qty}
                      </span>
                    </div>
                  ))}
                  {note.items.length > 6 && (
                    <p className="text-[10px] text-slate-400 text-center">
                      +{note.items.length - 6} producto(s) más
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black uppercase tracking-widest press disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={submitting}
                className="flex-[1.5] h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-bloom disabled:opacity-60 press-hard"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    {amt > 0
                      ? `Entregar · cobrar ${formatMoney(amt)}`
                      : "Marcar entregado"}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

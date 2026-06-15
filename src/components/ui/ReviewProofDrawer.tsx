import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, PanInfo } from "framer-motion"
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Maximize2,
  Wallet,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { sound } from "../../lib/sound"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import {
  approveProof,
  rejectProof,
  type PaymentProof,
} from "../../features/payments/paymentProofsService"
import Skeleton from "./Skeleton"

interface Props {
  open: boolean
  proofId: string | null
  onClose: () => void
  onReviewed?: () => void
}

interface SaleLite {
  id: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  public_token: string | null
  created_at: string
}

/**
 * Cortina admin para revisar un comprobante: foto grande + datos del
 * pedido + un botón "Aprobar y abonar" que llama la RPC y notifica al
 * cliente automáticamente.
 */
export default function ReviewProofDrawer({
  open,
  proofId,
  onClose,
  onReviewed,
}: Props) {
  const [proof, setProof] = useState<PaymentProof | null>(null)
  const [sale, setSale] = useState<SaleLite | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [amountInput, setAmountInput] = useState<number | "">("")
  const [methodInput, setMethodInput] = useState("transferencia")
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!open || !proofId) return
    let alive = true
    setLoading(true)
    setProof(null)
    setSale(null)
    ;(async () => {
      const { data: p } = await supabase
        .from("payment_proofs")
        .select("*")
        .eq("id", proofId)
        .maybeSingle()
      if (!alive) return
      if (!p) {
        toast.error("Comprobante no encontrado")
        setLoading(false)
        onClose()
        return
      }
      setProof(p as PaymentProof)
      setAmountInput(Number((p as PaymentProof).amount) || "")
      setMethodInput((p as PaymentProof).method || "transferencia")

      const { data: s } = await supabase
        .from("sales")
        .select(
          "id,customer_name,customer_email,customer_phone,total,paid,balance,status,is_layaway,public_token,created_at"
        )
        .eq("id", (p as PaymentProof).sale_id)
        .maybeSingle()
      if (!alive) return
      setSale((s as SaleLite) ?? null)
      setAmountInput((prev) => {
        if (prev) return prev
        const bal = Number((s as any)?.balance) || 0
        return bal > 0 ? bal : Number((p as PaymentProof).amount) || ""
      })
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [open, proofId, onClose])

  // Bloquear scroll body
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false)
        else onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose, fullscreen])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  async function handleApprove() {
    if (!proof) return
    if (!amountInput || Number(amountInput) <= 0) {
      toast.error("Indica el monto a abonar")
      return
    }
    setSaving(true)
    const tid = toast.loading("Aprobando y registrando abono...")
    try {
      await approveProof(proof.id, Number(amountInput), methodInput)
      sound.success()
      toast.success("✓ Aprobado · cliente notificado", { id: tid })
      onReviewed?.()
      onClose()
    } catch (e: any) {
      sound.error()
      toast.error(e?.message ?? "No se pudo aprobar", { id: tid })
    } finally {
      setSaving(false)
    }
  }

  async function handleReject() {
    if (!proof) return
    const reason =
      window.prompt(
        "Motivo del rechazo (opcional, el cliente lo verá):",
        "El monto no coincide con tu apartado."
      ) ?? undefined
    setSaving(true)
    const tid = toast.loading("Rechazando comprobante...")
    try {
      await rejectProof(proof.id, reason)
      toast.success("Rechazado · cliente notificado", { id: tid })
      onReviewed?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo rechazar", { id: tid })
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[240] flex items-end md:items-center justify-center"
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
            onClick={() => !saving && onClose()}
          />

          <motion.div
            initial={{ y: "100%", scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: "100%", scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-[2rem] md:rounded-3xl shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.45)] max-h-[94vh] flex flex-col touch-pan-y"
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1 md:hidden">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-amber-600 dark:text-amber-400 font-black">
                  Comprobante recibido
                </p>
                <h3 className="text-base font-black tracking-tight">
                  {sale ? shortId(sale.id) : "Cargando..."}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 active:scale-90"
              >
                <X size={14} />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-5 pb-6 scroll-container-ios space-y-4">
              {loading && (
                <>
                  <Skeleton className="w-full aspect-video" rounded="xl" />
                  <Skeleton className="h-4 w-3/4" rounded="md" />
                  <Skeleton className="h-3 w-1/2" rounded="md" />
                  <Skeleton className="h-12 w-full" rounded="xl" />
                </>
              )}

              {!loading && proof && (
                <>
                  {/* Foto del comprobante */}
                  <div className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img
                      src={proof.image_url}
                      alt="Comprobante"
                      className="w-full max-h-80 object-contain"
                      loading="eager"
                    />
                    <button
                      type="button"
                      onClick={() => setFullscreen(true)}
                      className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center"
                      title="Ver en pantalla completa"
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>

                  {/* Datos del cliente + venta */}
                  {sale && (
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black">
                            Cliente
                          </p>
                          <p className="text-sm font-black">
                            {sale.customer_name ?? "—"}
                          </p>
                          {sale.customer_email && (
                            <p className="text-[10px] text-slate-500">
                              {sale.customer_email}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black">
                            Fecha
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {formatDateTime(sale.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700">
                        <Kpi
                          label="Total"
                          value={formatMoney(sale.total)}
                          tone="slate"
                        />
                        <Kpi
                          label="Pagado"
                          value={formatMoney(sale.paid)}
                          tone="emerald"
                        />
                        <Kpi
                          label="Pendiente"
                          value={formatMoney(sale.balance)}
                          tone={sale.balance > 0 ? "rose" : "emerald"}
                        />
                      </div>

                      <a
                        href={`/ticket/${sale.public_token ?? sale.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white dark:bg-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 mt-1"
                      >
                        Ver ticket completo
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  )}

                  {/* Status badges */}
                  {proof.status !== "pending" && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                        proof.status === "approved"
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {proof.status === "approved" ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <XCircle size={14} />
                      )}
                      <span className="text-xs font-black uppercase tracking-widest">
                        {proof.status === "approved" ? "Ya aprobado" : "Rechazado"}
                      </span>
                    </div>
                  )}

                  {/* Form de aprobación */}
                  {proof.status === "pending" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                            Monto a abonar
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={amountInput}
                            onChange={(e) =>
                              setAmountInput(
                                e.target.value === "" ? "" : Number(e.target.value)
                              )
                            }
                            className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-black tabular-nums outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                            Método
                          </label>
                          <select
                            value={methodInput}
                            onChange={(e) => setMethodInput(e.target.value)}
                            className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold outline-none focus:border-primary"
                          >
                            <option value="transferencia">Transferencia</option>
                            <option value="mercadopago">Mercado Pago</option>
                            <option value="efectivo">Efectivo</option>
                            <option value="otro">Otro</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleApprove}
                          disabled={saving}
                          className="flex-1 h-12 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_10px_30px_-8px_rgba(16,185,129,0.5)] disabled:opacity-50"
                          style={{
                            background:
                              "linear-gradient(135deg,#10b981,#34d399)",
                          }}
                        >
                          {saving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Wallet size={14} />
                          )}
                          Aprobar y abonar
                        </button>
                        <button
                          type="button"
                          onClick={handleReject}
                          disabled={saving}
                          className="h-12 px-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <XCircle size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Fullscreen image */}
            {fullscreen && proof && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setFullscreen(false)}
                className="fixed inset-0 z-[260] bg-black/95 flex items-center justify-center p-4"
              >
                <img
                  src={proof.image_url}
                  alt="Comprobante grande"
                  className="max-w-full max-h-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => setFullscreen(false)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 backdrop-blur text-white flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "rose" | "emerald" | "slate"
}) {
  const cls = {
    rose: "text-rose-600",
    emerald: "text-emerald-600",
    slate: "text-slate-700 dark:text-slate-200",
  }[tone]
  return (
    <div className="text-center">
      <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black">
        {label}
      </p>
      <p className={`text-xs font-black tabular-nums ${cls}`}>{value}</p>
    </div>
  )
}

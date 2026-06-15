import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { Camera, Upload, Loader2, CheckCircle2, X } from "lucide-react"
import toast from "react-hot-toast"

import {
  uploadPaymentProof,
  type PaymentProof,
} from "../../features/payments/paymentProofsService"
import { sound } from "../../lib/sound"
import { formatMoney } from "../../lib/format"

interface Props {
  saleId: string
  balance: number
  customerEmail?: string | null
  onUploaded?: (proof: PaymentProof) => void
}

/**
 * Botón compacto que el cliente toca dentro de su ticket para reportar
 * un pago. Abre la cámara directo (mobile) o file picker (desktop),
 * sube la foto y registra el comprobante. El admin recibe notificación
 * accionable de inmediato.
 */
export default function ReportPaymentButton({
  saleId,
  balance,
  customerEmail,
  onUploaded,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [askAmount, setAskAmount] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [amount, setAmount] = useState<number | "">(balance > 0 ? balance : "")
  const [method, setMethod] = useState("transferencia")
  const inputRef = useRef<HTMLInputElement>(null)

  function onFileChosen(file: File | undefined) {
    if (!file) return
    setPendingFile(file)
    setAmount(balance > 0 ? balance : "")
    setAskAmount(true)
  }

  async function confirmUpload() {
    if (!pendingFile) return
    if (!amount || Number(amount) <= 0) {
      toast.error("Indica el monto pagado")
      return
    }
    setBusy(true)
    const tid = toast.loading("Subiendo comprobante...")
    try {
      const proof = await uploadPaymentProof({
        saleId,
        file: pendingFile,
        amount: Number(amount),
        method,
        customerEmail: customerEmail ?? null,
      })
      sound.success()
      toast.success("✓ Comprobante enviado a Mari", { id: tid })
      setAskAmount(false)
      setPendingFile(null)
      onUploaded?.(proof)
    } catch (e: any) {
      sound.error()
      toast.error(e?.message ?? "No se pudo subir", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  if (askAmount && pendingFile) {
    const previewUrl = URL.createObjectURL(pendingFile)
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
            Confirma tu comprobante
          </p>
          <button
            type="button"
            onClick={() => {
              setAskAmount(false)
              setPendingFile(null)
              URL.revokeObjectURL(previewUrl)
            }}
            className="w-6 h-6 rounded-full bg-white/80 dark:bg-slate-800 flex items-center justify-center text-slate-500"
          >
            <X size={11} />
          </button>
        </div>
        <img
          src={previewUrl}
          alt="Comprobante"
          className="w-full max-h-40 object-contain rounded-xl bg-white"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">
              Monto pagado
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black tabular-nums outline-none focus:border-primary"
            />
            {balance > 0 && (
              <p className="text-[9px] text-slate-500 mt-0.5">
                Saldo: {formatMoney(balance)}
              </p>
            )}
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">
              Método
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold outline-none focus:border-primary"
            >
              <option value="transferencia">Transferencia</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="efectivo">Efectivo</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={confirmUpload}
          disabled={busy}
          className="w-full h-11 rounded-xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#10b981,#34d399)" }}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          Enviar a Mari para validar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="cursor-pointer h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
          <Camera size={12} />
          Tomar foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={busy}
            onChange={(e) => onFileChosen(e.target.files?.[0])}
          />
        </label>
        <label className="cursor-pointer h-11 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
          <Upload size={12} />
          Galería
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => onFileChosen(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="text-[9px] text-center text-slate-500 dark:text-slate-400 leading-tight">
        ¿Ya pagaste? Sube tu comprobante y Mari lo validará al instante 💖
      </p>
    </div>
  )
}

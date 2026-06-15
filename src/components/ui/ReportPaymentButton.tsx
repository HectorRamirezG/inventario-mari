import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  Camera,
  Upload,
  Loader2,
  CheckCircle2,
  X,
  ShieldCheck,
  ImageIcon,
  Clock,
  Receipt,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  uploadPaymentProof,
  listProofsForSale,
  type PaymentProof,
} from "../../features/payments/paymentProofsService"
import { sound } from "../../lib/sound"
import { formatMoney } from "../../lib/format"
import BankAccountCard from "./BankAccountCard"

interface Props {
  saleId: string
  balance: number
  customerEmail?: string | null
  onUploaded?: (proof: PaymentProof) => void
}

/**
 * Botón para que el cliente reporte un pago: abre cámara/galería, sube
 * la foto y registra el comprobante. El admin recibe notificación
 * accionable de inmediato. Debajo se muestra el historial de comprobantes
 * subidos para esta venta.
 *
 * UX: el monto SIEMPRE empieza vacío para forzar al cliente a escribir
 * la cantidad real (evita enviar montos sugeridos por error).
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
  // 🔒 monto SIEMPRE empieza vacío — no prellenamos balance ni nada
  const [amount, setAmount] = useState<number | "">("")
  const [method, setMethod] = useState("transferencia")
  const inputRef = useRef<HTMLInputElement>(null)

  // Historial de proofs para esta venta (visible en la parte inferior)
  const [history, setHistory] = useState<PaymentProof[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const refreshHistory = async () => {
    setLoadingHistory(true)
    try {
      setHistory(await listProofsForSale(saleId))
    } finally {
      setLoadingHistory(false)
    }
  }
  useEffect(() => {
    refreshHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId])

  function onFileChosen(file: File | undefined) {
    if (!file) return
    setPendingFile(file)
    setAmount("") // 🔒 reset SIEMPRE a vacío al elegir nueva foto
    setAskAmount(true)
  }

  async function confirmUpload() {
    if (!pendingFile) return
    if (!amount || Number(amount) <= 0) {
      toast.error("Escribe el monto exacto del comprobante")
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
      setAmount("")
      await refreshHistory()
      onUploaded?.(proof)
    } catch (e: any) {
      sound.error()
      // Mostramos error legible (típico: violación RLS o tamaño)
      const friendly =
        /row-level security/i.test(e?.message ?? "")
          ? "Permiso denegado por el servidor. Avísale a Mari por WhatsApp."
          : e?.message ?? "No se pudo subir"
      toast.error(friendly, { id: tid })
    } finally {
      setBusy(false)
    }
  }

  // Vista: confirmar comprobante (con preview)
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
              setAmount("")
              URL.revokeObjectURL(previewUrl)
            }}
            className="w-6 h-6 rounded-full bg-white/80 dark:bg-slate-800 flex items-center justify-center text-slate-500"
            aria-label="Cancelar"
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
              Monto pagado *
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              autoFocus
              inputMode="decimal"
              placeholder="0.00"
              className="w-full h-10 px-3 rounded-xl border-2 border-amber-300 bg-white dark:bg-slate-800 text-sm font-black tabular-nums outline-none focus:border-primary placeholder:text-slate-300"
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

        <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-snug">
          ⚠️ Escribe la cantidad <b>exacta</b> que aparece en tu captura,
          tal cual la enviaste. Mari lo revisará y abonará tu saldo.
        </p>

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

  // Vista normal: botones para subir + microtexto destacado + historial
  return (
    <div className="space-y-3">
      {/* Datos bancarios copiables (sólo si Mari los configuró) */}
      <BankAccountCard />

      <div className="rounded-2xl border-2 border-dashed border-amber-300/80 bg-gradient-to-br from-amber-50 to-pink-50/50 dark:from-amber-500/10 dark:to-pink-500/10 p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-white flex items-center justify-center shrink-0 shadow-bloom">
            <ImageIcon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-amber-900 dark:text-amber-200 leading-tight">
              ¿Ya pagaste? Sube tu comprobante
            </p>
            <p className="text-[10px] text-amber-800/80 dark:text-amber-200/70 leading-snug mt-0.5">
              Sube aquí la captura de tu transferencia o depósito para que
              <b> Mari valide tu pago</b> y actualice tu saldo en tiempo real 💖
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="cursor-pointer h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-transform shadow-bloom">
            <Camera size={13} />
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
          <label className="cursor-pointer h-12 rounded-xl bg-white dark:bg-slate-800 border-2 border-amber-300 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
            <Upload size={13} />
            Desde galería
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

        <p className="text-[9px] text-center text-amber-700/80 dark:text-amber-200/70 mt-2 flex items-center justify-center gap-1">
          <ShieldCheck size={10} /> Tu comprobante se envía cifrado y solo Mari
          lo verá.
        </p>
      </div>

      {/* HISTORIAL */}
      <ProofsHistory items={history} loading={loadingHistory} />
    </div>
  )
}

/* ──────────── Historial de comprobantes (parte inferior) ──────────── */
function ProofsHistory({
  items,
  loading,
}: {
  items: PaymentProof[]
  loading: boolean
}) {
  if (loading) return null
  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 px-1">
        <Receipt size={10} /> Comprobantes enviados ({items.length})
      </p>
      <div className="space-y-1.5">
        {items.map((p) => (
          <ProofRow key={p.id} proof={p} />
        ))}
      </div>
    </div>
  )
}

function ProofRow({ proof }: { proof: PaymentProof }) {
  const tone =
    proof.status === "approved"
      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 text-emerald-700 dark:text-emerald-300"
      : proof.status === "rejected"
      ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200/60 text-rose-700 dark:text-rose-300"
      : "bg-amber-50 dark:bg-amber-500/10 border-amber-200/60 text-amber-700 dark:text-amber-300"
  const label =
    proof.status === "approved"
      ? "Aprobado"
      : proof.status === "rejected"
      ? "Rechazado"
      : "Esperando validación"
  const when = new Date(proof.created_at).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  return (
    <a
      href={proof.image_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${tone} hover:brightness-105 transition-all active:scale-[0.99]`}
      title="Ver comprobante"
    >
      <img
        src={proof.image_url}
        alt="Comprobante"
        loading="lazy"
        className="w-10 h-10 rounded-lg object-cover bg-white shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest truncate">
            {label}
          </p>
          {proof.amount != null && proof.amount > 0 && (
            <p className="text-xs font-black tabular-nums shrink-0">
              {formatMoney(Number(proof.amount))}
            </p>
          )}
        </div>
        <p className="text-[9px] opacity-80 flex items-center gap-1 truncate">
          <Clock size={9} /> {when}
          {proof.method && <span className="ml-1">· {proof.method}</span>}
        </p>
      </div>
    </a>
  )
}

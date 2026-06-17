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
  Banknote,
  Send,
  AlertCircle,
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
  /**
   * Modo compacto: oculta el historial interno y los banners de estado.
   * Útil cuando el componente vive dentro de una pestaña dedicada y el
   * contenedor ya muestra esa información por separado.
   */
  compact?: boolean
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
  compact = false,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [askAmount, setAskAmount] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  // 🔒 monto SIEMPRE empieza vacío — no prellenamos balance ni nada
  const [amount, setAmount] = useState<number | "">("")
  const [method, setMethod] = useState("transferencia")
  const inputRef = useRef<HTMLInputElement>(null)

  // Validación estricta de UUID — bloquea CUALQUIER request con sale_id
  // inválido (undefined/null/"undefined"/cadenas malformadas).
  // Sin esto, listProofsForSale dispara `?sale_id=eq.undefined` → 400
  // y uploadPaymentProof inserta sale_id NULL → viola NOT NULL.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const validSaleId = typeof saleId === "string" && UUID_RE.test(saleId)

  // Historial de proofs para esta venta (visible en la parte inferior)
  const [history, setHistory] = useState<PaymentProof[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const refreshHistory = async () => {
    if (!validSaleId) {
      setHistory([])
      setLoadingHistory(false)
      return
    }
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
    if (!validSaleId) {
      toast.error("No se pudo identificar la venta. Recarga la página.")
      return
    }
    setPendingFile(file)
    setAmount("") // 🔒 reset SIEMPRE a vacío al elegir nueva foto
    setAskAmount(true)
  }

  async function confirmUpload() {
    if (!validSaleId) {
      toast.error("Venta no identificada — recarga la página")
      return
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Escribe el monto exacto")
      return
    }
    // Para efectivo permitimos pendingFile = null
    if (method !== "efectivo" && !pendingFile) {
      toast.error("Sube tu comprobante o cambia a Efectivo")
      return
    }
    setBusy(true)
    const tid = toast.loading(
      method === "efectivo" && !pendingFile
        ? "Registrando pago en efectivo..."
        : "Subiendo comprobante..."
    )
    try {
      const proof = await uploadPaymentProof({
        saleId,
        file: pendingFile,
        amount: Number(amount),
        method,
        customerEmail: customerEmail ?? null,
      })
      sound.success()
      toast.success(
        method === "efectivo"
          ? "✓ Pago en efectivo registrado · Mari lo confirmará"
          : "✓ Comprobante enviado a Mari",
        { id: tid }
      )
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
  if (askAmount) {
    const previewUrl = pendingFile ? URL.createObjectURL(pendingFile) : null
    const isCash = method === "efectivo"
    return (
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
            {isCash ? "Confirma tu pago en efectivo" : "Confirma tu comprobante"}
          </p>
          <button
            type="button"
            onClick={() => {
              setAskAmount(false)
              setPendingFile(null)
              setAmount("")
              if (previewUrl) URL.revokeObjectURL(previewUrl)
            }}
            className="w-6 h-6 rounded-full bg-white/80 dark:bg-slate-800 flex items-center justify-center text-slate-500"
            aria-label="Cancelar"
          >
            <X size={11} />
          </button>
        </div>

        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Comprobante"
            className="w-full max-h-40 object-contain rounded-xl bg-white"
          />
        ) : isCash ? (
          <div className="py-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Banknote size={20} />
            <p className="text-[11px] font-black uppercase tracking-widest">
              Pago en efectivo
            </p>
          </div>
        ) : null}

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
              <button
                type="button"
                onClick={() => setAmount(Number(balance.toFixed(2)))}
                className="w-full mt-1 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/15 hover:bg-amber-200 text-amber-800 dark:text-amber-300 text-[9px] font-black uppercase tracking-widest active:scale-95 transition-transform"
                title="Auto-rellena con el saldo exacto"
              >
                💸 Pago total: {formatMoney(balance)}
              </button>
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
          {isCash
            ? "⚠️ Indica el monto exacto que entregarás/entregaste en efectivo. Mari lo confirmará al recibirlo."
            : "⚠️ Escribe la cantidad exacta que aparece en tu captura, tal cual la enviaste. Mari lo revisará y abonará tu saldo."}
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
          ) : isCash ? (
            <Send size={14} />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {isCash ? "Registrar pago en efectivo" : "Enviar a Mari para validar"}
        </button>
      </div>
    )
  }

  // Vista normal: botón grande para efectivo + dos botones de foto + historial
  // Estado del comprobante más reciente (si existe) para mostrar banner arriba.
  // Casteamos a string en el comparator porque el tipo del status puede ser
  // serializado por la DB con un valor extendido ("pending_verification" para
  // pagos en efectivo declarados) y queremos tratarlos igual que "pending".
  const lastPending = history.find((p) => {
    const s = String(p.status)
    return s === "pending" || s === "pending_verification"
  })
  const lastApproved = history.find((p) => p.status === "approved")
  const lastRejected = history.find((p) => p.status === "rejected")

  return (
    <div className="space-y-3">
      {/* BANNER DE ESTADO — el cliente NUNCA debe pensar 'no se envió' */}
      {!compact && lastPending && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-500/15 dark:to-yellow-500/15 border-2 border-amber-300 dark:border-amber-500/40 p-3 flex items-start gap-2.5"
        >
          <div className="relative w-9 h-9 rounded-xl bg-amber-400 text-white flex items-center justify-center shrink-0 shadow-bloom">
            <Loader2 size={16} className="animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-amber-800 dark:text-amber-200 leading-tight">
              {lastPending.method === "efectivo"
                ? "Pago en efectivo declarado · Mari lo confirmará al recibirlo"
                : "Comprobante enviado · Mari lo está validando"}
            </p>
            <p className="text-[10px] font-bold text-amber-700/80 dark:text-amber-200/70 leading-snug mt-0.5">
              {lastPending.amount && lastPending.amount > 0
                ? `Monto: ${formatMoney(Number(lastPending.amount))} · `
                : ""}
              Recibirás una notificación cuando se apruebe.
            </p>
          </div>
        </motion.div>
      )}

      {!compact && !lastPending && lastApproved && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-200 dark:border-emerald-500/40 p-3 flex items-center gap-2.5"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-emerald-800 dark:text-emerald-200 leading-tight">
              Pago aprobado por Mari
            </p>
            <p className="text-[10px] font-bold text-emerald-700/80 dark:text-emerald-200/70 leading-tight mt-0.5">
              {formatMoney(Number(lastApproved.amount) || 0)} ·{" "}
              {lastApproved.method ?? "—"}
            </p>
          </div>
        </motion.div>
      )}

      {!compact && !lastPending && !lastApproved && lastRejected && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-200 dark:border-rose-500/40 p-3 flex items-start gap-2.5"
        >
          <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
            <AlertCircle size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-rose-800 dark:text-rose-200 leading-tight">
              Tu pago anterior fue rechazado
            </p>
            {lastRejected.rejection_reason && (
              <p className="text-[10px] font-bold text-rose-700/80 dark:text-rose-200/70 leading-snug mt-0.5">
                Motivo: {lastRejected.rejection_reason}
              </p>
            )}
            <p className="text-[10px] font-bold text-rose-700/80 dark:text-rose-200/70 leading-snug mt-0.5">
              Vuelve a enviar el comprobante o cambia el método abajo.
            </p>
          </div>
        </motion.div>
      )}

      {/* HISTORIAL — ahora arriba para que se vea sin scroll */}
      {!compact && <ProofsHistory items={history} loading={loadingHistory} />}

      {/* OPCIÓN 1: Pago en EFECTIVO (un toque) */}
      <button
        type="button"
        onClick={() => {
          setPendingFile(null)
          setMethod("efectivo")
          setAmount("")
          setAskAmount(true)
        }}
        className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 hover:bg-emerald-50 active:scale-[0.99] transition-all text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-bloom">
          <Banknote size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-emerald-800 dark:text-emerald-200 leading-tight">
            Pagaré en efectivo
          </p>
          <p className="text-[10px] text-emerald-700/80 dark:text-emerald-200/70 leading-snug mt-0.5">
            Solo confirma el monto, no necesitas subir foto.
          </p>
        </div>
      </button>

      {/* OPCIÓN 2: Subir comprobante (transferencia / mercadopago) */}
      <div className="rounded-2xl border-2 border-dashed border-amber-300/80 bg-gradient-to-br from-amber-50 to-pink-50/50 dark:from-amber-500/10 dark:to-pink-500/10 p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-white flex items-center justify-center shrink-0 shadow-bloom">
            <ImageIcon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-amber-900 dark:text-amber-200 leading-tight">
              Pagué por transferencia o Mercado Pago
            </p>
            <p className="text-[10px] text-amber-800/80 dark:text-amber-200/70 leading-snug mt-0.5">
              Sube la captura de tu transferencia para que
              <b> Mari valide tu pago</b>.
            </p>
          </div>
        </div>

        {/* Datos bancarios copiables (sólo si Mari los configuró) */}
        <div className="mb-3">
          <BankAccountCard />
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
    </div>
  )
}

/* ──────────── Historial de comprobantes (parte inferior) ──────────── */
export function ProofsHistory({
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
  const isCash = proof.method === "efectivo"
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

  const Wrapper: any = proof.image_url ? "a" : "div"
  const wrapperProps = proof.image_url
    ? {
        href: proof.image_url,
        target: "_blank",
        rel: "noopener noreferrer",
        title: "Ver comprobante",
      }
    : {}

  return (
    <div className="space-y-1">
      <Wrapper
        {...wrapperProps}
        className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${tone} hover:brightness-105 transition-all ${proof.image_url ? "active:scale-[0.99]" : ""}`}
      >
        {proof.image_url ? (
          <img
            src={proof.image_url}
            alt="Comprobante"
            loading="lazy"
            className="w-10 h-10 rounded-lg object-cover bg-white shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center shrink-0">
            <Banknote size={16} className="text-emerald-600" />
          </div>
        )}
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
            {isCash && !proof.image_url && (
              <span className="ml-1 italic">(sin foto)</span>
            )}
          </p>
        </div>
      </Wrapper>
      {/* Motivo de rechazo (siempre visible si existe) */}
      {proof.status === "rejected" && proof.rejection_reason && (
        <div className="flex items-start gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 text-rose-700 dark:text-rose-300">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          <p className="text-[10px] font-bold leading-snug">
            <span className="uppercase tracking-widest font-black text-[8px] block opacity-80">
              Motivo de Mari:
            </span>
            {proof.rejection_reason}
          </p>
        </div>
      )}
    </div>
  )
}

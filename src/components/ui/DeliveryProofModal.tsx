import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, Trash2, X } from "lucide-react"
import toast from "react-hot-toast"

import Modal from "./Modal"
import { uploadDeliveryProof } from "../../features/delivery/deliveryService"

interface Props {
  open: boolean
  onClose: () => void
  /** Token público de la comanda (usado para path del storage). */
  token: string
  /** Callback al confirmar. Recibe la URL de la foto (o null si no
   *  subió) y la nota (vacío permitido). El padre llama al RPC. */
  onConfirm: (proof: { imageUrl: string | null; note: string }) => Promise<void>
}

/**
 * Modal de evidencia opcional antes de marcar "Entregado". El
 * repartidor puede:
 *  - Tomar/subir foto (cámara del cel)
 *  - Escribir nota corta ("Entregado al portero", "Dejado en buzón", etc.)
 *  - Saltarse ambos y confirmar igual
 *
 * Si la foto falla al subir (sin internet, bucket no listo) confirmamos
 * la entrega de todas formas con la nota — la entrega no debe bloquearse.
 */
export default function DeliveryProofModal({
  open,
  onClose,
  token,
  onConfirm,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Limpia el state al cerrar/abrir.
  useEffect(() => {
    if (!open) {
      setFile(null)
      setPreview(null)
      setNote("")
      setSubmitting(false)
    }
  }, [open])

  // Genera/limpia el preview cuando cambia file.
  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
    // reset para poder volver a seleccionar el mismo archivo
    e.target.value = ""
  }

  function clearFile() {
    setFile(null)
    setPreview(null)
  }

  async function handleConfirm() {
    // Doble-tap protection: si ya estamos enviando, ignorar otro click
    // (el botón ya tiene disabled, pero un tap muy rápido en el momento
    // exacto del state transition podría colar uno extra).
    if (submitting) return
    setSubmitting(true)
    let imageUrl: string | null = null
    try {
      if (file) {
        imageUrl = await uploadDeliveryProof(token, file)
        if (!imageUrl) {
          toast(
            "No subimos la foto pero igual confirmamos la entrega 💜",
            { duration: 2500 },
          )
        }
      }
      await onConfirm({ imageUrl, note: note.trim() })
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo confirmar")
      setSubmitting(false)
    }
  }

  // No permitir cerrar el modal mientras estamos subiendo / confirmando.
  // Evita que el usuario cierre y deje el upload "huérfano" mostrándose
  // un toast de éxito de una entrega que NO se confirmó.
  function safeClose() {
    if (submitting) return
    onClose()
  }

  return (
    <Modal open={open} title="Confirmar entrega" onClose={safeClose} size="sm">
      <div className="space-y-3">
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-snug">
          Opcionalmente toma una foto y/o escribe una nota corta como
          evidencia. Todo se guarda en la comanda.
        </p>

        {/* Foto */}
        {preview ? (
          <div className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800">
            <img
              src={preview}
              alt="Vista previa"
              className="w-full h-44 object-cover"
            />
            <button
              type="button"
              onClick={clearFile}
              aria-label="Quitar foto"
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow press"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-primary/60 text-slate-500 hover:text-primary flex flex-col items-center justify-center gap-1.5 press transition-colors"
          >
            <Camera size={20} />
            <span className="text-[11px] font-black uppercase tracking-widest">
              Tomar / subir foto
            </span>
            <span className="text-[10px] font-bold opacity-70">Opcional</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePick}
        />

        {/* Nota */}
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
            Nota (opcional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="Ej. Entregado al portero, paquete sellado, etc."
            rows={2}
            className="settings-input resize-none"
            maxLength={200}
          />
          <span className="text-[9px] text-slate-400 font-bold">
            {note.length}/200
          </span>
        </label>

        {/* Acciones */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={safeClose}
            disabled={submitting}
            className="flex-1 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black uppercase tracking-widest press disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-bloom press disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCircle2 size={13} />
            )}
            Confirmar entrega
          </button>
        </div>
      </div>
    </Modal>
  )
}

// `Trash2` viene importado por si Mari quiere variante "borrar foto antes
// de subir". Hoy se usa el X. Lo dejo importado para futuras iteraciones.
void Trash2
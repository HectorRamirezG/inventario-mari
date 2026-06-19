import { useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Camera,
  Send,
  Loader2,
  Image as ImageIcon,
  Trash2,
  LifeBuoy,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  SUPPORT_CATEGORIES,
  createSupportTicket,
  uploadSupportImage,
  type SupportCategory,
} from "./supportService"
import AnimatedCheckmark from "../../components/ui/AnimatedCheckmark"
import { useFeedback } from "../../lib/useFeedback"

interface Props {
  open: boolean
  saleId: string | null
  /** Datos pre-llenados (opcional) para mostrar al usuario en cabecera */
  customerName?: string | null
  onClose: () => void
}

export default function SupportModal({
  open,
  saleId,
  customerName,
  onClose,
}: Props) {
  const [category, setCategory] = useState<SupportCategory>("damaged")
  const [description, setDescription] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const { success: hapticSuccess, error: hapticError } = useFeedback()

  function reset() {
    setCategory("damaged")
    setDescription("")
    setFile(null)
    setPreview(null)
    setDone(false)
  }

  function handleFile(f: File | null) {
    if (!f) {
      setFile(null)
      setPreview(null)
      return
    }
    const isVideo = f.type.startsWith("video/")
    if (!f.type.startsWith("image/") && !isVideo) {
      toast.error("Solo imágenes o videos")
      return
    }
    const limit = isVideo ? 25 * 1024 * 1024 : 5 * 1024 * 1024
    if (f.size > limit) {
      toast.error(isVideo ? "El video pesa más de 25MB" : "La foto pesa más de 5MB")
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit() {
    if (description.trim().length < 3) {
      toast.error("Cuéntanos un poco más")
      hapticError()
      return
    }
    setSubmitting(true)
    try {
      let imageUrl: string | null = null
      if (file) {
        imageUrl = await uploadSupportImage({ saleId, file })
      }
      await createSupportTicket({
        saleId,
        category,
        description: description.trim(),
        imageUrl,
      })
      hapticSuccess()
      setDone(true)
      toast.success("Reporte enviado 💖")
      // Confetti suave de celebración (lazy import)
      import("../../lib/confetti")
        .then(({ fireConfetti }) =>
          fireConfetti({ count: 50, duration: 1400 }),
        )
        .catch(() => {})
      // Cierre automático suave
      setTimeout(() => {
        onClose()
        reset()
      }, 1800)
    } catch (e: any) {
      hapticError()
      toast.error(e?.message ?? "No se pudo enviar")
    } finally {
      setSubmitting(false)
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
          className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center"
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => !submitting && onClose()}
          />

          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] sm:rounded-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[92vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-bloom shrink-0"
                  style={{
                    background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                  }}
                >
                  <LifeBuoy size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                    Centro de soporte
                  </p>
                  <h2 className="text-base font-black truncate">
                    Hola{customerName ? `, ${customerName.split(" ")[0]}` : ""} ✨
                  </h2>
                  <p className="text-[10px] text-slate-500 font-bold leading-tight">
                    Cuéntanos qué pasa y te ayudamos.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !submitting && onClose()}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* CONTENIDO */}
            {done ? (
              /* Confirmación */
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center"
              >
                <AnimatedCheckmark size={84} tone="success" />
                <p className="text-base font-black mt-4 mb-1 text-slate-900 dark:text-slate-100">
                  ¡Recibido! 💖
                </p>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 max-w-xs">
                  Te contactaremos por WhatsApp lo antes posible para
                  ayudarte con tu caso.
                </p>
              </motion.div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-4 scroll-container-ios">
                {/* Categorías */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    ¿De qué se trata?
                  </p>
                  <div className="space-y-1.5">
                    {SUPPORT_CATEGORIES.map((cat) => {
                      const active = category === cat.id
                      return (
                        <motion.button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          whileTap={{ scale: 0.98 }}
                          className={`relative w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-2xl border-2 transition-colors ${
                            active
                              ? "border-primary bg-primary/5 shadow-bloom"
                              : "border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                          }`}
                        >
                          <span className="text-xl shrink-0">{cat.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-[12px] font-black truncate ${
                                active ? "text-primary" : "text-slate-700 dark:text-slate-200"
                              }`}
                            >
                              {cat.label}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 truncate">
                              {cat.hint}
                            </p>
                          </div>
                          {active && (
                            <motion.span
                              layoutId="support-cat-pill"
                              className="w-2 h-2 rounded-full bg-primary shrink-0"
                            />
                          )}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>

                {/* Descripción */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Cuéntanos un poco más
                  </p>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ej: La sombra llegó rota en la esquina superior derecha"
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none transition-all"
                  />
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 text-right">
                    {description.length}/500
                  </p>
                </div>

                {/* Foto opcional */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                    <ImageIcon size={11} /> Foto de evidencia
                    <span className="text-slate-400 font-bold lowercase italic">
                      · opcional
                    </span>
                  </p>

                  {preview ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
                      {file?.type.startsWith("video/") ? (
                        <video
                          src={preview}
                          className="w-full max-h-56 object-cover"
                          controls
                          playsInline
                          muted
                        />
                      ) : (
                        <img
                          src={preview}
                          alt="Evidencia"
                          className="w-full max-h-56 object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleFile(null)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg active:scale-90"
                        aria-label="Quitar foto"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                      />
                      <Camera size={18} className="text-slate-400" />
                      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                        Tomar / subir foto o video
                      </span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            {!done && (
              <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || description.trim().length < 3}
                  className="w-full h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 shadow-bloom disabled:opacity-40 active:scale-[0.98] transition-transform"
                  style={{
                    background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      Enviar reporte
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

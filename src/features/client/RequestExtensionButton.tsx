import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Clock4, Loader2, Send, X } from "lucide-react"
import toast from "react-hot-toast"
import { requestLayawayExtension } from "./layawayExtensionService"

interface Props {
  saleId: string
  customerName: string | null
  customerEmail: string | null
}

const OPTIONS = [3, 7, 14]

export default function RequestExtensionButton({
  saleId,
  customerName,
  customerEmail,
}: Props) {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<number>(7)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    setBusy(true)
    const tid = toast.loading("Enviando solicitud a Mari...")
    try {
      await requestLayawayExtension({
        saleId,
        customerName,
        customerEmail,
        daysRequested: days,
        reason: reason.trim() || null,
      })
      toast.success("Solicitud enviada", { id: tid })
      setDone(true)
      setOpen(false)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mt-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-200 dark:border-emerald-500/30 p-3 flex items-center gap-2">
        <Clock4 size={14} className="text-emerald-600 dark:text-emerald-400" />
        <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300">
          Mari recibió tu solicitud · te contactará pronto
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full h-12 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-50"
        >
          <Clock4 size={13} />
          Pedir más tiempo para pagar
        </button>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                Solicitar extensión
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-full bg-white/80 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X size={11} />
              </button>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                ¿Cuántos días extra?
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {OPTIONS.map((d) => {
                  const active = d === days
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDays(d)}
                      className={`h-10 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                        active
                          ? "bg-amber-500 text-white shadow-bloom"
                          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 border border-amber-200"
                      }`}
                    >
                      +{d} días
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Motivo (opcional)
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Ej: pago quincenal el día 15"
                className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white dark:bg-slate-800 text-[11px] font-bold outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="w-full h-11 rounded-xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#f59e0b,#f97316)" }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
              Enviar a Mari
            </button>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"
import { Edit3, Sun, Coffee, Moon, User, Save, X } from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"

/**
 * Acciones rápidas que el CLIENTE puede tomar antes de que su pedido
 * salga a ruta, sin abrir un ticket de soporte. Despacha UPDATEs
 * optimistas a `delivery_notes` (campos client_notes + client_time_pref).
 *
 * Solo se permite mientras el delivery NO esté `picked_up` ni `delivered`.
 * Si la BD no tiene esos campos todavía (hot fix pendiente), se silencia
 * el error y se avisa al cliente con un toast suave.
 */

export type DeliveryTimePref = "morning" | "afternoon" | "evening" | "anytime"

const TIME_OPTIONS: { id: DeliveryTimePref; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "morning", label: "Mañana (9-12)", icon: Sun },
  { id: "afternoon", label: "Tarde (12-18)", icon: Coffee },
  { id: "evening", label: "Noche (18-21)", icon: Moon },
  { id: "anytime", label: "Cualquier hora", icon: User },
]

interface Props {
  deliveryId: string
  initialNote?: string | null
  initialTimePref?: DeliveryTimePref | null
  /** Si false, deshabilita todo (ej. ya está en ruta). */
  enabled?: boolean
  /** Callback tras un guardado exitoso. */
  onSaved?: (patch: { client_notes: string | null; client_time_pref: DeliveryTimePref | null }) => void
}

export default function QuickDeliveryActions({
  deliveryId,
  initialNote,
  initialTimePref,
  enabled = true,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(initialNote ?? "")
  const [timePref, setTimePref] = useState<DeliveryTimePref | null>(initialTimePref ?? null)
  const [saving, setSaving] = useState(false)

  if (!enabled) return null

  const dirty =
    (note ?? "") !== (initialNote ?? "") || timePref !== (initialTimePref ?? null)

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    const patch = {
      client_notes: note.trim() || null,
      client_time_pref: timePref,
    }
    try {
      const { error } = await supabase
        .from("delivery_notes")
        .update(patch)
        .eq("id", deliveryId)
      if (error) {
        // Tolerancia: si las columnas no existen aún (hot fix pendiente)
        if (/column .* does not exist/i.test(error.message) || error.code === "42703") {
          toast(
            "Función nueva — el admin necesita correr el hotfix SQL para habilitar esto.",
            { icon: "ℹ️", duration: 4000 },
          )
        } else {
          throw error
        }
      } else {
        toast.success("Instrucciones enviadas")
        onSaved?.(patch)
        setOpen(false)
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron enviar las instrucciones")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:bg-slate-700/40 transition-colors"
      >
        <Edit3 size={11} className="text-primary" />
        <span className="flex-1">Instrucciones para la entrega</span>
        <span className="text-slate-400 normal-case font-bold">
          {open ? "Cerrar" : initialNote || initialTimePref ? "Editar" : "Agregar"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-3 border-t border-slate-200 dark:border-slate-700">
              {/* Horario preferido */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Horario preferido
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {TIME_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    const isActive = timePref === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTimePref(isActive ? null : opt.id)}
                        disabled={saving}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                          isActive
                            ? "bg-primary text-white shadow-bloom"
                            : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary/40"
                        } disabled:opacity-50`}
                      >
                        <Icon size={11} />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Nota libre */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Indicaciones especiales
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 240))}
                  placeholder="Dejar con el portero, tocar timbre interior 3, casa azul al fondo…"
                  rows={2}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary/40 resize-none disabled:opacity-50"
                />
                <p className="text-[8px] text-slate-400 mt-1 text-right">
                  {note.length}/240
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setNote(initialNote ?? "")
                    setTimePref(initialTimePref ?? null)
                  }}
                  disabled={saving}
                  className="flex-1 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <X size={11} />
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !dirty}
                  className="flex-[2] h-9 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-bloom disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save size={11} />
                  {saving ? "Enviando..." : "Enviar instrucciones"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

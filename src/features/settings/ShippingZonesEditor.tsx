import { useEffect, useState } from "react"
import Plus from "lucide-react/dist/esm/icons/plus"
import Trash2 from "lucide-react/dist/esm/icons/trash-2"
import Star from "lucide-react/dist/esm/icons/star"
import Save from "lucide-react/dist/esm/icons/save"
import Truck from "lucide-react/dist/esm/icons/truck"
import { motion, AnimatePresence } from "framer-motion"

import {
  listShippingZones,
  saveShippingZones,
  emptyZone,
  type ShippingZone,
} from "./shippingZonesService"
import { toastAsync } from "../../lib/toast"
import { confirmAction } from "../../lib/confirm"

/**
 * Editor de Zonas de Envío. Mari define qué CPs entran en qué zona,
 * cuánto cuesta y en cuántos días llega. El cliente luego usa esto
 * en ShippingEstimator. Patrón:
 *
 *   - Cards apilables (una por zona).
 *   - Botón "Marcar como default" (estrella) — máx una a la vez.
 *   - Botón "+ Zona" abajo.
 *   - Guardar es manual (no auto) para evitar requests en cada keystroke.
 *
 * Almacenamiento: `app_settings.value.zones` como array JSONB.
 */

export default function ShippingZonesEditor() {
  const [zones, setZones] = useState<ShippingZone[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    listShippingZones(true)
      .then((z) => setZones(z))
      .finally(() => setLoading(false))
  }, [])

  const update = (id: string, patch: Partial<ShippingZone>) => {
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)))
    setDirty(true)
  }

  const remove = async (id: string) => {
    const ok = await confirmAction({
      title: "Eliminar zona",
      message: "Esta zona desaparecerá del estimador del cliente.",
      confirmLabel: "Eliminar",
      tone: "danger",
    })
    if (!ok) return
    setZones((zs) => zs.filter((z) => z.id !== id))
    setDirty(true)
  }

  const setDefault = (id: string) => {
    setZones((zs) => zs.map((z) => ({ ...z, is_default: z.id === id })))
    setDirty(true)
  }

  const add = () => {
    setZones((zs) => [...zs, emptyZone()])
    setDirty(true)
  }

  const save = async () => {
    // Validación mínima
    const invalid = zones.some((z) => !z.label.trim())
    if (invalid) {
      const ok = await confirmAction({
        title: "Hay zonas sin nombre",
        message:
          "Algunas zonas no tienen nombre. ¿Guardar de todos modos? (los vacíos se llamarán 'Zona sin nombre').",
        confirmLabel: "Guardar igual",
      })
      if (!ok) return
    }
    const cleaned = zones.map((z) => ({
      ...z,
      label: z.label.trim() || "Zona sin nombre",
      postal_codes: z.postal_codes.map((p) => p.trim()).filter(Boolean),
    }))
    await toastAsync(saveShippingZones(cleaned), {
      loading: "Guardando zonas…",
      success: "Zonas actualizadas",
      error: "No se pudieron guardar",
    })
    setDirty(false)
  }

  if (loading) {
    return <div className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
  }

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-300 grid place-items-center shrink-0">
            <Truck size={14} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              Zonas de envío
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {zones.length} zona{zones.length !== 1 ? "s" : ""} · estimador en
              el catálogo
            </p>
          </div>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={save}
            className="h-9 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press shadow-bloom"
          >
            <Save size={12} /> Guardar
          </button>
        )}
      </header>

      <div className="p-3 space-y-2">
        <AnimatePresence initial={false}>
          {zones.map((z) => (
            <motion.div
              key={z.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.18 }}
              className={`rounded-2xl border p-3 ${
                z.enabled === false
                  ? "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 opacity-60"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60"
              }`}
            >
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={z.label}
                  onChange={(e) => update(z.id, { label: e.target.value })}
                  placeholder="Nombre (ej: Local · GDL norte)"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] font-black text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setDefault(z.id)}
                  title="Esta zona es el fallback cuando un CP no coincide"
                  className={`w-8 h-8 rounded-lg grid place-items-center ${
                    z.is_default
                      ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  }`}
                >
                  <Star
                    size={12}
                    fill={z.is_default ? "currentColor" : "none"}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => remove(z.id)}
                  className="w-8 h-8 rounded-lg grid place-items-center bg-rose-50 dark:bg-rose-500/15 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/25"
                  title="Eliminar zona"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">
                    Costo (MXN)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={z.cost}
                    onChange={(e) =>
                      update(z.id, { cost: Number(e.target.value || 0) })
                    }
                    className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[13px] font-black tabular-nums dark:text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">
                    Días
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={30}
                    value={z.eta_days}
                    onChange={(e) =>
                      update(z.id, {
                        eta_days: Math.max(0, Number(e.target.value || 0)),
                      })
                    }
                    className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[13px] font-black tabular-nums dark:text-slate-100"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-0.5 mt-2">
                <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">
                  Códigos postales (separados por coma o salto de línea — usa
                  asterisco para prefijos, ej: 446*)
                </span>
                <textarea
                  value={z.postal_codes.join(", ")}
                  onChange={(e) => {
                    const list = e.target.value
                      .split(/[,;\n\s]+/)
                      .map((p) => p.trim())
                      .filter(Boolean)
                    update(z.id, { postal_codes: list })
                  }}
                  rows={2}
                  placeholder="44600, 44650, 446*"
                  className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[12px] font-mono tabular-nums dark:text-slate-100"
                />
              </label>

              <label className="flex flex-col gap-0.5 mt-2">
                <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500">
                  Instrucciones (opcional)
                </span>
                <input
                  type="text"
                  value={z.instructions ?? ""}
                  onChange={(e) =>
                    update(z.id, { instructions: e.target.value })
                  }
                  placeholder="Ej: Recolección sábados 11-2 en Plaza X"
                  className="h-9 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[12px] italic text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </label>

              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={z.enabled !== false}
                  onChange={(e) => update(z.id, { enabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Activa (visible para el cliente)
                </span>
              </label>
            </motion.div>
          ))}
        </AnimatePresence>

        <button
          type="button"
          onClick={add}
          className="w-full h-11 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 press"
        >
          <Plus size={14} /> Nueva zona
        </button>

        <p className="text-[10px] text-slate-400 text-center italic pt-1">
          Tip: marca UNA zona como "default" (★) para que sirva de fallback
          cuando un CP no coincida con ninguna.
        </p>
      </div>
    </section>
  )
}

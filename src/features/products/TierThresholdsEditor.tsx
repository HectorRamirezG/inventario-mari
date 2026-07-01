import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Layers, Trash2, Info } from "lucide-react"

import type { TierThresholds } from "../pricing/tierPricingService"

/* ────────────────────────────────────────────────────────────────
 * TierThresholdsEditor — inputs opcionales para override de umbrales
 * de tier (menudeo/medio/mayoreo) por producto o por variante.
 *
 * Semántica:
 *   • `value.medio === null` && `value.mayoreo === null` → sin override,
 *     hereda del siguiente nivel (producto → global).
 *   • Cualquier valor numérico establece un override para ese umbral.
 *   • El editor los trata como pareja: al activar, se rellenan con
 *     `parentThresholds` (o `globalThresholds`) para dar arranque.
 *   • Presets rápidos ayudan a Mari: "1/3/6" (baratos), "1/6/12"
 *     (default clásico), "1/12/24" (mayoreo).
 *
 * Este componente NO habla con la BD — devuelve el nuevo shape para que
 * el padre lo mande en el updateProduct / updateVariant.
 * ──────────────────────────────────────────────────────────────── */

export interface TierThresholdsEditorValue {
  medio: number | null
  mayoreo: number | null
}

export const EMPTY_TIER_THRESHOLDS: TierThresholdsEditorValue = {
  medio: null,
  mayoreo: null,
}

/** Convierte {tier_umbral_medio, tier_umbral_mayoreo} → editor value */
export function tierThresholdsFromDB(
  raw: {
    tier_umbral_medio?: number | null
    tier_umbral_mayoreo?: number | null
  } | null
  | undefined,
): TierThresholdsEditorValue {
  return {
    medio: raw?.tier_umbral_medio ?? null,
    mayoreo: raw?.tier_umbral_mayoreo ?? null,
  }
}

/** Convierte editor value → columnas para DB */
export function tierThresholdsToDB(value: TierThresholdsEditorValue) {
  return {
    tier_umbral_medio: value.medio,
    tier_umbral_mayoreo: value.mayoreo,
  }
}

interface Props {
  value: TierThresholdsEditorValue
  onChange: (next: TierThresholdsEditorValue) => void
  /** "Umbrales de este producto" / "Umbrales de esta variante" */
  label: string
  /** Sublabel opcional (ej. "aplica a todas las variantes del producto"). */
  hint?: string
  /**
   * Umbrales heredados del nivel superior (producto o global). Se muestran
   * como texto "Heredado: 1 · 6 · 12" cuando NO hay override activo, así
   * el admin sabe cuál está aplicando actualmente.
   */
  parentThresholds: TierThresholds
  /** Nombre del nivel superior (para el texto "Heredado del producto/global"). */
  parentLabel?: string
}

export default function TierThresholdsEditor({
  value,
  onChange,
  label,
  hint,
  parentThresholds,
  parentLabel = "global",
}: Props) {
  const active = value.medio != null || value.mayoreo != null

  // Presets rápidos comunes.
  const presets: { label: string; medio: number; mayoreo: number }[] = [
    { label: "1 · 3 · 6", medio: 3, mayoreo: 6 },
    { label: "1 · 6 · 12", medio: 6, mayoreo: 12 },
    { label: "1 · 12 · 24", medio: 12, mayoreo: 24 },
  ]

  function enable() {
    onChange({
      medio: parentThresholds.medio_min_qty,
      mayoreo: parentThresholds.mayoreo_min_qty,
    })
  }

  function disable() {
    onChange(EMPTY_TIER_THRESHOLDS)
  }

  function setPreset(medio: number, mayoreo: number) {
    onChange({ medio, mayoreo })
  }

  function setMedio(v: number | "") {
    onChange({ ...value, medio: v === "" ? null : Math.max(0, Number(v)) })
  }

  function setMayoreo(v: number | "") {
    onChange({ ...value, mayoreo: v === "" ? null : Math.max(0, Number(v)) })
  }

  // Validación: mayoreo debe ser > medio, ambos >= 2 si activos.
  const validation = useMemo(() => {
    if (!active) return null
    const errors: string[] = []
    if (value.medio != null && value.medio < 2) {
      errors.push("El umbral 'medio' debe ser mayor o igual a 2")
    }
    if (value.mayoreo != null && value.mayoreo < 2) {
      errors.push("El umbral 'mayoreo' debe ser mayor o igual a 2")
    }
    if (
      value.medio != null &&
      value.mayoreo != null &&
      value.mayoreo <= value.medio
    ) {
      errors.push("'Mayoreo' debe ser mayor que 'medio'")
    }
    return errors.length > 0 ? errors : null
  }, [active, value.medio, value.mayoreo])

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden transition-colors ${
        active
          ? "border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/60 dark:from-emerald-500/10 dark:via-slate-900 dark:to-teal-500/5"
          : "border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40"
      }`}
    >
      {/* Header con toggle */}
      <button
        type="button"
        onClick={active ? disable : enable}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            active
              ? "bg-emerald-500 text-white shadow-sm"
              : "bg-slate-100 dark:bg-slate-800 text-slate-500"
          }`}
        >
          <Layers size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-slate-800 dark:text-slate-100 leading-tight">
            {label}
          </p>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
            {active
              ? hint ??
                "Ajusta cuántas piezas activan medio y mayoreo para este nivel."
              : `Heredado ${parentLabel}: 1 · ${parentThresholds.medio_min_qty} · ${parentThresholds.mayoreo_min_qty} piezas`}
          </p>
        </div>
        <div
          className="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full relative shrink-0"
          aria-hidden
          style={{
            backgroundColor: active ? "rgb(16 185 129)" : undefined,
          }}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              active ? "translate-x-5" : ""
            }`}
          />
        </div>
      </button>

      {/* Cuerpo colapsable */}
      <AnimatePresence initial={false}>
        {active && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Presets rápidos */}
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => {
                  const isCurrent =
                    value.medio === p.medio && value.mayoreo === p.mayoreo
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setPreset(p.medio, p.mayoreo)}
                      className={`px-2.5 h-7 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                        isCurrent
                          ? "bg-emerald-500 text-white shadow-sm"
                          : "bg-white/70 dark:bg-slate-800/70 border border-emerald-200/60 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              {/* Inputs medio / mayoreo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
                    Medio
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={2}
                      step={1}
                      value={value.medio ?? ""}
                      onChange={(e) =>
                        setMedio(
                          e.target.value === ""
                            ? ""
                            : (Number(e.target.value) as number),
                        )
                      }
                      placeholder={String(parentThresholds.medio_min_qty)}
                      className="w-full h-11 pl-3 pr-10 rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-500/30 text-slate-800 dark:text-slate-100 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-400 tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px] pointer-events-none">
                      pz
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
                    Mayoreo
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={2}
                      step={1}
                      value={value.mayoreo ?? ""}
                      onChange={(e) =>
                        setMayoreo(
                          e.target.value === ""
                            ? ""
                            : (Number(e.target.value) as number),
                        )
                      }
                      placeholder={String(parentThresholds.mayoreo_min_qty)}
                      className="w-full h-11 pl-3 pr-10 rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-500/30 text-slate-800 dark:text-slate-100 text-sm font-black outline-none focus:ring-2 focus:ring-emerald-400 tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px] pointer-events-none">
                      pz
                    </span>
                  </div>
                </div>
              </div>

              {/* Errores de validación */}
              {validation && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 flex items-start gap-2">
                  <Info
                    size={12}
                    className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                  />
                  <ul className="text-[10px] font-bold text-amber-800 dark:text-amber-300 leading-tight space-y-0.5">
                    {validation.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Botón resetear */}
              <button
                type="button"
                onClick={disable}
                className="w-full h-9 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-emerald-200/60 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
              >
                <Trash2 size={11} />
                Usar heredado ({parentLabel})
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

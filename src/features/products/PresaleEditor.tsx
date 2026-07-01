import { useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Percent, DollarSign, Calendar, Clock, X, AlertTriangle } from "lucide-react"

import {
  computePresale,
  formatPresaleCountdown,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  type PresaleFields,
} from "./presaleService"
import { formatMoney } from "../../lib/format"

/* ────────────────────────────────────────────────────────────────
 * PresaleEditor — sección del ProductDrawer para configurar
 * preventa: precio especial + fecha límite auto.
 *
 * Estado en el padre: mantiene un `PresaleEditorValue` que se
 * inicializa con `presaleFromDB(product)` y se guarda con
 * `presaleToDB(value)` (los helpers convierten entre el shape del
 * UI y las columnas de Supabase). Así el padre no necesita saber
 * cómo se almacenan internamente los datos ni la fecha en zona
 * horaria local vs UTC — solo pasa/recibe `PresaleEditorValue`.
 * ──────────────────────────────────────────────────────────────── */

export interface PresaleEditorValue {
  active: boolean
  mode: "pct" | "fixed"
  discountPct: number | ""
  fixedPrice: number | ""
  /** Formato datetime-local (`yyyy-MM-ddTHH:mm`) o "" (sin fecha). */
  endsAt: string
  note: string
}

export const EMPTY_PRESALE: PresaleEditorValue = {
  active: false,
  mode: "pct",
  discountPct: "",
  fixedPrice: "",
  endsAt: "",
  note: "",
}

/** Convierte los campos DB del producto al shape del editor. */
export function presaleFromDB(
  product: PresaleFields | null | undefined,
): PresaleEditorValue {
  if (!product) return EMPTY_PRESALE
  const active = !!product.presale_active
  const hasFixed =
    product.presale_price != null && Number(product.presale_price) > 0
  return {
    active,
    // Preferimos el modo del dato que YA tiene lleno. Si no tiene
    // nada, default a "pct" (descuento % es más flexible).
    mode: hasFixed ? "fixed" : "pct",
    discountPct:
      product.presale_discount_pct != null
        ? Number(product.presale_discount_pct)
        : "",
    fixedPrice:
      product.presale_price != null ? Number(product.presale_price) : "",
    endsAt: toDatetimeLocalValue(product.presale_ends_at),
    note: product.presale_note ?? "",
  }
}

/** Convierte el shape del editor a columnas para persistir en DB. */
export function presaleToDB(v: PresaleEditorValue): PresaleFields {
  // Si active=false, mandamos NULL en los demás para limpiar. Así el admin
  // puede apagar la preventa sin que queden restos de datos anteriores.
  if (!v.active) {
    return {
      presale_active: false,
      presale_price: null,
      presale_discount_pct: null,
      presale_ends_at: null,
      presale_note: null,
    }
  }
  return {
    presale_active: true,
    presale_price:
      v.mode === "fixed" && v.fixedPrice !== ""
        ? Number(v.fixedPrice)
        : null,
    presale_discount_pct:
      v.mode === "pct" && v.discountPct !== ""
        ? Number(v.discountPct)
        : null,
    presale_ends_at: fromDatetimeLocalValue(v.endsAt),
    presale_note: v.note.trim() || null,
  }
}

interface Props {
  value: PresaleEditorValue
  onChange: (next: PresaleEditorValue) => void
  /** Precio menudeo de referencia (típicamente `variants[0].price_menudeo`)
   *  para mostrar preview del descuento aplicado. Si es 0/null, el preview
   *  se oculta y solo mostramos el % o precio literal. */
  referencePrice: number
  /**
   * Callback opcional al hacer click en el toggle. Se dispara CON el
   * valor `next` (true=encendiendo, false=apagando) para que el padre
   * pueda persistir INMEDIATAMENTE sin esperar al botón "Guardar".
   * Útil para operaciones simples como "apagar preventa" (limpia todo)
   * o "encender preventa" (crea un draft en la BD).
   */
  onToggle?: (nextActive: boolean) => void
}

export default function PresaleEditor({
  value,
  onChange,
  referencePrice,
  onToggle,
}: Props) {
  // Preview del precio con descuento aplicado. Reusamos la MISMA función
  // del cliente para garantizar que "lo que ve el admin al configurar"
  // sea exactamente "lo que se cobra" en la tienda.
  const preview = useMemo(
    () => computePresale(presaleToDB(value), referencePrice, new Date()),
    [value, referencePrice],
  )

  const countdown = value.active && value.endsAt
    ? formatPresaleCountdown(value.endsAt)
    : null

  // ¿La preventa está vencida por fecha? Aviso al admin para que apague
  // o extienda. Consideramos vencida cuando toggle=on pero preview.reason
  // devolvió "expired" (o sea `presale_ends_at` en el pasado).
  const isExpired = value.active && preview.reason === "expired"

  function set<K extends keyof PresaleEditorValue>(
    key: K,
    v: PresaleEditorValue[K],
  ) {
    onChange({ ...value, [key]: v })
  }

  // Presets rápidos de fecha (contados desde ahora). Ayuda al admin a no
  // pelearse con el datetime picker para casos comunes.
  const presetDates = [
    { label: "24 hrs", hours: 24 },
    { label: "3 días", hours: 24 * 3 },
    { label: "1 semana", hours: 24 * 7 },
    { label: "2 semanas", hours: 24 * 14 },
  ]
  function applyPresetDate(hours: number) {
    const d = new Date()
    d.setHours(d.getHours() + hours)
    // El input datetime-local espera hora local sin timezone.
    const iso = toDatetimeLocalValue(d.toISOString())
    set("endsAt", iso)
  }

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden transition-colors ${
        value.active
          ? "border-fuchsia-200 dark:border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-50/60 via-white to-pink-50/60 dark:from-fuchsia-500/10 dark:via-slate-900 dark:to-pink-500/5"
          : "border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40"
      }`}
    >
      {/* Header con toggle */}
      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            value.active
              ? "bg-fuchsia-500 text-white shadow-sm"
              : "bg-slate-100 dark:bg-slate-800 text-slate-500"
          }`}
        >
          <Sparkles size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-black text-slate-800 dark:text-slate-100 leading-tight">
            Preventa con precio especial
          </p>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
            {value.active
              ? "El precio se aplica en la tienda mientras esté encendida."
              : "Enciende para dar un descuento o precio fijo temporal."}
          </p>
        </div>
        <input
          type="checkbox"
          checked={value.active}
          onChange={(e) => {
            const next = e.target.checked
            onChange({ ...value, active: next })
            // Auto-save: si el padre expone `onToggle`, notificamos
            // ANTES de que el user tenga que dar click al botón Guardar.
            // Útil para "apagar preventa" (limpia todo en la BD de un tap).
            onToggle?.(next)
          }}
          className="sr-only peer"
        />
        <div
          className="w-11 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer-checked:bg-fuchsia-500 relative transition-colors shrink-0"
          aria-hidden
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              value.active ? "translate-x-5" : ""
            }`}
          />
        </div>
      </label>

      {/* Cuerpo colapsable */}
      <AnimatePresence initial={false}>
        {value.active && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 space-y-3">
              {/* Aviso de preventa vencida: la fecha límite ya pasó pero
                  el toggle sigue activo. Ofrecemos apagar en 1 tap o
                  extender cambiando la fecha manualmente. */}
              {isExpired && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2.5 flex items-center gap-3">
                  <AlertTriangle
                    size={14}
                    className="shrink-0 text-amber-600 dark:text-amber-400"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-amber-800 dark:text-amber-200 leading-tight">
                      Preventa vencida
                    </p>
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-tight mt-0.5">
                      Ya no se aplica descuento — el cliente ve el precio
                      normal. Apágala o extiéndela con una nueva fecha.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, active: false })}
                    className="shrink-0 px-2.5 h-8 rounded-full bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest hover:bg-amber-600"
                  >
                    Apagar
                  </button>
                </div>
              )}

              {/* Tabs modo: descuento % o precio fijo */}
              <div className="flex items-center gap-1 bg-white/70 dark:bg-slate-800/60 rounded-full p-1 border border-fuchsia-200/50 dark:border-fuchsia-500/20">
                {(
                  [
                    { id: "pct", label: "Descuento %", icon: Percent },
                    { id: "fixed", label: "Precio fijo", icon: DollarSign },
                  ] as const
                ).map((m) => {
                  const active = value.mode === m.id
                  const Icon = m.icon
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => set("mode", m.id)}
                      className={`relative flex-1 flex items-center justify-center gap-1.5 h-8 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                        active
                          ? "text-white"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="presale-mode-pill"
                          className="absolute inset-0 rounded-full bg-fuchsia-500"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 28,
                          }}
                        />
                      )}
                      <Icon size={11} className="relative z-10" />
                      <span className="relative z-10">{m.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Input según modo */}
              {value.mode === "pct" ? (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <Percent size={10} />
                    Descuento sobre menudeo
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={90}
                      step={1}
                      value={value.discountPct}
                      onChange={(e) =>
                        set(
                          "discountPct",
                          e.target.value === ""
                            ? ""
                            : Math.max(0, Math.min(90, Number(e.target.value))),
                        )
                      }
                      placeholder="15"
                      className="w-full h-11 pl-3 pr-9 rounded-xl bg-white dark:bg-slate-800 border border-fuchsia-200 dark:border-fuchsia-500/30 text-slate-800 dark:text-slate-100 text-sm font-black outline-none focus:ring-2 focus:ring-fuchsia-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm pointer-events-none">
                      %
                    </span>
                  </div>
                  <p className="text-[9px] font-semibold text-slate-400 mt-1">
                    Se aplica solo al precio menudeo. Los precios de medio y
                    mayoreo se conservan.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <DollarSign size={10} />
                    Precio fijo durante preventa
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm pointer-events-none">
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={value.fixedPrice}
                      onChange={(e) =>
                        set(
                          "fixedPrice",
                          e.target.value === ""
                            ? ""
                            : Math.max(0, Number(e.target.value)),
                        )
                      }
                      placeholder="0.00"
                      className="w-full h-11 pl-7 pr-3 rounded-xl bg-white dark:bg-slate-800 border border-fuchsia-200 dark:border-fuchsia-500/30 text-slate-800 dark:text-slate-100 text-sm font-black outline-none focus:ring-2 focus:ring-fuchsia-400"
                    />
                  </div>
                  <p className="text-[9px] font-semibold text-slate-400 mt-1">
                    Precio menudeo reemplazado durante la preventa.
                  </p>
                </div>
              )}

              {/* Preview del precio con descuento */}
              {referencePrice > 0 && (
                <div className="rounded-xl bg-white/80 dark:bg-slate-800/70 border border-fuchsia-200/60 dark:border-fuchsia-500/20 px-3 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Precio efectivo
                    </p>
                    {preview.active ? (
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-lg font-black text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">
                          {formatMoney(preview.effectivePrice)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 line-through tabular-nums">
                          {formatMoney(preview.originalPrice)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                        {preview.reason === "no_price"
                          ? "Falta definir descuento o precio"
                          : "Sin descuento aplicado"}
                      </p>
                    )}
                  </div>
                  {preview.active && preview.savingPct > 0 && (
                    <div className="shrink-0 px-2.5 py-1 rounded-full bg-fuchsia-500 text-white text-[10px] font-black tabular-nums shadow-sm">
                      −{preview.savingPct}%
                    </div>
                  )}
                </div>
              )}

              {/* Fecha límite */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                  <Calendar size={10} />
                  Termina automáticamente
                  <span className="normal-case font-semibold text-slate-400 tracking-normal">
                    (opcional)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={value.endsAt}
                    onChange={(e) => set("endsAt", e.target.value)}
                    className="flex-1 h-10 px-3 rounded-xl bg-white dark:bg-slate-800 border border-fuchsia-200 dark:border-fuchsia-500/30 text-slate-800 dark:text-slate-100 text-xs font-bold outline-none focus:ring-2 focus:ring-fuchsia-400"
                  />
                  {value.endsAt && (
                    <button
                      type="button"
                      onClick={() => set("endsAt", "")}
                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center hover:text-rose-500 shrink-0"
                      aria-label="Quitar fecha"
                      title="Sin fecha límite (termina cuando yo la apague)"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {presetDates.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPresetDate(p.hours)}
                      className="px-2 h-6 rounded-full bg-white/70 dark:bg-slate-800/70 border border-fuchsia-200/60 dark:border-fuchsia-500/20 text-[9px] font-black uppercase tracking-widest text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/15"
                    >
                      +{p.label}
                    </button>
                  ))}
                </div>
                {countdown && (
                  <p
                    className={`text-[10px] font-bold mt-1.5 flex items-center gap-1 ${
                      countdown === "Vencida"
                        ? "text-rose-500"
                        : "text-fuchsia-600 dark:text-fuchsia-400"
                    }`}
                  >
                    <Clock size={10} />
                    {countdown}
                  </p>
                )}
                {!value.endsAt && (
                  <p className="text-[9px] font-semibold text-slate-400 mt-1">
                    Sin fecha: la preventa sigue activa hasta que la apagues
                    manualmente.
                  </p>
                )}
              </div>

              {/* Nota opcional para el cliente */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5 block">
                  Mensaje para el cliente
                  <span className="normal-case font-semibold text-slate-400 tracking-normal ml-1">
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  value={value.note}
                  onChange={(e) => set("note", e.target.value)}
                  placeholder="Ej: Entrega estimada 15 de julio"
                  maxLength={80}
                  className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-800 border border-fuchsia-200 dark:border-fuchsia-500/30 text-slate-800 dark:text-slate-100 text-xs font-semibold outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

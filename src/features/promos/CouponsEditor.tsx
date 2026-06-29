import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Trash2,
  Tag,
  Percent,
  DollarSign,
  Calendar,
  Hash,
  Edit2,
  X,
  Save,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  fetchCoupons,
  saveCoupons,
  emptyCoupon,
  sanitizeCoupon,
  countCouponUsage,
  type Coupon,
} from "./couponService"
import { confirmAction } from "../../lib/confirm"
import { formatMoney } from "../../lib/format"
import { translateError } from "../../lib/supabaseErrors"

/**
 * UI admin para crear, editar y eliminar cupones de descuento.
 *
 * Va dentro de BusinessRulesPage como sección dedicada. Reads/writes
 * `app_settings.coupons` via `couponService`. Cada cupón guardado se
 * propaga al cliente (cart drawer) en su próximo refresh del hook
 * `useCoupons` (sin realtime hub todavía — `app_settings.coupons` no
 * está en la lista de tablas suscritas; el cliente lo verá tras un
 * focus/reload del shop).
 *
 * Cada card muestra el code + tipo + valor + estado (activo, expirado,
 * agotado) + count de usos (best-effort via countCouponUsage). Acciones:
 * Editar / Eliminar.
 */
export default function CouponsEditor() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [usages, setUsages] = useState<Record<string, number>>({})

  // Carga inicial + lookup de usos por cada cupón. Los usos son
  // best-effort: si la query falla, dejamos 0 (no bloquea el UI).
  useEffect(() => {
    let alive = true
    fetchCoupons()
      .then(async (data) => {
        if (!alive) return
        setCoupons(data)
        setLoading(false)
        // Trae usage en paralelo para todos los cupones existentes.
        const entries = await Promise.all(
          data.map(async (c) => [c.code, await countCouponUsage(c.code)] as const),
        )
        if (!alive) return
        setUsages(Object.fromEntries(entries))
      })
      .catch(() => {
        if (alive) {
          setCoupons([])
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [])

  async function persist(next: Coupon[]) {
    // Validación local: códigos únicos.
    const seen = new Set<string>()
    for (const c of next) {
      const k = c.code.toUpperCase().trim()
      if (!k) {
        toast.error("Todos los cupones necesitan un código")
        return false
      }
      if (seen.has(k)) {
        toast.error(`Código duplicado: ${k}`)
        return false
      }
      seen.add(k)
    }
    try {
      await saveCoupons(next)
      setCoupons(next.map(sanitizeCoupon))
      return true
    } catch (e: any) {
      toast.error(translateError(e, "No se pudo guardar"))
      return false
    }
  }

  async function handleSave(c: Coupon) {
    const sanitized = sanitizeCoupon(c)
    if (!sanitized.code) {
      toast.error("El código no puede estar vacío")
      return
    }
    if (sanitized.amount <= 0) {
      toast.error("El descuento debe ser mayor a 0")
      return
    }
    // Si ya existía (mismo código), reemplazamos; si no, agregamos.
    const idx = coupons.findIndex((x) => x.code === sanitized.code)
    const next =
      idx >= 0
        ? coupons.map((x, i) => (i === idx ? sanitized : x))
        : [...coupons, sanitized]
    const ok = await persist(next)
    if (ok) {
      toast.success(`Cupón ${sanitized.code} guardado`)
      setEditing(null)
    }
  }

  async function handleDelete(code: string) {
    const ok = await confirmAction({
      title: "Eliminar cupón",
      message: `¿Eliminar el cupón ${code}? Las ventas que ya lo usaron NO se ven afectadas.`,
      confirmText: "Eliminar",
      tone: "danger",
    })
    if (!ok) return
    const next = coupons.filter((c) => c.code !== code)
    const success = await persist(next)
    if (success) toast.success(`Cupón ${code} eliminado`)
  }

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-4 sm:p-5 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-xl bg-pink-100 dark:bg-pink-500/20 text-pink-600 dark:text-pink-300 flex items-center justify-center shrink-0">
            <Tag size={14} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 leading-tight">
              Cupones de descuento
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
              Códigos que el cliente teclea en su carrito para obtener
              descuento. Útiles para promos en Instagram o WhatsApp.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(emptyCoupon())}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-black uppercase tracking-widest shadow-sm press"
        >
          <Plus size={12} strokeWidth={2.5} />
          Nuevo
        </button>
      </header>

      {loading ? (
        <div className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-700/40 animate-pulse" />
      ) : coupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            Aún no tienes cupones · crea el primero para promos
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {coupons.map((c) => (
            <CouponCard
              key={c.code}
              coupon={c}
              usage={usages[c.code] ?? 0}
              onEdit={() => setEditing(c)}
              onDelete={() => handleDelete(c.code)}
            />
          ))}
        </ul>
      )}

      {/* Modal editor — crear o editar */}
      <AnimatePresence>
        {editing && (
          <CouponEditorModal
            coupon={editing}
            existingCodes={coupons.map((c) => c.code)}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/* ─────────────────── Card de cupón ─────────────────── */

function CouponCard({
  coupon,
  usage,
  onEdit,
  onDelete,
}: {
  coupon: Coupon
  usage: number
  onEdit: () => void
  onDelete: () => void
}) {
  const expired =
    coupon.expires_at && Date.now() > new Date(coupon.expires_at + "T23:59:59").getTime()
  const exhausted = coupon.max_uses != null && usage >= coupon.max_uses
  const inactive = !coupon.enabled

  let status: { label: string; tone: string } = { label: "Activo", tone: "bg-emerald-500" }
  if (inactive) status = { label: "Apagado", tone: "bg-slate-500" }
  else if (expired) status = { label: "Expirado", tone: "bg-rose-500" }
  else if (exhausted) status = { label: "Agotado", tone: "bg-amber-500" }

  const valueLabel =
    coupon.type === "percent"
      ? `${coupon.amount}% off`
      : `${formatMoney(coupon.amount)} off`

  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 flex items-center gap-3">
      {/* Code chip */}
      <div className="shrink-0 px-3 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-500 text-white flex items-center justify-center font-black text-[13px] tracking-wider shadow-sm tabular-nums">
        {coupon.code}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-black text-slate-900 dark:text-slate-100">
            {valueLabel}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-white text-[9px] font-black uppercase tracking-widest ${status.tone}`}
          >
            {status.label}
          </span>
        </div>
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
          {coupon.min_subtotal > 0 && (
            <>min {formatMoney(coupon.min_subtotal)} · </>
          )}
          {coupon.max_uses != null ? `${usage}/${coupon.max_uses} usos` : `${usage} usos`}
          {coupon.expires_at && (
            <> · vence {coupon.expires_at}</>
          )}
        </p>
        {coupon.note && (
          <p className="text-[10px] italic text-slate-400 dark:text-slate-500 mt-0.5 truncate">
            {coupon.note}
          </p>
        )}
      </div>
      {/* Actions */}
      <button
        type="button"
        onClick={onEdit}
        aria-label="Editar cupón"
        className="shrink-0 w-8 h-8 rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-primary border border-slate-200 dark:border-slate-700 flex items-center justify-center press"
      >
        <Edit2 size={12} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Eliminar cupón"
        className="shrink-0 w-8 h-8 rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-rose-500 border border-slate-200 dark:border-slate-700 flex items-center justify-center press"
      >
        <Trash2 size={12} />
      </button>
    </li>
  )
}

/* ─────────────────── Modal editor ─────────────────── */

function CouponEditorModal({
  coupon,
  existingCodes,
  onCancel,
  onSave,
}: {
  coupon: Coupon
  existingCodes: string[]
  onCancel: () => void
  onSave: (c: Coupon) => void
}) {
  const [form, setForm] = useState<Coupon>(coupon)
  const isEdit = existingCodes.includes(coupon.code)

  function patch(p: Partial<Coupon>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[180] flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 shadow-2xl space-y-4"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
              {isEdit ? "Editar cupón" : "Nuevo cupón"}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Lo que el cliente teclea en su carrito
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar"
            className="shrink-0 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 flex items-center justify-center press"
          >
            <X size={14} />
          </button>
        </header>

        {/* Code + tipo */}
        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
              Código
            </span>
            <input
              type="text"
              value={form.code}
              onChange={(e) =>
                patch({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })
              }
              placeholder="MARIA20"
              maxLength={24}
              autoCapitalize="characters"
              spellCheck={false}
              disabled={isEdit}
              className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-base font-black tracking-wider tabular-nums uppercase outline-none focus:border-primary/50 disabled:opacity-60"
            />
            {isEdit && (
              <p className="text-[9px] text-slate-400 mt-1">
                El código no se puede cambiar tras crearse (rompería tracking).
              </p>
            )}
          </label>

          {/* Tipo y monto */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => patch({ type: "percent" })}
              className={`h-11 rounded-xl text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press border ${
                form.type === "percent"
                  ? "bg-pink-500 text-white border-pink-500"
                  : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
              }`}
            >
              <Percent size={12} strokeWidth={2.5} />
              Porcentaje
            </button>
            <button
              type="button"
              onClick={() => patch({ type: "fixed" })}
              className={`h-11 rounded-xl text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press border ${
                form.type === "fixed"
                  ? "bg-pink-500 text-white border-pink-500"
                  : "bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
              }`}
            >
              <DollarSign size={12} strokeWidth={2.5} />
              Monto fijo
            </button>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
              {form.type === "percent" ? "Descuento (%)" : "Descuento ($)"}
            </span>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => patch({ amount: Number(e.target.value) })}
                min={0}
                max={form.type === "percent" ? 100 : undefined}
                step={form.type === "percent" ? 1 : 10}
                className="w-full h-11 px-3 pr-8 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm font-black tabular-nums outline-none focus:border-primary/50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">
                {form.type === "percent" ? "%" : "$"}
              </span>
            </div>
          </label>
        </div>

        {/* Límites */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Límites (opcional)
          </p>

          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Hash size={10} /> Máximo de usos
            </span>
            <input
              type="number"
              value={form.max_uses ?? ""}
              onChange={(e) =>
                patch({
                  max_uses: e.target.value ? Math.max(1, Math.floor(Number(e.target.value))) : null,
                })
              }
              placeholder="Ilimitado"
              min={1}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm font-bold tabular-nums outline-none focus:border-primary/50"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <Calendar size={10} /> Vence el (opcional)
            </span>
            <input
              type="date"
              value={form.expires_at ?? ""}
              onChange={(e) => patch({ expires_at: e.target.value || null })}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm font-bold outline-none focus:border-primary/50"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
              <DollarSign size={10} /> Mínimo de carrito
            </span>
            <input
              type="number"
              value={form.min_subtotal || ""}
              onChange={(e) => patch({ min_subtotal: Math.max(0, Number(e.target.value) || 0) })}
              placeholder="0 = cualquier monto"
              min={0}
              step={50}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm font-bold tabular-nums outline-none focus:border-primary/50"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
              Nota interna (solo tú la ves)
            </span>
            <input
              type="text"
              value={form.note ?? ""}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="Ej: Promo de Instagram, mayo 2026"
              maxLength={120}
              className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm font-bold outline-none focus:border-primary/50"
            />
          </label>

          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              Cupón activo (el cliente lo puede usar)
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[12px] font-black uppercase tracking-widest press"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            className="flex-1 h-11 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-500 text-white text-[12px] font-black uppercase tracking-widest shadow-sm press flex items-center justify-center gap-1.5"
          >
            <Save size={12} strokeWidth={2.5} />
            Guardar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

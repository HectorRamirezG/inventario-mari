import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Package,
  Plus,
  Trash2,
  Save,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Check,
  PowerOff,
  Power,
  Pencil,
  X,
} from "lucide-react"
import toast from "react-hot-toast"

import PageHeader from "../../components/ui/PageHeader"
import { confirmAction } from "../../lib/confirm"
import { formatMoney } from "../../lib/format"
import { supabase } from "../../lib/supabase"
import {
  listAllBundles,
  createBundle,
  updateBundle,
  deleteBundle,
  type Bundle,
  type BundleSlot,
} from "./bundlesService"

/** Variante simplificada para el selector de slots del admin. */
interface AdminVariantRow {
  id: string
  variant_name: string
  product_name: string
  price: number
  image: string | null
}

/** Carga directa de productos+variantes activos para el editor.
 *  No usamos el servicio del cliente porque vive en otro feature y
 *  queremos un payload mínimo. */
async function loadActiveVariants(): Promise<AdminVariantRow[]> {
  const { data: prods } = await supabase
    .from("products")
    .select("id,name,image_url")
    .eq("is_active", true)
  const { data: vars } = await supabase
    .from("variants")
    .select("id,product_id,variant_name,price,price_menudeo,image_url,image_urls")
    .eq("is_active", true)
  const productById = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]))
  return (vars ?? [])
    .map((v: any) => {
      const p = productById.get(v.product_id)
      if (!p) return null
      return {
        id: String(v.id),
        variant_name: String(v.variant_name ?? ""),
        product_name: String(p.name ?? ""),
        price: Number(v.price_menudeo ?? v.price ?? 0),
        image:
          (v.image_urls && v.image_urls[0]) ??
          v.image_url ??
          p.image_url ??
          null,
      } as AdminVariantRow
    })
    .filter((x): x is AdminVariantRow => !!x)
}

/**
 * CRUD de paquetes/kits. Mari define el nombre, agrega slots y para
 * cada slot puede:
 *   - Dejarlo "libre" (cualquier variante activa cuenta)
 *   - Restringirlo a un set de variantes elegibles (las elige aquí)
 * Discount opcional sobre el total. Toggle active controla visibilidad
 * en la tienda del cliente.
 */
export default function BundlesAdminPage() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Bundle | null>(null)
  const [creating, setCreating] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const list = await listAllBundles()
      setBundles(list)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function toggleActive(b: Bundle) {
    try {
      await updateBundle(b.id, { active: !b.active })
      toast.success(b.active ? "Paquete pausado" : "Paquete activado")
      reload()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar")
    }
  }

  async function handleDelete(b: Bundle) {
    const ok = await confirmAction({
      title: "¿Borrar paquete?",
      description: `Se eliminará "${b.name}" permanentemente. Las ventas pasadas no se afectan.`,
      confirmLabel: "Sí, borrar",
      tone: "danger",
    })
    if (!ok) return
    try {
      await deleteBundle(b.id)
      toast.success("Paquete eliminado")
      reload()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo borrar")
    }
  }

  return (
    <div className="relative max-w-3xl mx-auto pb-32">
      <PageHeader
        icon={Package}
        iconTone="primary"
        title="Paquetes / Kits"
        subtitle="Sets armables: tú defines los slots, el cliente elige sus variantes"
        right={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-9 px-3 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest shadow-bloom flex items-center gap-1.5 press"
          >
            <Plus size={11} /> Nuevo
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" />
          Cargando…
        </div>
      ) : bundles.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <ul className="space-y-3">
          {bundles.map((b) => (
            <BundleRow
              key={b.id}
              bundle={b}
              onToggleActive={() => toggleActive(b)}
              onEdit={() => setEditing(b)}
              onDelete={() => handleDelete(b)}
            />
          ))}
        </ul>
      )}

      <AnimatePresence>
        {(creating || editing) && (
          <BundleEditorModal
            bundle={editing}
            onClose={() => {
              setEditing(null)
              setCreating(false)
            }}
            onSaved={() => {
              reload()
              setEditing(null)
              setCreating(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ──────── Estado vacío ──────── */
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-12 text-center">
      <div
        className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center text-white"
        style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
      >
        <Package size={22} />
      </div>
      <p className="text-sm font-black text-slate-700 dark:text-slate-200">
        Aún no tienes paquetes
      </p>
      <p className="text-[11px] font-bold text-slate-500 mt-1 leading-snug max-w-xs mx-auto">
        Crea un kit (ej. "Set 3 labiales") con slots de productos. El cliente
        elegirá qué variante quiere en cada slot y verá un descuento por
        comprar el paquete completo.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-1.5 h-11 px-5 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-widest shadow-bloom press-hard"
      >
        <Plus size={12} />
        Crear primer paquete
      </button>
    </div>
  )
}

/* ──────── Fila de bundle ──────── */
function BundleRow({
  bundle,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  bundle: Bundle
  onToggleActive: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 ${
        bundle.active
          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
          : "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700/60 opacity-75"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center text-slate-400 shrink-0"
        >
          {bundle.image_url ? (
            <img src={bundle.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Package size={20} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-black truncate">{bundle.name}</p>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none ${
                bundle.active
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
              }`}
            >
              {bundle.active ? "Activo" : "Pausado"}
            </span>
            {bundle.discount_percent > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                -{bundle.discount_percent}%
              </span>
            )}
          </div>
          {bundle.description && (
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
              {bundle.description}
            </p>
          )}
          <p className="text-[10px] font-bold text-slate-500 mt-1">
            {bundle.slots.length} slot{bundle.slots.length === 1 ? "" : "s"} ·{" "}
            {bundle.slots.reduce((acc, s) => acc + s.qty, 0)} pieza
            {bundle.slots.reduce((acc, s) => acc + s.qty, 0) === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onToggleActive}
          className={`h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press ${
            bundle.active
              ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {bundle.active ? <PowerOff size={11} /> : <Power size={11} />}
          {bundle.active ? "Pausar" : "Activar"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 h-9 rounded-xl bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
        >
          <Pencil size={11} /> Editar
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Borrar"
          className="h-9 px-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black flex items-center press"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </motion.li>
  )
}

/* ──────── Modal editor ──────── */
function BundleEditorModal({
  bundle,
  onClose,
  onSaved,
}: {
  bundle: Bundle | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(bundle?.name ?? "")
  const [description, setDescription] = useState(bundle?.description ?? "")
  const [imageUrl, setImageUrl] = useState(bundle?.image_url ?? "")
  const [discount, setDiscount] = useState(bundle?.discount_percent ?? 0)
  const [active, setActive] = useState(bundle?.active ?? true)
  const [slots, setSlots] = useState<BundleSlot[]>(
    bundle?.slots ?? [{ label: "Producto 1", qty: 1, eligible_variant_ids: [] }],
  )
  const [saving, setSaving] = useState(false)
  // Catálogo plano de variantes activas para el selector de slots.
  const [variants, setVariants] = useState<AdminVariantRow[]>([])
  useEffect(() => {
    loadActiveVariants().then(setVariants).catch(() => setVariants([]))
  }, [])

  function addSlot() {
    setSlots((prev) => [
      ...prev,
      {
        label: `Producto ${prev.length + 1}`,
        qty: 1,
        eligible_variant_ids: [],
      },
    ])
  }
  function removeSlot(ix: number) {
    setSlots((prev) => prev.filter((_, i) => i !== ix))
  }
  function patchSlot(ix: number, patch: Partial<BundleSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === ix ? { ...s, ...patch } : s)))
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Pon un nombre")
      return
    }
    if (slots.length === 0) {
      toast.error("Agrega al menos un slot")
      return
    }
    setSaving(true)
    const tid = toast.loading("Guardando…")
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        slots,
        discount_percent: Math.max(0, Math.min(100, Number(discount) || 0)),
        active,
      }
      if (bundle) {
        await updateBundle(bundle.id, payload)
      } else {
        await createBundle(payload)
      }
      toast.success("Listo", { id: tid })
      onSaved()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar", { id: tid })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-end sm:items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28 }}
        className="relative w-full sm:max-w-2xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-t-[2rem] sm:rounded-3xl pb-safe flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <h3 className="text-base font-black tracking-tight">
            {bundle ? "Editar paquete" : "Nuevo paquete"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 press"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4">
          {/* Datos básicos */}
          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
                Nombre
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Set de 3 labiales"
                maxLength={80}
                className="settings-input"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
                Descripción
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Explicación corta del paquete (opcional)"
                maxLength={240}
                className="settings-input resize-none py-2"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
                URL de imagen (opcional)
              </span>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                className="settings-input"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
                  Descuento (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="settings-input text-center"
                />
              </label>
              <label className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-[11px] font-bold">Visible al cliente</span>
              </label>
            </div>
          </div>

          {/* Slots */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
                Slots del paquete
              </h4>
              <button
                type="button"
                onClick={addSlot}
                className="h-8 px-3 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1 press shadow-sm"
              >
                <Plus size={11} /> Slot
              </button>
            </div>
            <ul className="space-y-2">
              {slots.map((slot, ix) => (
                <SlotEditor
                  key={ix}
                  ix={ix}
                  slot={slot}
                  variants={variants}
                  onPatch={(p) => patchSlot(ix, p)}
                  onRemove={() => removeSlot(ix)}
                />
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-brand w-full h-12 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50 press-hard"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {bundle ? "Guardar cambios" : "Crear paquete"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

/* ──────── Editor de un slot (con selector de variantes elegibles) ──────── */
function SlotEditor({
  ix,
  slot,
  variants,
  onPatch,
  onRemove,
}: {
  ix: number
  slot: BundleSlot
  variants: AdminVariantRow[]
  onPatch: (patch: Partial<BundleSlot>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return variants
    return variants.filter(
      (v) =>
        v.variant_name.toLowerCase().includes(q) ||
        v.product_name.toLowerCase().includes(q),
    )
  }, [variants, query])

  function toggleVariant(id: string) {
    const set = new Set(slot.eligible_variant_ids)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onPatch({ eligible_variant_ids: Array.from(set) })
  }

  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3">
      <div className="flex items-start gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
          {ix + 1}
        </span>
        <div className="flex-1 grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            value={slot.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="Etiqueta (ej. Labial)"
            maxLength={60}
            className="settings-input h-9"
          />
          <input
            type="number"
            value={slot.qty}
            onChange={(e) => onPatch({ qty: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })}
            min={1}
            max={20}
            className="settings-input h-9 w-16 text-center"
            title="Piezas que pide este slot"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Borrar slot"
          className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center press shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300 px-1"
      >
        <span>
          {slot.eligible_variant_ids.length === 0
            ? "Variantes elegibles: TODAS las activas"
            : `${slot.eligible_variant_ids.length} variante${slot.eligible_variant_ids.length === 1 ? "" : "s"} elegible${slot.eligible_variant_ids.length === 1 ? "" : "s"}`}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar producto o variante"
                  className="settings-input pl-7 h-8 text-[11px]"
                />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                {filtered.length === 0 ? (
                  <p className="p-3 text-[10px] text-slate-400 italic">Sin resultados</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.slice(0, 80).map((v) => {
                      const isChecked = slot.eligible_variant_ids.includes(v.id)
                      return (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => toggleVariant(v.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <span
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                isChecked
                                  ? "bg-primary border-primary text-white"
                                  : "border-slate-300 dark:border-slate-600"
                              }`}
                            >
                              {isChecked && <Check size={9} strokeWidth={3} />}
                            </span>
                            <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                              {v.image && (
                                <img src={v.image} alt="" className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-black truncate">{v.product_name}</p>
                              <p className="text-[9px] font-bold text-slate-500 truncate">
                                {v.variant_name}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold text-primary tabular-nums shrink-0">
                              {formatMoney(v.price)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <p className="text-[9px] text-slate-400 italic px-1">
                Si NO seleccionas ninguna, el cliente podrá elegir cualquier variante activa para llenar este slot.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Save,
  Loader2,
  DollarSign,
  Layers,
  Package,
  Edit3,
  Image as ImageIcon,
  Plus,
  Camera,
  ChevronDown,
} from "lucide-react"
import { toast } from "react-hot-toast"

import CategoryCombobox from "../../components/ui/CategoryCombobox"
import ProductImageUploader from "../../components/ui/ProductImageUploader"
import Badge from "../../components/ui/Badge"
import { money } from "../pricing/suggest"
import { useEditProductModal } from "./useEditProductModal"
import { updateVariant } from "./productService"
import { supabase } from "../../lib/supabase"
import type { Product, Variant } from "../../types/database"
import { formatMoney } from "../../lib/format"

interface Props {
  open: boolean
  product: Product | null
  onClose: () => void
  onSaved: () => void
  /** Categorías ya usadas en el catálogo (para sugerir en Combobox) */
  knownCategories?: string[]
}

/**
 * EditProductModal v2 — Drawer lateral derecho con dos secciones:
 *  - Datos generales del producto (nombre, categoría, costo, min stock, foto)
 *  - Lista DINÁMICA de variantes editables inline:
 *      · 3 precios por tier (menudeo / medio / mayoreo)
 *      · stock numérico directo
 *      · imagen específica de la variante (subir/reemplazar)
 */
export default function EditProductModal({
  open,
  product,
  onClose,
  onSaved,
  knownCategories,
}: Props) {
  const form = useEditProductModal(product, open, onClose, onSaved)

  // Bloquear scroll body
  useEffect(() => {
    if (!open) return
    const o = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = o
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (typeof document === "undefined" || !product) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex justify-end"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            key={product.id}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="relative w-full sm:max-w-lg bg-white dark:bg-slate-900 shadow-[-20px_0_60px_-10px_rgba(0,0,0,0.35)] flex flex-col"
          >
            {/* Header */}
            <header className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-bloom shrink-0 overflow-hidden"
                  style={{
                    background: form.imageUrl
                      ? "transparent"
                      : "linear-gradient(135deg,#e6007e,#a855f7)",
                  }}
                >
                  {form.imageUrl ? (
                    <img
                      src={form.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Edit3 size={16} className="text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                    Editar producto
                  </p>
                  <p className="text-base font-black truncate">
                    {form.name || "Sin nombre"}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X size={14} />
              </button>
            </header>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 scroll-container-ios">
              {/* SECCIÓN 1: DATOS GENERALES */}
              <Section title="Información general" icon={<Package size={13} />}>
                <div className="space-y-3">
                  {/* Foto */}
                  <div className="space-y-1.5">
                    <Label>Foto del producto</Label>
                    <ProductImageUploader
                      value={form.imageUrl}
                      onChange={form.setImageUrl}
                      folder={`products/${product.id}`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Nombre</Label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => form.setName(e.target.value)}
                      className="w-full h-11 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-sm font-black"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Categoría</Label>
                    <CategoryCombobox
                      value={form.category}
                      onChange={form.setCategory}
                      options={knownCategories}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Costo base ($)</Label>
                      <div className="relative">
                        <DollarSign
                          size={13}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={form.cost}
                          onChange={(e) =>
                            form.setCost(
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          className="w-full h-11 pl-8 pr-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-sm font-black tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Min stock</Label>
                      <div className="relative">
                        <Layers
                          size={13}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="number"
                          min={0}
                          value={form.minStock}
                          onChange={(e) =>
                            form.setMinStock(
                              e.target.value === "" ? "" : Number(e.target.value)
                            )
                          }
                          className="w-full h-11 pl-8 pr-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-sm font-black tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Precios sugeridos referencia */}
                  {form.sug && form.cost && (
                    <div className="rounded-2xl bg-pink-50/60 dark:bg-pink-500/10 border border-pink-100 dark:border-pink-500/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-black text-pink-600/80 uppercase tracking-widest">
                          Sugeridos
                        </span>
                        <Badge tone="primary" className="text-[8px]">
                          base {money(Number(form.cost))}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Pill label="Men" value={form.sug.men} />
                        <Pill label="Med" value={form.sug.med} />
                        <Pill label="May" value={form.sug.may} />
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* SECCIÓN 2: VARIANTES */}
              <Section
                title={`Variantes (${product.variants?.length ?? 0})`}
                icon={<Layers size={13} />}
              >
                {product.variants && product.variants.length > 0 ? (
                  <div className="space-y-2">
                    {product.variants.map((v) => (
                      <VariantRow
                        key={v.id}
                        variant={v}
                        productId={product.id}
                        onSaved={onSaved}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <Layers size={20} className="mx-auto mb-1 text-slate-300" />
                    <p className="text-[10px] font-bold text-slate-400">
                      Aún no hay variantes
                    </p>
                  </div>
                )}
              </Section>
            </div>

            {/* Footer */}
            <footer className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={form.saving}
                className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={form.save}
                disabled={form.saving}
                className="flex-[2] h-11 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-95 disabled:opacity-50"
              >
                {form.saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Guardar producto
              </button>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ─────────────────────────── helpers ─────────────────────────── */

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-1">
        <div className="text-primary">{icon}</div>
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          {title}
        </h3>
      </div>
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1 italic">
      {children}
    </label>
  )
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl px-2 py-1.5 text-center border border-pink-100/60 dark:border-pink-500/20">
      <p className="text-[7px] text-slate-400 font-black uppercase">{label}</p>
      <p className="text-[11px] font-black text-primary tabular-nums leading-tight">
        {money(value)}
      </p>
    </div>
  )
}

/* ─────────────────────────── Variante inline ─────────────────────────── */

function VariantRow({
  variant,
  productId,
  onSaved,
}: {
  variant: Variant
  productId: string
  onSaved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [stock, setStock] = useState<number>(Number(variant.stock) || 0)
  const [pm, setPm] = useState<number | "">(variant.price_menudeo ?? "")
  const [pmd, setPmd] = useState<number | "">(variant.price_medio ?? "")
  const [pma, setPma] = useState<number | "">(variant.price_mayoreo ?? "")
  const [imageUrl, setImageUrl] = useState<string | null>(
    (variant.image_urls && variant.image_urls[0]) ?? variant.image_url ?? null
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Detecta cambios pendientes
  const dirty = useMemo(() => {
    return (
      Number(stock) !== Number(variant.stock) ||
      Number(pm || 0) !== Number(variant.price_menudeo || 0) ||
      Number(pmd || 0) !== Number(variant.price_medio || 0) ||
      Number(pma || 0) !== Number(variant.price_mayoreo || 0) ||
      imageUrl !== ((variant.image_urls && variant.image_urls[0]) ?? variant.image_url ?? null)
    )
  }, [stock, pm, pmd, pma, imageUrl, variant])

  async function handleImageUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo imágenes")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La foto pesa más de 5MB")
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
      const path = `variants/${productId}/${variant.id}-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "31536000", upsert: false })
      if (upErr) throw upErr
      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(path)
      setImageUrl(publicUrl)
      toast.success("Foto cargada")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo subir")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateVariant(variant.id, {
        stock: Number(stock) || 0,
        price_menudeo: pm === "" ? null : Number(pm),
        price_medio: pmd === "" ? null : Number(pmd),
        price_mayoreo: pma === "" ? null : Number(pma),
        image_url: imageUrl,
        image_urls: imageUrl ? [imageUrl] : [],
      } as any)
      toast.success("Variante actualizada")
      onSaved()
    } catch (e: any) {
      toast.error(e?.message ?? "Error guardando variante")
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      layout
      className={`rounded-2xl border transition-colors ${
        dirty
          ? "border-primary/40 bg-primary/5"
          : "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/60"
      }`}
    >
      {/* Header compacto */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 p-2.5 text-left"
      >
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon size={16} className="text-slate-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black truncate">{variant.variant_name}</p>
          <p className="text-[9px] font-bold text-slate-400 truncate">
            Stock: <span className="text-emerald-600">{stock}</span>
            {pm !== "" && (
              <> · Men: <span className="text-primary">{formatMoney(Number(pm))}</span></>
            )}
          </p>
        </div>
        {dirty && (
          <span className="text-[8px] font-black uppercase tracking-widest text-primary mr-1">
            Editado
          </span>
        )}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          className="text-slate-400"
        >
          <ChevronDown size={14} />
        </motion.div>
      </button>

      {/* Body expandible */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-1 space-y-3 border-t border-slate-100 dark:border-slate-700">
              {/* Foto */}
              <div className="space-y-1">
                <Label>Imagen de la variante</Label>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} className="text-slate-300" />
                    )}
                  </div>
                  <label className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-primary hover:bg-primary/5 transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleImageUpload(f)
                      }}
                    />
                    {uploading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Camera size={12} />
                    )}
                    {imageUrl ? "Reemplazar" : "Subir foto"}
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      className="h-10 px-2 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase border border-rose-200"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>

              {/* Stock */}
              <div className="space-y-1">
                <Label>Stock disponible</Label>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(Number(e.target.value) || 0)}
                  className="w-full h-11 px-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-emerald-500 outline-none text-sm font-black tabular-nums"
                />
              </div>

              {/* Precios 3 tiers */}
              <div className="space-y-1">
                <Label>Precios por nivel</Label>
                <div className="grid grid-cols-3 gap-2">
                  <PriceInput label="Menudeo" value={pm} onChange={setPm} />
                  <PriceInput label="Medio" value={pmd} onChange={setPmd} />
                  <PriceInput label="Mayoreo" value={pma} onChange={setPma} />
                </div>
              </div>

              {/* Guardar variante */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="w-full h-10 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30 active:scale-95"
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                Guardar variante
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function PriceInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | ""
  onChange: (v: number | "") => void
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 text-center">
        {label}
      </p>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">
          $
        </span>
        <input
          type="number"
          step="0.01"
          min={0}
          value={value}
          onChange={(e) =>
            onChange(e.target.value === "" ? "" : Number(e.target.value))
          }
          placeholder="0.00"
          className="w-full h-10 pl-5 pr-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-[11px] font-black text-center tabular-nums"
        />
      </div>
    </div>
  )
}

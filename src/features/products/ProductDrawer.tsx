import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Save,
  Loader2,
  Package,
  Layers,
  ImageIcon,
  Camera,
  Plus,
  Trash2,
  DollarSign,
  Sparkles,
  Check,
  ChevronDown,
} from "lucide-react"
import { toast } from "react-hot-toast"

import CategoryCombobox from "../../components/ui/CategoryCombobox"
import MultiImageUploader from "../../components/ui/MultiImageUploader"
import Badge from "../../components/ui/Badge"
import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"
import { formatMoney } from "../../lib/format"
import { suggestedPrices, money } from "../pricing/suggest"
import { getPricingConfig } from "../pricing/pricingConfigService"
import {
  createProduct,
  createVariant,
  updateProduct,
  updateVariant,
} from "./productService"
import { applyMovement } from "../movements/movementService"
import type { Product, Variant } from "../../types/database"
import type { PricingConfig } from "../pricing/pricingTypes"

/* ──────────────────────────────────────────────────────────────────────
 * ProductDrawer — UN solo panel lateral para TODO el flujo del admin.
 * Reemplaza:
 *   ✕ EditProductModal      (drawer viejo)
 *   ✕ CreateProductModal    (modal iOS-style)
 *   ✕ CreateVariantModal    (modal iOS-style)
 *   ✕ EditVariantModal      (modal sobre modal)
 *   ✕ MovementModal         (modal de ajuste de stock)
 *
 * Modos:
 *   "create"  → producto nuevo (solo pestaña Datos hasta guardar)
 *   "edit"    → producto existente con tabs Datos / Variantes
 *   "stock"   → enfoca directamente la variante para ajustar stock rápido
 *
 * Las FOTOS viven solo en cada variante (galería interna de hasta 6).
 * El producto NO tiene foto propia: la "portada" mostrada al cliente es
 * la primera foto de la primera variante.
 * ────────────────────────────────────────────────────────────────────── */

type TabId = "general" | "variants"

/** localStorage key del borrador de "nuevo producto". */
const DRAFT_KEY = "mari:product-draft-new"
interface DraftShape {
  name: string
  category: string
  cost: number | ""
  minStock: number | ""
  savedAt?: number
}

interface Props {
  open: boolean
  mode: "create" | "edit" | "stock"
  /** Producto a editar (null cuando mode = "create") */
  product: Product | null
  /** Cuando mode = "stock", pre-expande esta variante para ajuste rápido */
  focusVariantId?: string | null
  /** Categorías ya usadas en el catálogo (para el combobox) */
  knownCategories?: string[]
  onClose: () => void
  onSaved: () => void
}

export default function ProductDrawer({
  open,
  mode,
  product,
  focusVariantId,
  knownCategories,
  onClose,
  onSaved,
}: Props) {
  // ──────────── Estado general del producto ────────────
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [cost, setCost] = useState<number | "">("")
  const [minStock, setMinStock] = useState<number | "">("")
  const [saving, setSaving] = useState(false)

  // La portada mostrada en el header del drawer es la primera foto
  // disponible de la primera variante con fotos. Si nadie tiene foto,
  // el header dibuja el ícono de paquete.
  const headerCover = useMemo(() => {
    const variants = product?.variants ?? []
    for (const v of variants) {
      if (v.image_urls && v.image_urls.length > 0) return v.image_urls[0]
      if (v.image_url) return v.image_url
    }
    return null
  }, [product?.variants])

  // ──────────── Pricing config (para sugeridos) ────────────
  const [pricingCfg, setPricingCfg] = useState<PricingConfig | null>(null)
  useEffect(() => {
    getPricingConfig().then(setPricingCfg).catch(() => setPricingCfg(null))
  }, [])

  // ──────────── Tab activa ────────────
  const [tab, setTab] = useState<TabId>("general")
  useEffect(() => {
    // Al abrir, decidimos pestaña inicial según el modo
    if (!open) return
    if (mode === "stock") setTab("variants")
    else setTab("general")
  }, [open, mode])

  // Listener global para abrir directamente la pestaña Variantes
  // (lo dispara ProductList cuando el admin hace "Agregar variante"
  // desde el popover de la card).
  useEffect(() => {
    if (!open) return
    const handler = () => setTab("variants")
    window.addEventListener("admin:open-variants-tab", handler)
    return () => window.removeEventListener("admin:open-variants-tab", handler)
  }, [open])

  // ──────────── Cargar datos del producto al abrir ────────────
  useEffect(() => {
    if (!open) return
    if (mode === "edit" || mode === "stock") {
      setName(product?.name ?? "")
      setCategory(product?.category ?? "")
      setCost(product?.cost ?? "")
      setMinStock(product?.min_stock ?? "")
    } else {
      // create — intenta recuperar un draft del localStorage
      try {
        const raw = localStorage.getItem(DRAFT_KEY)
        if (raw) {
          const draft = JSON.parse(raw) as DraftShape
          // Sólo si hay algo útil que mostrar
          if (draft.name || draft.category || draft.cost || draft.minStock) {
            setName(draft.name ?? "")
            setCategory(draft.category ?? "")
            setCost(draft.cost ?? "")
            setMinStock(draft.minStock ?? "")
            toast("Restauramos tu borrador anterior", { icon: "📝" })
            return
          }
        }
      } catch {}
      setName("")
      setCategory("")
      setCost("")
      setMinStock("")
    }
  }, [open, mode, product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ──────────── Auto-save de borrador (modo create) ────────────
  useEffect(() => {
    if (!open || mode !== "create") return
    // Si no hay nada, no guardamos nada
    if (!name && !category && cost === "" && minStock === "") {
      try { localStorage.removeItem(DRAFT_KEY) } catch {}
      return
    }
    const t = setTimeout(() => {
      try {
        const draft: DraftShape = { name, category, cost, minStock, savedAt: Date.now() }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      } catch {}
    }, 350)
    return () => clearTimeout(t)
  }, [open, mode, name, category, cost, minStock])

  // ──────────── Bloquear scroll body + ESC ────────────
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

  // ──────────── Precios sugeridos (referencia) ────────────
  const sug = useMemo(() => {
    if (!pricingCfg) return null
    const c = Number(cost)
    if (!Number.isFinite(c) || c <= 0) return null
    return suggestedPrices(c, pricingCfg)
  }, [pricingCfg, cost])

  // ──────────── Guardar producto (general) ────────────
  async function handleSaveProduct() {
    if (!name.trim()) {
      toast.error("Pon el nombre del producto")
      return
    }
    if (cost === "" || Number(cost) <= 0) {
      toast.error("Indica el costo unitario")
      return
    }
    setSaving(true)
    try {
      if (mode === "create") {
        const created = await createProduct({
          name: name.trim(),
          category: category.trim() || null,
          cost: Number(cost),
          min_stock: minStock === "" ? 0 : Number(minStock),
          // image_url se omite: las fotos viven solo por variante.
        })
        toast.success("Producto creado ✨")
        // Borrador ya no aplica: el producto se creó
        try { localStorage.removeItem(DRAFT_KEY) } catch {}
        onSaved()
        // Tras crear, mantenemos abierto el drawer pero cambiamos a modo edit
        // para que el admin agregue variantes sin reabrir nada.
        // Pasamos el id del nuevo producto vía el callback de refresh + un
        // pequeño shim local.
        setTab("variants")
        // Si quien nos invoca quiere seguir editando, le toca pasarnos el
        // producto creado en la próxima render. Nosotros cerramos para
        // dejar al parent re-abrir limpio si así lo decide.
        onClose()
        void created
      } else if (product) {
        await updateProduct(product.id, {
          name: name.trim(),
          category: category.trim() || null,
          cost: Number(cost),
          min_stock: minStock === "" ? 0 : Number(minStock),
        })
        toast.success("Cambios guardados")
        onSaved()
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error guardando")
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === "undefined" || !open) return null

  // ──────────── Tabs disponibles según modo ────────────
  const tabs: { id: TabId; label: string; icon: typeof Package }[] =
    mode === "create"
      ? [{ id: "general", label: "Datos", icon: Package }]
      : [
          { id: "general", label: "Datos", icon: Package },
          { id: "variants", label: "Variantes", icon: Layers },
        ]

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
            key={`${mode}-${product?.id ?? "new"}`}
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
                    background: headerCover
                      ? "transparent"
                      : "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                  }}
                >
                  {headerCover ? (
                    <img
                      src={headerCover}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package size={18} className="text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                    {mode === "create" ? "Nuevo producto" : "Editar producto"}
                  </p>
                  <p className="text-base font-black truncate">
                    {name || "Sin nombre"}
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

            {/* Tabs (solo en edit) */}
            {tabs.length > 1 && (
              <div className="flex items-center px-3 pt-3 gap-1 shrink-0 border-b border-slate-100 dark:border-slate-800">
                {tabs.map((t) => {
                  const Icon = t.icon
                  const active = tab === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`relative flex-1 h-10 rounded-t-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors ${
                        active
                          ? "text-primary bg-primary/5"
                          : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      <Icon size={12} />
                      {t.label}
                      {active && (
                        <motion.span
                          layoutId="prod-drawer-tab"
                          className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scroll-container-ios">
              {tab === "general" && (
                <GeneralTab
                  name={name}
                  setName={setName}
                  category={category}
                  setCategory={setCategory}
                  cost={cost}
                  setCost={setCost}
                  minStock={minStock}
                  setMinStock={setMinStock}
                  knownCategories={knownCategories}
                  sug={sug}
                />
              )}

              {tab === "variants" && product && (
                <VariantsTab
                  product={product}
                  focusVariantId={focusVariantId ?? null}
                  onSaved={onSaved}
                  pricingCfg={pricingCfg}
                />
              )}
            </div>

            {/* Footer global: solo cuando estamos en datos generales */}
            {tab === "general" && (
              <footer className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveProduct}
                  disabled={saving}
                  className="flex-[2] h-11 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-95 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {mode === "create" ? "Crear producto" : "Guardar"}
                </button>
              </footer>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ════════════════════════ TAB 1: GENERAL ════════════════════════ */
function GeneralTab({
  name,
  setName,
  category,
  setCategory,
  cost,
  setCost,
  minStock,
  setMinStock,
  knownCategories,
  sug,
}: {
  name: string
  setName: (v: string) => void
  category: string
  setCategory: (v: string) => void
  cost: number | ""
  setCost: (v: number | "") => void
  minStock: number | ""
  setMinStock: (v: number | "") => void
  knownCategories?: string[]
  sug: { men: number; med: number; may: number } | null
}) {
  return (
    <div className="space-y-4">
      {/* Banner explicativo: las fotos viven por variante. */}
      <div className="rounded-2xl bg-pink-50/60 dark:bg-pink-500/10 border border-pink-100 dark:border-pink-500/20 p-3 flex items-start gap-2 text-pink-700 dark:text-pink-300">
        <Sparkles size={14} className="shrink-0 mt-0.5" />
        <p className="text-[11px] font-bold leading-snug">
          Las fotos viven en cada{" "}
          <span className="font-black">variante</span> (hasta 6 c/u). En la
          tienda el cliente verá por defecto la primera foto de la primera
          variante.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Nombre</Label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Base Líquida HD 24h"
          className="w-full h-11 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-sm font-black"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Categoría</Label>
        <CategoryCombobox
          value={category}
          onChange={setCategory}
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
              value={cost}
              onChange={(e) =>
                setCost(e.target.value === "" ? "" : Number(e.target.value))
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
              value={minStock}
              onChange={(e) =>
                setMinStock(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full h-11 pl-8 pr-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-sm font-black tabular-nums"
            />
          </div>
        </div>
      </div>

      {sug && cost !== "" && (
        <div className="rounded-2xl bg-pink-50/60 dark:bg-pink-500/10 border border-pink-100 dark:border-pink-500/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-pink-600/80 uppercase tracking-widest">
              Sugeridos
            </span>
            <Badge tone="primary" className="text-[8px]">
              base {money(Number(cost))}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Pill label="Men" value={sug.men} />
            <Pill label="Med" value={sug.med} />
            <Pill label="May" value={sug.may} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════ TAB 2: VARIANTES ════════════════════════ */
function VariantsTab({
  product,
  focusVariantId,
  onSaved,
  pricingCfg,
}: {
  product: Product
  focusVariantId: string | null
  onSaved: () => void
  pricingCfg: PricingConfig | null
}) {
  const [openId, setOpenId] = useState<string | null>(focusVariantId)
  const [showNew, setShowNew] = useState(false)
  const [bulkInheriting, setBulkInheriting] = useState(false)

  // Si recibimos focusVariantId, abrimos esa fila al montar
  useEffect(() => {
    if (focusVariantId) setOpenId(focusVariantId)
  }, [focusVariantId])

  // Variantes sin foto propia (ni image_url ni image_urls con elementos).
  // Si el producto tiene foto principal, ofrecemos heredarla con 1 click.
  const variantsWithoutPhoto = useMemo(
    () =>
      (product.variants ?? []).filter((v) => {
        const hasUrls = Array.isArray(v.image_urls) && v.image_urls.length > 0
        const hasUrl = !!v.image_url
        return !hasUrls && !hasUrl
      }),
    [product.variants]
  )
  const canBulkInherit =
    !!product.image_url && variantsWithoutPhoto.length > 0

  async function inheritProductPhotoToAll() {
    if (!canBulkInherit || !product.image_url) return
    setBulkInheriting(true)
    const tid = toast.loading(
      `Asignando foto a ${variantsWithoutPhoto.length} ${
        variantsWithoutPhoto.length === 1 ? "variante" : "variantes"
      }...`
    )
    try {
      // Actualiza en paralelo. updateVariant ya maneja el fallback de
      // image_urls si la columna no existe (DB sin migración 0028).
      const results = await Promise.allSettled(
        variantsWithoutPhoto.map((v) =>
          updateVariant(v.id, {
            image_url: product.image_url,
            image_urls: [product.image_url!],
          } as any)
        )
      )
      const ok = results.filter((r) => r.status === "fulfilled").length
      const fail = results.length - ok
      if (fail === 0) {
        // Migración legacy completa: limpia image_url del producto para
        // que el banner desaparezca y ya no haya "portada del producto"
        // que confunda. La portada visible al cliente ahora sale de la
        // primera variante.
        try {
          await updateProduct(product.id, { image_url: null })
        } catch {
          /* noop — no es crítico que falle */
        }
        toast.success(
          `✨ Foto asignada a ${ok} ${ok === 1 ? "variante" : "variantes"}`,
          { id: tid }
        )
      } else {
        toast.error(
          `${ok} ok · ${fail} fallaron. Reintenta o sube fotos manuales.`,
          { id: tid }
        )
      }
      onSaved()
    } catch (e: any) {
      toast.error(e?.message ?? "Error asignando fotos", { id: tid })
    } finally {
      setBulkInheriting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          {product.variants?.length ?? 0} variantes
        </p>
        <button
          type="button"
          onClick={() => setShowNew((s) => !s)}
          className="h-9 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom active:scale-95"
        >
          <Plus size={12} strokeWidth={3} />
          Nueva variante
        </button>
      </div>

      {/* Banner masivo: heredar foto legacy del producto a las variantes
          sin foto. Solo aparece si el producto AÚN tiene image_url
          (campo legacy: antes el producto tenía portada propia, ahora
          las fotos viven en cada variante). Tras heredar, el image_url
          del producto se limpia y este banner deja de aparecer. */}
      {canBulkInherit && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-br from-amber-50 to-pink-50 dark:from-amber-500/10 dark:to-pink-500/10 border border-amber-200/70 dark:border-amber-500/30 p-3 flex items-start gap-3"
        >
          <div
            className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border-2 border-white shadow"
            style={{
              background: "linear-gradient(135deg,#fcd34d,#f9a8d4)",
            }}
          >
            <img
              src={product.image_url!}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
              Foto antigua del producto
            </p>
            <p className="text-[11px] font-bold text-amber-900/70 dark:text-amber-100/80 leading-snug">
              Tienes {variantsWithoutPhoto.length}{" "}
              {variantsWithoutPhoto.length === 1
                ? "variante sin foto"
                : "variantes sin foto"}
              . Hereda esta foto a todas para que se vean en la tienda
              mientras les tomas su propia foto.
            </p>
            <button
              type="button"
              onClick={inheritProductPhotoToAll}
              disabled={bulkInheriting}
              className="mt-2 h-8 px-3 rounded-lg bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow active:scale-95 disabled:opacity-50"
            >
              {bulkInheriting ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <ImageIcon size={11} />
              )}
              Heredar a {variantsWithoutPhoto.length === 1 ? "esa variante" : "todas"}
            </button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showNew && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <NewVariantForm
              productId={product.id}
              onDone={() => {
                setShowNew(false)
                onSaved()
              }}
              onCancel={() => setShowNew(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {product.variants && product.variants.length > 0 ? (
        <div className="space-y-2">
          {product.variants.map((v) => (
            <VariantAccordion
              key={v.id}
              variant={v}
              productId={product.id}
              productCost={product.cost ?? null}
              pricingCfg={pricingCfg}
              isOpen={openId === v.id}
              onToggle={() => setOpenId((id) => (id === v.id ? null : v.id))}
              onSaved={onSaved}
            />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <Layers size={22} className="mx-auto mb-1.5 text-slate-300" />
          <p className="text-[10px] font-bold text-slate-400">
            Aún no hay variantes. Crea la primera con "Nueva variante".
          </p>
        </div>
      )}
    </div>
  )
}

/* ──────────── Sub-bloque: formulario inline NUEVA variante ──────────── */
function NewVariantForm({
  productId,
  onDone,
  onCancel,
}: {
  productId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [vName, setVName] = useState("")
  const [sku, setSku] = useState("")
  const [stock, setStock] = useState<number | "">("")
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!vName.trim()) {
      toast.error("Pon el nombre de la variante")
      return
    }
    setSaving(true)
    try {
      // 🎯 Auto-calcular precios sugeridos basados en el costo del producto
      // y la configuración de márgenes. Así la variante nace CON precios y
      // no aparece $0 en menudeo/medio/mayoreo.
      const [{ data: prod }, cfg] = await Promise.all([
        supabase
          .from("products")
          .select("cost")
          .eq("id", productId)
          .maybeSingle(),
        getPricingConfig().catch(() => null),
      ])
      const cost = Number(prod?.cost) || 0
      let priceFields: Partial<Variant> = {}
      if (cost > 0 && cfg) {
        const sug = suggestedPrices(cost, cfg)
        priceFields = {
          price: Math.round(sug.men * 100) / 100,
          price_menudeo: Math.round(sug.men * 100) / 100,
          price_medio: Math.round(sug.med * 100) / 100,
          price_mayoreo: Math.round(sug.may * 100) / 100,
        }
      }

      const v = await createVariant({
        product_id: productId,
        variant_name: vName.trim(),
        sku: sku.trim() || null,
        ...priceFields,
      })
      const qty = Number(stock) || 0
      if (qty > 0) {
        await applyMovement({
          variantId: v.id,
          type: "entrada",
          quantity: qty,
        })
      }
      const msg = cost > 0 && cfg
        ? `Variante creada con precios sugeridos${qty > 0 ? " + stock" : ""}`
        : qty > 0
        ? "Variante + stock inicial creados"
        : "Variante creada"
      toast.success(msg)
      onDone()
    } catch (e: any) {
      toast.error(e?.message ?? "Error creando variante")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl bg-pink-50/40 dark:bg-pink-500/5 border border-pink-200/60 dark:border-pink-500/20 p-3 space-y-2 mb-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-primary">
        Nueva variante
      </p>
      <input
        type="text"
        value={vName}
        onChange={(e) => setVName(e.target.value)}
        placeholder="Ej. Tono Canela 03"
        className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold outline-none focus:border-primary"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="SKU (opcional)"
          className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold uppercase outline-none focus:border-primary"
        />
        <input
          type="number"
          min={0}
          value={stock}
          onChange={(e) =>
            setStock(e.target.value === "" ? "" : Number(e.target.value))
          }
          placeholder="Stock inicial"
          className="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-center tabular-nums outline-none focus:border-primary"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="flex-[2] h-9 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Crear
        </button>
      </div>
    </div>
  )
}

/* ──────────── Sub-bloque: acordeón de UNA variante ──────────── */
function VariantAccordion({
  variant,
  productId,
  productCost,
  pricingCfg,
  isOpen,
  onToggle,
  onSaved,
}: {
  variant: Variant
  productId: string
  productCost: number | null
  pricingCfg: PricingConfig | null
  isOpen: boolean
  onToggle: () => void
  onSaved: () => void
}) {
  const [vName, setVName] = useState(variant.variant_name ?? "")
  const [sku, setSku] = useState(variant.sku ?? "")
  const [stock, setStock] = useState<number>(Number(variant.stock) || 0)
  const [pm, setPm] = useState<number | "">(variant.price_menudeo ?? "")
  const [pmd, setPmd] = useState<number | "">(variant.price_medio ?? "")
  const [pma, setPma] = useState<number | "">(variant.price_mayoreo ?? "")
  const [images, setImages] = useState<string[]>(() =>
    variant.image_urls && variant.image_urls.length > 0
      ? variant.image_urls
      : variant.image_url
      ? [variant.image_url]
      : []
  )
  const [saving, setSaving] = useState(false)

  // Re-sincroniza con el prop cuando cambia (ej. después de onSaved → refetch).
  // Sin esto el formulario queda con datos viejos al guardar y reabrir.
  useEffect(() => {
    setVName(variant.variant_name ?? "")
    setSku(variant.sku ?? "")
    setStock(Number(variant.stock) || 0)
    setPm(variant.price_menudeo ?? "")
    setPmd(variant.price_medio ?? "")
    setPma(variant.price_mayoreo ?? "")
    setImages(
      variant.image_urls && variant.image_urls.length > 0
        ? variant.image_urls
        : variant.image_url
        ? [variant.image_url]
        : []
    )
  }, [variant.id, variant.variant_name, variant.sku, variant.stock,
      variant.price_menudeo, variant.price_medio, variant.price_mayoreo,
      variant.image_url, JSON.stringify(variant.image_urls ?? [])])

  // Sugeridos calculados desde el costo del producto (referencia)
  const sug = useMemo(() => {
    if (!pricingCfg) return null
    const c = Number(productCost) || 0
    if (c <= 0) return null
    return suggestedPrices(c, pricingCfg)
  }, [pricingCfg, productCost])

  // ¿Los 3 precios están vacíos? → mostrar banner de aplicar sugeridos
  const noPrices =
    (pm === "" || Number(pm) === 0) &&
    (pmd === "" || Number(pmd) === 0) &&
    (pma === "" || Number(pma) === 0)

  function applySuggested() {
    if (!sug) return
    setPm(Math.round(sug.men * 100) / 100)
    setPmd(Math.round(sug.med * 100) / 100)
    setPma(Math.round(sug.may * 100) / 100)
    toast.success("Precios sugeridos aplicados — guarda para confirmar")
  }

  const dirty = useMemo(() => {
    return (
      vName !== (variant.variant_name ?? "") ||
      sku !== (variant.sku ?? "") ||
      Number(stock) !== Number(variant.stock) ||
      Number(pm || 0) !== Number(variant.price_menudeo || 0) ||
      Number(pmd || 0) !== Number(variant.price_medio || 0) ||
      Number(pma || 0) !== Number(variant.price_mayoreo || 0) ||
      JSON.stringify(images) !==
        JSON.stringify(
          variant.image_urls && variant.image_urls.length > 0
            ? variant.image_urls
            : variant.image_url
            ? [variant.image_url]
            : []
        )
    )
  }, [vName, sku, stock, pm, pmd, pma, images, variant])

  async function handleSave() {
    if (!vName.trim()) {
      toast.error("Nombre requerido")
      return
    }
    setSaving(true)
    try {
      await updateVariant(variant.id, {
        variant_name: vName.trim(),
        sku: sku.trim() || null,
        stock: Number(stock) || 0,
        price_menudeo: pm === "" ? null : Number(pm),
        price_medio: pmd === "" ? null : Number(pmd),
        price_mayoreo: pma === "" ? null : Number(pma),
        image_urls: images,
        image_url: images[0] ?? null,
      } as any)
      toast.success(
        images.length > 0
          ? `Variante actualizada · ${images.length} ${images.length === 1 ? "foto" : "fotos"}`
          : "Variante actualizada"
      )
      onSaved()
    } catch (e: any) {
      debug.error("[VariantAccordion.handleSave]", e)
      toast.error(e?.message ?? "Error guardando")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar variante "${variant.variant_name}"?`)) return
    setSaving(true)
    try {
      await updateVariant(variant.id, { is_active: false } as any)
      toast.success("Variante eliminada")
      onSaved()
    } catch (e: any) {
      toast.error(e?.message ?? "Error eliminando")
    } finally {
      setSaving(false)
    }
  }

  const cover = images[0]
  const hasOwnPhoto = images.length > 0

  return (
    <motion.div
      layout
      className={`rounded-2xl border transition-colors ${
        dirty
          ? "border-primary/40 bg-primary/5"
          : hasOwnPhoto
          ? "border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/60"
          : "border-amber-200/60 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-2.5 text-left"
      >
        <div
          className={`relative w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center shrink-0 ${
            cover
              ? "bg-slate-100 dark:bg-slate-700"
              : "bg-amber-100 dark:bg-amber-500/20 ring-2 ring-amber-200 dark:ring-amber-500/30"
          }`}
        >
          {cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <Camera size={16} className="text-amber-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black truncate flex items-center gap-1.5">
            {vName}
            {!hasOwnPhoto && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[8px] font-black uppercase tracking-widest shrink-0">
                Sin foto
              </span>
            )}
          </p>
          <p className="text-[9px] font-bold text-slate-400 truncate">
            <span className="text-emerald-600">{stock} pz</span>
            {pm !== "" && (
              <>
                {" · "}
                <span className="text-primary">{formatMoney(Number(pm))}</span>
              </>
            )}
          </p>
        </div>
        {dirty && (
          <span className="text-[8px] font-black uppercase tracking-widest text-primary mr-1">
            Editado
          </span>
        )}
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className="text-slate-400">
          <ChevronDown size={14} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-1 space-y-3 border-t border-slate-100 dark:border-slate-700">
              {/* Galería de fotos de la variante */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Fotos (la 1ª es la portada)</Label>
                  {dirty && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Sparkles size={8} />
                      Sin guardar
                    </span>
                  )}
                </div>
                <MultiImageUploader
                  value={images}
                  onChange={setImages}
                  folder={`variants/${productId}/${variant.id}`}
                  label="Subir fotos"
                  max={6}
                />
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 italic pl-1">
                  💡 Las fotos se suben al instante. Pulsa <span className="text-primary font-black">Guardar variante</span> abajo para que el cliente las vea en la tienda.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <input
                    type="text"
                    value={vName}
                    onChange={(e) => setVName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <Label>SKU</Label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold uppercase outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Stock disponible</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStock((s) => Math.max(0, s - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-lg font-black"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value) || 0)}
                    className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-black tabular-nums text-center outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setStock((s) => s + 1)}
                    className="w-10 h-10 rounded-xl bg-emerald-500 text-white text-lg font-black"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Precios por nivel</Label>
                  {sug && (
                    <button
                      type="button"
                      onClick={applySuggested}
                      className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-1"
                    >
                      <Sparkles size={10} />
                      Usar sugeridos
                    </button>
                  )}
                </div>
                {noPrices && sug && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2 mb-1 flex items-start gap-2">
                    <Sparkles size={12} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest">
                        Sin precios
                      </p>
                      <p className="text-[10px] font-bold text-amber-700/80 dark:text-amber-200/80 leading-tight">
                        Toca "Usar sugeridos" para aplicar Menudeo{" "}
                        {money(sug.men)} · Medio {money(sug.med)} · Mayoreo{" "}
                        {money(sug.may)}
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <PriceInput label="Menudeo" value={pm} onChange={setPm} />
                  <PriceInput label="Medio" value={pmd} onChange={setPmd} />
                  <PriceInput label="Mayoreo" value={pma} onChange={setPma} />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  aria-label="Eliminar variante"
                  className="h-10 px-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
                >
                  <Trash2 size={11} /> Eliminar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="flex-1 h-10 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-30 active:scale-95"
                >
                  {saving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  Guardar variante
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ════════════════════════ helpers visuales ════════════════════════ */
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

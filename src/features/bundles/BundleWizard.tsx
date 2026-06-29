import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Sparkles,
  Check,
  Package,
  ChevronRight,
  ChevronLeft,
} from "lucide-react"
import toast from "react-hot-toast"

import { formatMoney } from "../../lib/format"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import type { Bundle } from "./bundlesService"

interface PublicVariantLite {
  id: string
  product_id: string
  variant_name: string
  stock: number
  price_menudeo: number | null
  price: number | null
  image_url: string | null
  image_urls?: string[] | null
}

interface PublicProductLite {
  id: string
  name: string
  variants: PublicVariantLite[]
}

interface Props {
  open: boolean
  bundle: Bundle | null
  /** Catálogo público para resolver variantes elegibles + stock. */
  products: PublicProductLite[]
  onClose: () => void
  /** Recibe la lista de variantes elegidas por el cliente con cantidad
   *  y el precio efectivo POR PIEZA después del descuento de paquete. */
  onConfirm: (
    lines: { variantId: string; qty: number; unitPrice: number }[],
    meta: { bundleName: string },
  ) => void
}

/**
 * Wizard de armado de paquete: el cliente avanza slot por slot, elige
 * una variante de las elegibles (o cualquiera activa si el slot es libre)
 * y al final confirma. El precio se calcula sumando los precios menudeo
 * de cada variante seleccionada y aplicando el descuento del bundle.
 *
 * El descuento del bundle se distribuye proporcionalmente a cada variante
 * en `unitPrice` (no como línea aparte) para que cada item del carrito
 * conserve su precio efectivo y el total siempre cuadre.
 */
export default function BundleWizard({
  open,
  bundle,
  products,
  onClose,
  onConfirm,
}: Props) {
  const [stepIx, setStepIx] = useState(0)
  /** selections[slotIx] = variantId elegido (o null) */
  const [selections, setSelections] = useState<(string | null)[]>([])

  useBodyScrollLock(open)

  // Reset cuando cambia el bundle / se abre
  useEffect(() => {
    if (!open || !bundle) return
    setStepIx(0)
    setSelections(bundle.slots.map(() => null))
  }, [open, bundle])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const slots = bundle?.slots ?? []
  const totalSlots = slots.length
  const currentSlot = slots[stepIx]

  // Variantes elegibles para el slot actual (filtradas por stock>0)
  const eligibleVariants = useMemo(() => {
    if (!currentSlot) return []
    const allVariants = products.flatMap((p) =>
      p.variants.map((v) => ({ ...v, product_name: p.name })),
    )
    const allowed =
      currentSlot.eligible_variant_ids.length > 0
        ? allVariants.filter((v) =>
            currentSlot.eligible_variant_ids.includes(v.id),
          )
        : allVariants
    return allowed.filter((v) => Number(v.stock) > 0)
  }, [currentSlot, products])

  /** Suma de precios menudeo de variantes seleccionadas. */
  const subtotal = useMemo(() => {
    if (!bundle) return 0
    return selections.reduce((acc, vId, ix) => {
      if (!vId) return acc
      const variant = products
        .flatMap((p) => p.variants)
        .find((v) => v.id === vId)
      if (!variant) return acc
      const price = variant.price_menudeo ?? variant.price ?? 0
      const qty = bundle.slots[ix]?.qty ?? 1
      return acc + price * qty
    }, 0)
  }, [selections, bundle, products])

  const discountAmt = useMemo(() => {
    if (!bundle || subtotal <= 0) return 0
    return Math.round(subtotal * (bundle.discount_percent / 100) * 100) / 100
  }, [subtotal, bundle])

  const finalTotal = Math.max(0, subtotal - discountAmt)

  const allChosen = selections.every((s) => s !== null)

  function selectVariant(variantId: string) {
    setSelections((prev) => {
      const next = [...prev]
      next[stepIx] = variantId
      return next
    })
    // Auto-avanzar al siguiente slot si no es el último
    if (stepIx < totalSlots - 1) {
      setTimeout(() => setStepIx(stepIx + 1), 240)
    }
  }

  function confirm() {
    if (!bundle || !allChosen) return
    // Calculamos el factor de descuento global para repartir el % entre
    // todas las variantes. Si subtotal=0 (edge case) no hay descuento.
    const factor = subtotal > 0 ? finalTotal / subtotal : 1
    const lines = selections.map((variantId, ix) => {
      const variant = products
        .flatMap((p) => p.variants)
        .find((v) => v.id === variantId!)
      const basePrice = variant?.price_menudeo ?? variant?.price ?? 0
      const qty = bundle.slots[ix]?.qty ?? 1
      return {
        variantId: variantId!,
        qty,
        unitPrice: Math.round(basePrice * factor * 100) / 100,
      }
    })
    onConfirm(lines, { bundleName: bundle.name })
    toast.success(`¡Paquete "${bundle.name}" agregado!`, { duration: 2200 })
    onClose()
  }

  if (typeof document === "undefined" || !bundle) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[180] flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28 }}
            className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] sm:rounded-3xl pb-safe max-h-[90vh] flex flex-col shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.45)]"
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header con imagen del bundle (si hay) o icono fallback */}
            <div className="flex items-start gap-3 px-5 pb-3 shrink-0">
              {bundle.image_url ? (
                <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 shadow-bloom ring-2 ring-white dark:ring-slate-900">
                  <img
                    src={bundle.image_url}
                    alt={bundle.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-bloom"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                  }}
                >
                  <Package size={22} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                  <Sparkles size={9} /> Paquete
                  {bundle.discount_percent > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[8px] bg-primary text-white">
                      -{bundle.discount_percent}%
                    </span>
                  )}
                </p>
                <h3 className="text-base font-black tracking-tight truncate">
                  {bundle.name}
                </h3>
                {bundle.description && (
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                    {bundle.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 press shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Progress dots */}
            <div className="px-5 pb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                {slots.map((s, i) => {
                  const done = selections[i] !== null
                  const isCurrent = i === stepIx
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setStepIx(i)}
                      className={`flex-1 h-1.5 rounded-full transition-colors ${
                        done
                          ? "bg-primary"
                          : isCurrent
                          ? "bg-primary/40"
                          : "bg-slate-200 dark:bg-slate-700"
                      }`}
                      title={s.label}
                    />
                  )
                })}
              </div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1.5">
                Paso {stepIx + 1} de {totalSlots} · elige tu{" "}
                <strong className="text-slate-700 dark:text-slate-200">
                  {currentSlot?.label}
                </strong>
                {currentSlot?.qty && currentSlot.qty > 1 && (
                  <span className="ml-1 text-primary">({currentSlot.qty} pz)</span>
                )}
              </p>
            </div>

            {/* Grid de variantes elegibles */}
            <div className="flex-1 overflow-y-auto px-5 py-3 scroll-container-ios">
              {eligibleVariants.length === 0 ? (
                <div className="py-10 text-center text-slate-400">
                  <Package size={32} className="mx-auto mb-2" />
                  <p className="text-xs font-bold">
                    No hay variantes con stock para este slot.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {eligibleVariants.map((v) => {
                    const isPicked = selections[stepIx] === v.id
                    const cover =
                      v.image_urls?.[0] ?? v.image_url ?? null
                    const price = v.price_menudeo ?? v.price ?? 0
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => selectVariant(v.id)}
                        className={`relative rounded-2xl border-2 p-1.5 text-left transition-all ${
                          isPicked
                            ? "border-primary bg-primary/10 scale-[1.02]"
                            : "border-slate-200 dark:border-slate-700 hover:border-primary/40"
                        }`}
                      >
                        <div className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden mb-1.5">
                          {cover ? (
                            <img
                              src={cover}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <Package size={20} />
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] font-black leading-tight truncate">
                          {(v as any).product_name}
                        </p>
                        <p className="text-[9px] font-bold text-slate-500 truncate">
                          {v.variant_name}
                        </p>
                        <p className="text-[10px] font-black text-primary tabular-nums">
                          {formatMoney(price)}
                        </p>
                        {isPicked && (
                          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow-bloom">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer: precios + acciones */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 space-y-2 shrink-0 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-bold">Subtotal piezas</span>
                <span className="tabular-nums font-bold">
                  {formatMoney(subtotal)}
                </span>
              </div>
              {discountAmt > 0 && (
                <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Sparkles size={11} />
                    Ahorras con paquete
                  </span>
                  <span className="tabular-nums">
                    -{formatMoney(discountAmt)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                  Total
                </span>
                <span className="text-xl font-black text-primary tabular-nums leading-none">
                  {formatMoney(finalTotal)}
                </span>
              </div>
              {discountAmt > 0 && allChosen && (
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 text-center pt-0.5">
                  🎉 Te ahorras {formatMoney(discountAmt)} con este paquete
                </p>
              )}

              <div className="flex gap-2 pt-2">
                {stepIx > 0 && (
                  <button
                    type="button"
                    onClick={() => setStepIx((i) => Math.max(0, i - 1))}
                    className="h-11 px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press"
                  >
                    <ChevronLeft size={12} /> Atrás
                  </button>
                )}
                {stepIx < totalSlots - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setStepIx((i) => Math.min(totalSlots - 1, i + 1))
                    }
                    disabled={selections[stepIx] === null}
                    className="flex-1 h-11 rounded-2xl bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 press-hard"
                  >
                    Siguiente <ChevronRight size={12} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={!allChosen}
                    className="bg-brand flex-1 h-11 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-40 press-hard"
                  >
                    <Check size={12} strokeWidth={3} /> Agregar al carrito
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

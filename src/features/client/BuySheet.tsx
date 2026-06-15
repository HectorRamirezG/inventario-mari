import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, PanInfo } from "framer-motion"
import {
  X,
  Plus,
  Minus,
  ShoppingBag,
  Package,
  Sparkles,
  AlertTriangle,
} from "lucide-react"

import { formatMoney } from "../../lib/format"

/* Estructura mínima reutilizable desde ClientShopPage */
export interface BuySheetVariant {
  id: string
  product_id: string
  variant_name: string
  stock: number
  price: number
  image_url: string | null
}

export interface BuySheetProduct {
  id: string
  name: string
  category: string | null
  image_url: string | null
  variants: BuySheetVariant[]
}

interface Props {
  open: boolean
  product: BuySheetProduct | null
  /** Cantidades pre-cargadas (las que ya tiene el carrito por variante) */
  initialQty?: Record<string, number>
  onClose: () => void
  /** Recibe el batch completo: solo variantes con qty > 0 */
  onConfirm: (lines: { variantId: string; qty: number }[]) => void
}

/**
 * Bottom Sheet de compra (estilo Shein/Uber Eats). Muestra todas las
 * variantes del producto con su foto, precio y selector +/-. El botón
 * final empuja el batch completo al carrito de una sola vez.
 */
export default function BuySheet({
  open,
  product,
  initialQty,
  onClose,
  onConfirm,
}: Props) {
  const [qty, setQty] = useState<Record<string, number>>({})

  // Reinicia cantidades cuando se abre con otro producto
  useEffect(() => {
    if (open && product) {
      const base: Record<string, number> = {}
      for (const v of product.variants) {
        base[v.id] = initialQty?.[v.id] ?? 0
      }
      setQty(base)
    }
  }, [open, product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bloquear scroll del body
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function change(variantId: string, delta: number, max: number) {
    setQty((q) => {
      const next = Math.max(0, Math.min(max, (q[variantId] ?? 0) + delta))
      return { ...q, [variantId]: next }
    })
  }

  const totalUnits = useMemo(
    () => Object.values(qty).reduce((a, b) => a + (b || 0), 0),
    [qty]
  )

  const totalAmt = useMemo(() => {
    if (!product) return 0
    return product.variants.reduce((acc, v) => {
      const q = qty[v.id] ?? 0
      return acc + q * v.price
    }, 0)
  }, [qty, product])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  function confirm() {
    if (!product) return
    const lines = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([variantId, q]) => ({ variantId, qty: q }))
    if (lines.length === 0) return
    onConfirm(lines)
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[180] flex items-end justify-center"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[88vh] flex flex-col touch-pan-y"
          >
            {/* Handle drag */}
            <div className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pb-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package size={20} className="text-slate-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                    Elige tus tonos
                  </p>
                  <p className="text-base font-black truncate">{product.name}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Lista de variantes con selector +/- */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 scroll-container-ios">
              {product.variants.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Package size={28} className="mx-auto mb-2" />
                  <p className="text-xs font-bold">Este producto no tiene variantes.</p>
                </div>
              ) : (
                product.variants.map((v) => {
                  const q = qty[v.id] ?? 0
                  const out = v.stock <= 0
                  const atMax = !out && q >= v.stock
                  return (
                    <motion.div
                      key={v.id}
                      layout
                      className={`flex flex-col gap-1.5 p-2.5 rounded-2xl border transition-colors ${
                        q > 0
                          ? "bg-primary/5 border-primary/30"
                          : "bg-slate-50 dark:bg-slate-800/60 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl bg-white dark:bg-slate-700 overflow-hidden flex items-center justify-center text-slate-300 shrink-0">
                          {v.image_url ? (
                            <img
                              src={v.image_url}
                              alt={v.variant_name}
                              loading="lazy"
                              className={`w-full h-full object-cover ${out ? "opacity-40" : ""}`}
                            />
                          ) : (
                            <Package size={18} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black truncate">{v.variant_name}</p>
                          <p className="text-sm font-black text-primary tabular-nums">
                            {formatMoney(v.price)}
                          </p>
                          {out ? (
                            <p className="text-[9px] font-black uppercase text-rose-500">
                              Agotado
                            </p>
                          ) : v.stock <= 3 ? (
                            <p className="text-[9px] font-bold text-amber-600 uppercase">
                              ¡Últimas {v.stock}!
                            </p>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold">
                              {v.stock} disponibles
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => change(v.id, -1, v.stock)}
                            disabled={q === 0 || out}
                            aria-label="Restar"
                            className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-sm border border-slate-200 dark:border-slate-600 disabled:opacity-40 active:scale-90 transition-transform"
                          >
                            <Minus size={14} />
                          </button>
                          <motion.span
                            key={q}
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 380, damping: 20 }}
                            className="w-7 text-center text-sm font-black tabular-nums"
                          >
                            {q}
                          </motion.span>
                          <button
                            type="button"
                            onClick={() => change(v.id, 1, v.stock)}
                            disabled={out || q >= v.stock}
                            aria-label="Sumar"
                            className="w-9 h-9 rounded-full text-white flex items-center justify-center shadow-bloom disabled:opacity-30 active:scale-90 transition-transform"
                            style={{
                              background: "linear-gradient(135deg,#e6007e,#a855f7)",
                            }}
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                      {/* Cápsula explicativa cuando ya llegó al tope */}
                      <AnimatePresence>
                        {atMax && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -4, height: 0 }}
                            transition={{ type: "spring", stiffness: 320, damping: 22 }}
                            className="overflow-hidden"
                          >
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                              <AlertTriangle size={11} className="shrink-0" />
                              <span>
                                Ya llevas las {v.stock} piezas disponibles de
                                este tono. {v.stock <= 3 ? "¡Aprovéchalas! ✨" : ""}
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })
              )}
            </div>

            {/* Footer: resumen + CTA único */}
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 space-y-3">
              {totalUnits > 0 ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold">
                    {totalUnits} {totalUnits === 1 ? "pieza" : "piezas"}
                  </span>
                  <span className="font-black text-base tabular-nums">
                    {formatMoney(totalAmt)}
                  </span>
                </div>
              ) : (
                <p className="text-[10px] text-center text-slate-400 italic">
                  Elige al menos una pieza para continuar
                </p>
              )}

              <button
                type="button"
                onClick={confirm}
                disabled={totalUnits === 0}
                className="w-full h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 shadow-bloom disabled:opacity-40 active:scale-[0.98] transition-transform"
                style={{
                  background: "linear-gradient(135deg,#e6007e,#a855f7)",
                }}
              >
                <ShoppingBag size={16} />
                Agregar al carrito
                {totalUnits > 0 && <Sparkles size={13} />}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

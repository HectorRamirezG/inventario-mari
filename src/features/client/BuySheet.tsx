import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, PanInfo } from "framer-motion"

// Imports normales de lucide-react (no deep imports a `dist/esm/icons/*`).
// Los deep imports daban "Could not find a declaration file" porque
// lucide solo expone tipos en su entry point principal. Vite + Rollup
// hacen tree-shaking nativo, así que importar desde el root NO mete
// los 1000+ iconos al bundle: solo los que realmente usas.
import {
  X,
  Plus,
  Minus,
  ShoppingBag,
  Package,
  Sparkles,
  AlertTriangle,
  Target,
  Bell,
  BellRing,
} from "lucide-react"
import toast from "react-hot-toast"

import { useAuth } from "../../lib/useAuth"
import { haptic } from "../../lib/sound"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { getBusinessRules } from "../settings/businessRulesService"
import { formatMoney } from "../../lib/format"
import { imageAvatar } from "../../lib/imageTransform"
import StickerWaButton from "./StickerWaButton"
import ProductConversation from "../../components/ui/ProductConversation"
import LiveViewersChip from "./LiveViewersChip"
import CustomerPhotosGallery from "./CustomerPhotosGallery"
import {
  detectCartTier,
  priceForTier,
  piecesToNextTier,
  TIER_LABEL,
} from "../sales/salesTier"
import type { PricingTier } from "../pricing/pricingTypes"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_INNER_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"
import { useDeferredMount } from "../../lib/useDeferredMount"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"

/* Estructura mínima reutilizable desde ClientShopPage */
export interface BuySheetVariant {
  id: string
  product_id: string
  variant_name: string
  stock: number
  /** Precio "actual" mostrado en el catálogo (suele ser menudeo). */
  price: number
  /** Precios por nivel — cuando existen el sheet puede mostrar la
   *  proyección de ahorro al añadir más piezas. */
  price_menudeo?: number | null
  price_medio?: number | null
  price_mayoreo?: number | null
  image_url: string | null
  /** Color hex del tono real (ej. "#B22222" para Cherry Bomb). Opcional
   *  — si no existe, no se renderiza el swatch. La columna en BD es
   *  `swatch_hex` en `variants`; si no está, el dato llega
   *  undefined y el componente lo ignora silenciosamente. */
  swatch_hex?: string | null
}

/**
 * Valida formato hex (#RGB o #RRGGBB). Defensa contra strings inválidos
 * en BD que tirarían el CSS o crearían un swatch invisible.
 */
function isValidHex(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
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
  /** Cantidad TOTAL de piezas que el cliente YA tiene en el carrito
   *  (de cualquier producto). Sirve para proyectar el tier en vivo
   *  mientras añade más en este sheet. */
  baseCartQty?: number
  /** Umbrales del tier configurados por Mari. */
  thresholds?: { medio_min_qty: number; mayoreo_min_qty: number }
  /**
   * Si `true` (default), bloquear agregar al carrito variantes con
   * stock=0. Si `false`, permite preventa: el cliente puede comprar
   * sin existencia y verá una etiqueta clara "Preventa — entrega luego".
   * Controlado por la regla `block_oversell` de business_rules.
   */
  blockOversell?: boolean
  /** Descuento (%) aplicado al precio cuando la variante se vende en
   *  preventa. Default 10. Solo se usa si blockOversell=false y stock=0. */
  preorderDiscountPct?: number
  /** Variante a la que el cliente tocó "+" en el catálogo / lightbox.
   *  El sheet hace scroll a ella y la resalta con un ring — NO toca la
   *  qty (eso confunde, ver bug "+1 al primero"). */
  preselectedVariantId?: string | null
  onClose: () => void
  /** Recibe el batch completo: solo variantes con qty > 0. El flag
   *  `isPreorder` viaja por línea: true cuando la variante se está
   *  vendiendo SIN stock (preventa). El parent decide el precio final
   *  con el descuento configurado. */
  onConfirm: (
    lines: { variantId: string; qty: number; isPreorder: boolean }[],
  ) => void
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
  baseCartQty = 0,
  thresholds,
  blockOversell = true,
  preorderDiscountPct = 0,
  preselectedVariantId = null,
  onClose,
  onConfirm,
}: Props) {
  const [qty, setQty] = useState<Record<string, number>>({})
  // Refs por variante para hacer scrollIntoView a la preseleccionada.
  const variantRefs = useRef<Record<string, HTMLDivElement | null>>({})

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

  // Scroll suave a la variante preseleccionada al abrir el sheet.
  // (Sin ring/pulse — generaba un parpadeo molesto. El scroll basta
  // para dirigir la atención.)
  useEffect(() => {
    if (!open || !preselectedVariantId) return
    const id = preselectedVariantId
    const t = window.setTimeout(() => {
      const el = variantRefs.current[id]
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 220)
    return () => window.clearTimeout(t)
  }, [open, preselectedVariantId, product?.id])

  // Bloquear scroll del body (centralizado para evitar leaks).
  useBodyScrollLock(open)

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
      const current = q[variantId] ?? 0
      const next = Math.max(0, Math.min(max, current + delta))
      // Haptic suave solo si efectivamente cambió (no en topes).
      if (next !== current) haptic.light()
      return { ...q, [variantId]: next }
    })
  }

  /** Limpia esta variante del selector (Quitar todo). Útil cuando el
   *  cliente está atMax y quiere descartar todo de un tap. */
  function clearVariant(variantId: string) {
    haptic.medium()
    setQty((q) => ({ ...q, [variantId]: 0 }))
  }

  const totalUnits = useMemo(
    () => Object.values(qty).reduce((a, b) => a + (b || 0), 0),
    [qty]
  )

  /**
   * Tier proyectado del carrito si confirmáramos ahora: la cantidad
   * TOTAL son las piezas que el cliente ya tenía + las que está
   * agregando en este sheet. fija los umbrales (3 piezas para
   * medio, 6 para mayoreo por default).
   */
  const projectedQty = baseCartQty + totalUnits
  const projectedTier: PricingTier = useMemo(() => {
    if (!thresholds) return "menudeo"
    return detectCartTier(projectedQty, {
      umbral_medio: thresholds.medio_min_qty,
      umbral_mayoreo: thresholds.mayoreo_min_qty,
    })
  }, [projectedQty, thresholds])

  /** Lo que falta para subir al próximo tier (si aplica). */
  const nextStep = useMemo(() => {
    if (!thresholds) return null
    return piecesToNextTier(projectedQty, {
      umbral_medio: thresholds.medio_min_qty,
      umbral_mayoreo: thresholds.mayoreo_min_qty,
    })
  }, [projectedQty, thresholds])

  /** Precio efectivo de una variante con el tier proyectado. Si la
   *  variante no tiene precios escalonados cargados, cae a `price`. */
  function effectivePrice(v: BuySheetVariant): number {
    if (
      v.price_menudeo == null &&
      v.price_medio == null &&
      v.price_mayoreo == null
    ) {
      return v.price
    }
    return priceForTier(
      {
        price_menudeo: (Number(v.price_menudeo ?? v.price) || 0) as number,
        price_medio: (Number(v.price_medio) || 0) as number,
        price_mayoreo: (Number(v.price_mayoreo) || 0) as number,
      },
      projectedTier,
    )
  }

  const totalAmt = useMemo(() => {
    if (!product) return 0
    return product.variants.reduce((acc, v) => {
      const q = qty[v.id] ?? 0
      return acc + q * effectivePrice(v)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, product, projectedTier])

  /** Ahorro proyectado vs menudeo si subió de tier. */
  const projectedSavings = useMemo(() => {
    if (!product || projectedTier === "menudeo") return 0
    return product.variants.reduce((acc, v) => {
      const q = qty[v.id] ?? 0
      if (q === 0) return acc
      const menudeo = v.price_menudeo ?? v.price
      const effective = effectivePrice(v)
      return acc + q * Math.max(0, menudeo - effective)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, product, projectedTier])

  /**
   * Ahorro EXTRA que el cliente desbloquearía si lograra subir al
   * siguiente tier (medio→mayoreo, o menudeo→medio). Se calcula
   * sobre el carrito ACTUAL (qty del sheet) — la idea es decirle:
   * "si lograras subir, sobre lo que ya tienes encarrito ahorrarías $X
   * adicional". Si ya está en mayoreo o no hay próximo tier, es 0.
   */
  const potentialSavings = useMemo(() => {
    if (!product || !nextStep) return 0
    return product.variants.reduce((acc, v) => {
      const q = qty[v.id] ?? 0
      if (q === 0) return acc
      const currentEff = effectivePrice(v)
      const nextPriceRaw = priceForTier(
        {
          price_menudeo: (Number(v.price_menudeo ?? v.price) || 0) as number,
          price_medio: (Number(v.price_medio) || 0) as number,
          price_mayoreo: (Number(v.price_mayoreo) || 0) as number,
        },
        nextStep.tier,
      )
      const diff = Math.max(0, currentEff - nextPriceRaw)
      return acc + q * diff
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, product, nextStep, projectedTier])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  function confirm(e?: React.MouseEvent<HTMLButtonElement>) {
    if (!product) return
    const lines = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([variantId, q]) => {
        // Una línea es preventa cuando la variante aún no tiene stock
        // pero la tienda permite preventa (block_oversell=false). El
        // parent recibirá la flag y aplicará el descuento correspondiente.
        const v = product.variants.find((x) => x.id === variantId)
        const isPreorder =
          !blockOversell && !!v && (v.stock ?? 0) <= 0
        return { variantId, qty: q, isPreorder }
      })
    if (lines.length === 0) return
    // Animación "vuelo al carrito": dispara antes del callback para
    // que el botón aún exista en el DOM (luego el sheet se cierra).
    const totalAdded = lines.reduce((s, l) => s + l.qty, 0)
    if (e?.currentTarget) {
      import("../../lib/flyToCart")
        .then(({ flyToCart }) =>
          flyToCart(e.currentTarget, { symbol: `+${totalAdded}` }),
        )
        .catch(() => {
          /* noop */
        })
    }
    // Mini-celebración la PRIMERA VEZ del día que el cliente agrega
    // algo al carrito. Engagement positivo. Guard localStorage para
    // no disparar más de una vez por día por dispositivo.
    try {
      if (typeof window !== "undefined") {
        const today = new Date().toISOString().slice(0, 10)
        const key = "mari:first-add-of-day"
        if (localStorage.getItem(key) !== today) {
          localStorage.setItem(key, today)
          import("../../lib/confetti")
            .then(({ fireConfetti }) =>
              fireConfetti({ duration: 1200, count: 40 }),
            )
            .catch(() => {
              /* noop */
            })
        }
      }
    } catch {
      /* noop */
    }
    onConfirm(lines)
  }

  // Contenido secundario (Q&A) se monta tras la animación de entrada
  // para no competir por el hilo principal en los primeros frames.
  const showSecondary = useDeferredMount(open)

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && product && (
        <div
          className="fixed inset-0 z-[180] flex items-end justify-center"
          style={{ isolation: "isolate" }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            className="absolute inset-0 bg-slate-950/70 z-0"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={OVERLAY_PANEL_TRANSITION}
            className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[88vh] flex flex-col"
            style={OVERLAY_PANEL_STYLE}
          >
            {/* Handle drag — único elemento arrastrable para cerrar. */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={onDragEnd}
              className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0 touch-none"
            >
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </motion.div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pb-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      width={96}
                      height={96}
                      decoding="async"
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
                  <LiveViewersChip productId={product.id} />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Sticker WhatsApp — descarga 512×512 webp para compartir
                    el producto con amigas. Marketing orgánico. */}
                <StickerWaButton
                  productName={product.name}
                  imageUrl={product.image_url ?? null}
                  price={
                    product.variants
                      .map((v) => Number(v.price_menudeo ?? v.price) || 0)
                      .filter((n) => n > 0)
                      .sort((a, b) => a - b)[0] ?? 0
                  }
                  iconOnly
                />
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Mini-resumen sticky: solo cuando ya hay piezas seleccionadas
                en este sheet. Sirve para que el total no se "pierda" al
                hacer scroll por la lista de variantes. */}
            {totalUnits > 0 && (
              <div className="px-4 pb-2 shrink-0">
                <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-primary/10 dark:bg-primary/15 border border-primary/30">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                    {totalUnits} {totalUnits === 1 ? "pieza" : "piezas"}
                  </span>
                  <span
                    aria-live="polite"
                    className="text-sm font-black tabular-nums text-primary"
                  >
                    {formatMoney(totalAmt)}
                  </span>
                </div>
              </div>
            )}

            {/* Lista de variantes con selector +/- */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 scroll-container-ios">
              {/* Banner de tier: muestra siempre que haya algo en este sheet
                  o en el carrito previo. Le dice al cliente exactamente
                  qué precio se le va a aplicar y cuánto le falta para subir. */}
              {thresholds && (projectedQty > 0) && baseCartQty === 0 && (
                <TierBanner
                  tier={projectedTier}
                  next={nextStep}
                  savings={projectedSavings}
                  potentialNextSavings={potentialSavings}
                />
              )}

              {product.variants.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Package size={28} className="mx-auto mb-2" />
                  <p className="text-xs font-bold">Este producto no tiene variantes.</p>
                </div>
              ) : (
                product.variants.map((v) => {
                  const q = qty[v.id] ?? 0
                  const outOfStock = v.stock <= 0
                  // Si la tienda permite preventa (regla block_oversell=false),
                  // el botón + sigue activo aunque stock=0 con un tope holgado
                  // (5 piezas para no abrir la puerta a abusos). El cliente
                  // recibe un aviso visual de "Preventa".
                  const PREORDER_CAP = 5
                  const allowPreorder = !blockOversell && outOfStock
                  const effectiveStock = allowPreorder
                    ? PREORDER_CAP
                    : v.stock
                  // `out` controla el bloqueo duro de +/-. Solo bloquea cuando
                  // está agotado Y NO se permite preventa.
                  const out = outOfStock && !allowPreorder
                  const atMax = !out && q >= effectiveStock
                  const menudeoPrice = v.price_menudeo ?? v.price
                  const effective = effectivePrice(v)
                  // Precio especial preventa: descuento configurable sobre
                  // el precio efectivo cuando la variante se vende sin stock.
                  // Se muestra al cliente como motivador para pagar antes.
                  const preorderPrice = allowPreorder
                    ? Math.round(
                        effective * (1 - preorderDiscountPct / 100) * 100,
                      ) / 100
                    : effective
                  const showPreorderDiscount =
                    allowPreorder && preorderDiscountPct > 0 && preorderPrice < effective
                  const hasDiscount =
                    projectedTier !== "menudeo" && effective < menudeoPrice
                  return (
                    <div
                      key={v.id}
                      ref={(el) => { variantRefs.current[v.id] = el }}
                      className={`flex flex-col gap-1.5 p-2.5 rounded-2xl border transition-colors ${
                        q > 0
                          ? "bg-primary/5 border-primary/30"
                          : "bg-slate-50 dark:bg-slate-800/60 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Miniatura: object-cover llena el cuadro. bg neutro
                            como respaldo para imagenes con fondo transparente.
                            Si la variante tiene swatch_hex, overlay con un
                            círculo del color real (esquina inferior derecha). */}
                        <div className="relative w-14 h-14 rounded-xl bg-slate-50 dark:bg-slate-900/40 overflow-hidden flex items-center justify-center text-slate-300 shrink-0">
                          {v.image_url ? (
                            <img
                              src={imageAvatar(v.image_url) || v.image_url}
                              alt={v.variant_name}
                              loading="lazy"
                              decoding="async"
                              width={112}
                              height={112}
                              className={`w-full h-full object-cover ${out ? "opacity-40" : ""}`}
                            />
                          ) : (
                            <Package size={18} />
                          )}
                          {isValidHex(v.swatch_hex) && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-sm"
                              style={{ backgroundColor: v.swatch_hex! }}
                              aria-label={`Color: ${v.swatch_hex}`}
                              title={`Tono ${v.swatch_hex}`}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black truncate">{v.variant_name}</p>
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <p
                              className={`text-sm font-black tabular-nums ${
                                showPreorderDiscount
                                  ? "text-violet-600 dark:text-violet-400"
                                  : "text-primary"
                              }`}
                            >
                              {formatMoney(showPreorderDiscount ? preorderPrice : effective)}
                            </p>
                            {showPreorderDiscount && (
                              <span className="text-[9px] font-bold text-slate-400 line-through tabular-nums">
                                {formatMoney(effective)}
                              </span>
                            )}
                            {hasDiscount && !showPreorderDiscount && (
                              <span className="text-[9px] font-bold text-slate-400 line-through tabular-nums">
                                {formatMoney(menudeoPrice)}
                              </span>
                            )}
                          </div>
                          {out ? (
                            <p className="text-[9px] font-black uppercase text-rose-500">
                              Agotado
                            </p>
                          ) : allowPreorder ? (
                            <p className="text-[9px] font-black uppercase text-violet-600 dark:text-violet-400">
                              📦 Preventa{showPreorderDiscount ? ` · ${preorderDiscountPct}% OFF` : ""}
                            </p>
                          ) : v.stock <= 3 ? (
                            <p
                              className={`text-[9px] font-black uppercase ${
                                v.stock === 1
                                  ? "text-rose-600 dark:text-rose-400 animate-pulse"
                                  : "text-amber-600"
                              }`}
                            >
                              {v.stock === 1 ? "🔥 ¡ÚLTIMA!" : `¡Últimas ${v.stock}!`}
                            </p>
                          ) : (
                            <p className="text-[9px] text-slate-400 font-bold">
                              {v.stock} disponibles
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Caso especial: preventa con q=0. En vez de mostrar
                              −/+ pelados (que subían a 1 de un toque sin avisar
                              que era preventa), pintamos un botón explícito
                              "Pedir en preventa" que requiere clic consciente. */}
                          {allowPreorder && q === 0 ? (
                            <button
                              type="button"
                              onClick={() => change(v.id, 1, effectiveStock)}
                              aria-label="Pedir en preventa"
                              className="h-9 px-3 rounded-full bg-violet-500 hover:bg-violet-600 text-white text-[9px] font-black uppercase tracking-widest shadow-bloom active:scale-95 transition-transform flex items-center gap-1"
                            >
                              📦 Preventa
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => change(v.id, -1, effectiveStock)}
                                disabled={q === 0 || out}
                                aria-label="Restar"
                                className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-sm border border-slate-200 dark:border-slate-600 disabled:opacity-40 active:scale-90 transition-transform"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-7 text-center text-sm font-black tabular-nums">
                                {q}
                              </span>
                              <button
                                type="button"
                                onClick={() => change(v.id, 1, effectiveStock)}
                                disabled={out || q >= effectiveStock}
                                aria-label="Sumar"
                                className="bg-brand w-9 h-9 rounded-full text-white flex items-center justify-center shadow-bloom disabled:opacity-30 active:scale-90 transition-transform"
                              >
                                <Plus size={14} strokeWidth={3} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {atMax && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                          <AlertTriangle size={11} className="shrink-0" />
                          <span className="flex-1">
                            {allowPreorder
                              ? `Tope de preventa: ${PREORDER_CAP} piezas.`
                              : `Solo había ${v.stock} de este tono · ya las tienes todas.`}
                          </span>
                          {/* Quitar variante completa en 1 tap — antes el
                              cliente tenía que hacer N taps en el botón -.
                              Solo si lleva 2+ piezas para que tenga sentido. */}
                          {q >= 2 && (
                            <button
                              type="button"
                              onClick={() => clearVariant(v.id)}
                              className="shrink-0 px-2 h-6 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-[9px] font-black uppercase tracking-widest press"
                              aria-label="Quitar todas las piezas de esta variante"
                            >
                              Quitar todo
                            </button>
                          )}
                        </div>
                      )}
                      {/* Cliente puede pedir que le avisemos cuando vuelva
                          a haber stock — útil cuando está agotado de verdad
                          (no pre-orden). El SQL fix_stock_alerts.sql crea
                          el trigger que dispara la notif al reponer. */}
                      {out && (
                        <NotifyOnStockButton
                          variantId={v.id}
                        />
                      )}
                    </div>
                  )
                })
              )}

              {/* Bio personal de Mari + chip de garantía — humaniza
                  la decisión de compra y reduce ansiedad de cliente nuevo. */}
              {(() => {
                const store = getStoreInfo()
                const rules = getBusinessRules()
                const showBio = !!store.owner_bio.trim()
                const showWarranty = rules.claim_window_enabled && rules.claim_window_hours > 0
                if (!showBio && !showWarranty) return null
                return (
                  <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {showBio && (
                      <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed italic">
                        “{store.owner_bio}”
                      </p>
                    )}
                    {showWarranty && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase tracking-widest">
                        ✓ Garantía {rules.claim_window_hours >= 24
                          ? `${Math.round(rules.claim_window_hours / 24)} días`
                          : `${rules.claim_window_hours} h`}{" "}· cambio sin problema
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Galería de fotos REALES de clientas — más convincente
                  que la foto de estudio. Aparece solo si hay reviews con
                  image_url aprobadas. */}
              <CustomerPhotosGallery productId={product.id} />

              {/* Q&A público del producto — diferido para no competir con la animación. */}
              {showSecondary && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={OVERLAY_INNER_TRANSITION}
                  className="pt-4 border-t border-slate-100 dark:border-slate-800"
                >
                  <ProductConversation productId={product.id} productName={product.name} />
                </motion.div>
              )}
            </div>

            {/* Footer: resumen + CTA único */}
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0 space-y-3">
              {totalUnits > 0 ? (
                <>
                  {/* Si el tier proyectado dió descuento, lo destacamos */}
                  {projectedTier !== "menudeo" && (
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                      <span className="text-emerald-600 dark:text-emerald-300 flex items-center gap-1">
                        <Sparkles size={11} />
                        Precio {TIER_LABEL[projectedTier]}
                      </span>
                      {projectedSavings > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-300 tabular-nums">
                          Ahorras {formatMoney(projectedSavings)}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">
                      {totalUnits} {totalUnits === 1 ? "pieza" : "piezas"}
                    </span>
                    <span className="font-black text-base tabular-nums">
                      {formatMoney(totalAmt)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-center text-slate-400 italic">
                  Elige al menos una pieza para continuar
                </p>
              )}

              <button
                type="button"
                onClick={(e) => confirm(e)}
                disabled={totalUnits === 0}
                className="bg-brand w-full h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 shadow-bloom disabled:opacity-40 active:scale-[0.98] transition-transform"
              >
                <ShoppingBag size={16} />
                Agregar al carrito
                {totalUnits > 0 && <Sparkles size={13} />}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/**
 * Banner de tier proyectado que ve el cliente arriba del listado.
 * Estados:
 *   - mayoreo (verde): el cliente ya está al mejor precio. Muestra
 *     cuánto está ahorrando vs menudeo.
 *   - medio (sky/azul cielo): mejor precio que menudeo activado.
 *     Muestra ahorro actual + cuánto MÁS ahorraría si llega a mayoreo.
 *   - menudeo (amber): aún no desbloquea descuento por volumen. Muestra
 *     cuánto ahorraría si llega al próximo tier (medio).
 *
 * Copy en lenguaje simple: "Llevas X · Ahorras $Y · Lleva N más y ahorras
 * $Z extra". El objetivo es que el cliente sepa de un vistazo qué precio
 * está pagando y cuánto le conviene sumar más piezas.
 */
function TierBanner({
  tier,
  next,
  savings,
  potentialNextSavings,
}: {
  tier: PricingTier
  next: { tier: PricingTier; missing: number } | null
  savings: number
  /** Ahorro adicional si lograra el próximo tier (vs precio actual). */
  potentialNextSavings: number
}) {
  if (tier === "mayoreo") {
    return (
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 p-3 flex items-start gap-2">
        <Sparkles size={14} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
            ¡Precio mayoreo activo! 🎉
          </p>
          {savings > 0 && (
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
              Llevándote esta cantidad ahorras{" "}
              <span className="font-black">{formatMoney(savings)}</span> en
              total.
            </p>
          )}
        </div>
      </div>
    )
  }
  if (tier === "medio") {
    return (
      <div className="rounded-2xl bg-sky-50 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30 p-3 flex items-start gap-2">
        <Sparkles size={14} className="text-sky-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-300">
            ¡Medio mayoreo activo!
          </p>
          {savings > 0 && (
            <p className="text-[10px] font-bold text-sky-700 dark:text-sky-300 mt-0.5">
              Ya ahorras <span className="font-black">{formatMoney(savings)}</span>{" "}
              vs el precio normal.
            </p>
          )}
          {next && next.missing > 0 && (
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1">
              🎯 Lleva {next.missing} {next.missing === 1 ? "pieza" : "piezas"} más
              {potentialNextSavings > 0 && (
                <>
                  {" "}
                  y ahorras{" "}
                  <span className="font-black">
                    {formatMoney(potentialNextSavings)}
                  </span>{" "}
                  extra.
                </>
              )}
            </p>
          )}
        </div>
      </div>
    )
  }
  // menudeo: aún no hay descuento. Mostramos lo que ahorraría al subir.
  if (!next) return null
  return (
    <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 p-3 flex items-start gap-2">
      <Target size={14} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
          ¡Compra más, paga menos!
        </p>
        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mt-0.5">
          Lleva {next.missing} {next.missing === 1 ? "pieza" : "piezas"} más y
          desbloqueas precio{" "}
          <span className="font-black uppercase">
            {TIER_LABEL[next.tier].toLowerCase()}
          </span>
          .
        </p>
        {potentialNextSavings > 0 && (
          <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            🎯 Te ahorrarías{" "}
            <span className="font-black">
              {formatMoney(potentialNextSavings)}
            </span>{" "}
            sobre lo que ya elegiste.
          </p>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * Notify-on-stock — botón inline en variante agotada.
 * Persiste subscripción en tabla `stock_alerts` via RPC. Si el
 * cliente está logueado, usa su email; si no, le pide el email
 * con un input inline. Best-effort: si la tabla/RPC no existe,
 * muestra toast amigable sin romperse.
 * ───────────────────────────────────────────────────────────── */

function NotifyOnStockButton({
  variantId,
}: {
  variantId: string
}) {
  const { email: authEmail, fullName } = useAuth()
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [emailInput, setEmailInput] = useState("")
  const [checked, setChecked] = useState(false)

  // Si está logueado, chequeamos si ya está suscrito al montar.
  useEffect(() => {
    if (!authEmail || checked) return
    let alive = true
    ;(async () => {
      try {
        const { isSubscribedToStock } = await import("./stockAlertsService")
        const sub = await isSubscribedToStock(variantId, authEmail)
        if (alive) {
          setSubscribed(sub)
          setChecked(true)
        }
      } catch {
        if (alive) setChecked(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [authEmail, variantId, checked])

  async function handleSubscribe(emailToUse: string) {
    const clean = emailToUse.trim().toLowerCase()
    if (!clean || !clean.includes("@")) {
      toast.error("Pon un email válido")
      return
    }
    setBusy(true)
    try {
      const { subscribeStockAlert } = await import("./stockAlertsService")
      const ok = await subscribeStockAlert(
        variantId,
        clean,
        fullName ?? null,
      )
      if (ok) {
        setSubscribed(true)
        setShowEmailInput(false)
        toast.success("Te avisaremos cuando vuelva 💜")
      } else {
        toast.error("Aún no podemos suscribirte. Intenta más tarde.")
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleUnsubscribe() {
    if (!authEmail) return
    setBusy(true)
    try {
      const { unsubscribeStockAlert } = await import("./stockAlertsService")
      const ok = await unsubscribeStockAlert(variantId, authEmail)
      if (ok) {
        setSubscribed(false)
        toast.success("Cancelamos tu aviso")
      }
    } finally {
      setBusy(false)
    }
  }

  // Estado 1: ya suscrito → chip verde
  if (subscribed) {
    return (
      <button
        type="button"
        onClick={handleUnsubscribe}
        disabled={busy}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-black disabled:opacity-50"
      >
        <BellRing size={11} className="shrink-0" />
        Te avisaremos · cancelar
      </button>
    )
  }

  // Estado 2: input de email visible (cliente anónimo)
  if (showEmailInput) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSubscribe(emailInput)
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="tu@email.com"
          autoFocus
          disabled={busy}
          className="flex-1 h-8 px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={busy || !emailInput.trim()}
          className="h-8 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => {
            setShowEmailInput(false)
            setEmailInput("")
          }}
          className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
          aria-label="Cancelar"
        >
          <X size={12} />
        </button>
      </form>
    )
  }

  // Estado 3: idle → botón "Avísame cuando llegue"
  return (
    <button
      type="button"
      onClick={() => {
        if (authEmail) {
          handleSubscribe(authEmail)
        } else {
          setShowEmailInput(true)
        }
      }}
      disabled={busy}
      className="w-full h-11 px-3 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50"
    >
      <Bell size={13} className="shrink-0" />
      Avísame cuando vuelva 💛
    </button>
  )
}

import { useMemo, useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Edit3,
  Trash2,
  Package,
  Plus,
  ImageIcon,
  Layers,
  TrendingUp,
  ArrowUp,
  Sparkles,
  X,
  Loader2,
} from "lucide-react"
import toast from "react-hot-toast"

import VariantImageCarousel from "../../components/ui/VariantImageCarousel"
import ProductLightbox, { type LightboxSlide } from "../../components/ui/ProductLightbox"
import { formatMoney } from "../../lib/format"
import type { Product, Variant } from "../../types/database"
import { deleteProduct, updateVariant } from "./productService"
import { applyMovement } from "../movements/movementService"

interface Props {
  product: Product
  refresh: () => void
  /** Abre el ProductDrawer en modo "edit" para este producto */
  onEdit: (product: Product) => void
  /** Abre el ProductDrawer en modo "stock" centrado en una variante específica */
  onQuickStock: (product: Product, variantId: string) => void
  /** Abre el ProductDrawer en modo "edit" y la tab Variantes para agregar una nueva */
  onAddVariant: (product: Product) => void
}

/**
 * Tarjeta de producto del Admin — estilo TIENDA (espejo de ProductCardClient)
 * pero con superpoderes: lápiz para abrir el Drawer único, stock visible en
 * los chips de variante, y botón "+" con popover de acciones rápidas.
 */
export default function ProductCard({
  product,
  refresh,
  onEdit,
  onQuickStock,
  onAddVariant,
}: Props) {
  const variants = product.variants ?? []
  const [selected, setSelected] = useState<string | null>(variants[0]?.id ?? null)

  const variant = useMemo(
    () => variants.find((v) => v.id === selected) ?? variants[0],
    [variants, selected]
  )

  const totalStock = useMemo(
    () => variants.reduce((acc, v) => acc + (Number(v.stock) || 0), 0),
    [variants]
  )

  const minPrice = useMemo(() => {
    const arr = variants
      .map((v) => Number(v.price_menudeo ?? v.price ?? 0))
      .filter((p) => p > 0)
    return arr.length ? Math.min(...arr) : null
  }, [variants])

  // Galería para el VariantImageCarousel.
  // REGLA CRÍTICA: TODA variante debe estar presente para que el
  // selectedVariantId siempre matchee al cambiar de chip. Si una variante
  // no tiene fotos propias, hereda en cascada de la PRIMERA variante con
  // fotos. NO usamos product.image_url como fallback porque el producto
  // ya no tiene foto propia (esa idea está deprecada).
  const carouselSafe = useMemo(() => {
    if (variants.length === 0) return []
    const firstWithImgs = variants.find((v) => {
      const arr =
        v.image_urls && v.image_urls.length > 0
          ? v.image_urls
          : v.image_url
          ? [v.image_url]
          : []
      return arr.length > 0
    })
    const fallback: string[] = (() => {
      if (firstWithImgs) {
        if (firstWithImgs.image_urls && firstWithImgs.image_urls.length > 0)
          return firstWithImgs.image_urls
        if (firstWithImgs.image_url) return [firstWithImgs.image_url]
      }
      // Último recurso (legacy): si NADIE tiene foto pero el producto sí
      // (campo viejo), úsalo. El banner del drawer le va a pedir migrar.
      if (product.image_url) return [product.image_url]
      return []
    })()
    return variants.map((v) => {
      const own =
        v.image_urls && v.image_urls.length > 0
          ? v.image_urls
          : v.image_url
          ? [v.image_url]
          : []
      return {
        id: v.id,
        name: v.variant_name,
        images: own.length > 0 ? own : fallback,
      }
    })
  }, [variants, product.image_url])

  // Popover de acción rápida del botón "+"
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!popoverOpen) return
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [popoverOpen])

  // Slides para el Lightbox: aplana TODAS las fotos de TODAS las variantes
  // (foto principal del producto primero si existe y no la repite ninguna
  // variante)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxStart, setLightboxStart] = useState(0)
  const lightboxSlides = useMemo<LightboxSlide[]>(() => {
    const out: LightboxSlide[] = []
    const seen = new Set<string>()
    // Incluir cada variante con sus imágenes propias
    variants.forEach((v) => {
      const own =
        v.image_urls && v.image_urls.length > 0
          ? v.image_urls
          : v.image_url
          ? [v.image_url]
          : []
      own.forEach((url) => {
        if (!url || seen.has(url)) return
        seen.add(url)
        out.push({ url, variantId: v.id, variantName: v.variant_name })
      })
    })
    // Fallback al producto si todavía no hay fotos
    if (out.length === 0 && product.image_url) {
      out.push({
        url: product.image_url,
        variantId: variants[0]?.id ?? "_main",
        variantName: product.name,
      })
    }
    return out
  }, [variants, product.image_url, product.name])

  function openLightbox() {
    if (lightboxSlides.length === 0) {
      onEdit(product)
      return
    }
    // Empieza en la primera foto de la variante seleccionada (si existe)
    const idx = selected
      ? lightboxSlides.findIndex((s) => s.variantId === selected)
      : 0
    setLightboxStart(idx >= 0 ? idx : 0)
    setLightboxOpen(true)
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return
    try {
      await deleteProduct(product.id)
      toast.success("Producto eliminado")
      refresh()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo eliminar")
    }
  }

  const lowStock = (product.min_stock ?? 0) > 0 && totalStock <= (product.min_stock ?? 0)

  // ¿Hay AL MENOS una foto real en alguna variante?
  // Si no, mostramos un placeholder atractivo + CTA en vez del carrusel.
  const hasAnyPhoto = carouselSafe.some((v) => v.images.length > 0)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className="bg-white dark:bg-slate-800/60 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow"
    >
      {/* Imagen + Carrusel (o placeholder si no hay fotos) */}
      <div className="relative">
        {hasAnyPhoto ? (
          <VariantImageCarousel
            variants={carouselSafe}
            selectedVariantId={selected}
            aspect="1/1"
            onTap={openLightbox}
            className="rounded-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onEdit(product)}
            className="w-full aspect-square bg-gradient-to-br from-pink-50 via-purple-50 to-amber-50 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-700/60 flex flex-col items-center justify-center gap-2 text-primary/70 hover:text-primary transition-colors group"
            aria-label="Agregar fotos al producto"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/70 dark:bg-slate-900/40 backdrop-blur flex items-center justify-center shadow-bloom group-hover:scale-110 transition-transform">
              <ImageIcon size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Sin fotos
            </span>
            <span className="text-[9px] font-bold text-slate-400">
              Toca para subir
            </span>
          </button>
        )}
        {/* Contador de fotos reales (solo si hay >1) */}
        {hasAnyPhoto && lightboxSlides.length > 1 && (
          <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-white text-[9px] font-black tabular-nums shadow">
            {lightboxSlides.length} fotos
          </span>
        )}
        {/* Badge stock bajo */}
        {lowStock && hasAnyPhoto && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest z-10 shadow-bloom">
            Stock bajo
          </span>
        )}
        {/* Badge sin costo (admin) */}
        {product.cost == null && hasAnyPhoto && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest z-10">
            Sin costo
          </span>
        )}
      </div>

      {/* Cuerpo */}
      <div className="p-3 space-y-2">
        {/* Título + lápiz */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black truncate" title={product.name}>
              {product.name}
            </p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              {product.category ?? "General"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onEdit(product)}
            aria-label="Editar producto"
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center hover:text-primary active:scale-90 transition-all shrink-0"
            title="Editar producto"
          >
            <Edit3 size={13} />
          </button>
        </div>

        {/* Chips de variantes con stock (clic cambia foto) */}
        {variants.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {variants.slice(0, 6).map((v) => {
              const active = v.id === selected
              const out = (Number(v.stock) || 0) <= 0
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(v.id)
                  }}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-colors flex items-center gap-1 ${
                    active
                      ? "bg-primary text-white"
                      : out
                      ? "bg-rose-50 text-rose-500 dark:bg-rose-500/10"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                  title={`Stock: ${v.stock} pz`}
                >
                  <span className="truncate max-w-[120px]">{v.variant_name}</span>
                  <span
                    className={`tabular-nums font-black text-[8px] ${
                      active
                        ? "opacity-90"
                        : out
                        ? "text-rose-500"
                        : (Number(v.stock) || 0) <= 3
                        ? "text-amber-600"
                        : "text-emerald-600"
                    }`}
                  >
                    ({v.stock})
                  </span>
                </button>
              )
            })}
            {variants.length > 6 && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                +{variants.length - 6}
              </span>
            )}
          </div>
        )}

        {/* Precio + stock + acciones rápidas. Stock con color semántico:
            verde = bien, ámbar = bajo, rojo = agotado total. */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-base font-black text-primary tabular-nums leading-none">
                {minPrice ? formatMoney(minPrice) : "—"}
              </span>
              {variants.length > 0 && (
                <span
                  className={`text-[9px] font-black uppercase tracking-widest tabular-nums ${
                    totalStock === 0
                      ? "text-rose-500"
                      : lowStock
                      ? "text-amber-600"
                      : "text-emerald-600"
                  }`}
                >
                  {totalStock} pz
                </span>
              )}
            </div>
            {variants.length === 0 && (
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mt-0.5">
                Sin variantes
              </p>
            )}
          </div>

          {/* Botón "+" con popover de acción rápida */}
          <div ref={popoverRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPopoverOpen((o) => !o)
              }}
              aria-label="Acción rápida"
              className="w-9 h-9 rounded-full text-white flex items-center justify-center shadow-bloom active:scale-90 transition-transform"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            >
              <Plus size={14} strokeWidth={3} />
            </button>

            <AnimatePresence>
              {popoverOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -6 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                  className="absolute right-0 bottom-full mb-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25)] border border-slate-100 dark:border-slate-700 overflow-hidden z-20"
                >
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Acción rápida
                    </p>
                  </div>

                  {variant && (
                    <button
                      type="button"
                      onClick={() => {
                        setPopoverOpen(false)
                        if (variant) onQuickStock(product, variant.id)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                        <ArrowUp size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black truncate">
                          Sumar stock
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 truncate">
                          {variant.variant_name}
                        </p>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setPopoverOpen(false)
                      onAddVariant(product)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-pink-50 dark:hover:bg-pink-500/10 transition-colors border-t border-slate-100 dark:border-slate-800"
                  >
                    <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300 flex items-center justify-center shrink-0">
                      <Layers size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black truncate">
                        Agregar variante
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 truncate">
                        Nuevo tono / modelo
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPopoverOpen(false)
                      onEdit(product)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                      <Edit3 size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black truncate">
                        Editar todo
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 truncate">
                        Datos, precios, fotos
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPopoverOpen(false)
                      handleDelete()
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors border-t border-slate-100 dark:border-slate-800 text-rose-600 dark:text-rose-400"
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center shrink-0">
                      <Trash2 size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black truncate">
                        Eliminar
                      </p>
                      <p className="text-[9px] font-bold opacity-70 truncate">
                        Borra el producto
                      </p>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Lightbox: muestra TODAS las fotos de TODAS las variantes */}
      <ProductLightbox
        open={lightboxOpen}
        slides={lightboxSlides}
        startIndex={lightboxStart}
        onClose={() => setLightboxOpen(false)}
        onVariantChange={(vid) => setSelected(vid)}
      />
    </motion.div>
  )
}

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, Star, Loader2, Package } from "lucide-react"

import { supabase } from "../../lib/supabase"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import { debug } from "../../lib/debug"
import { hasReviewed } from "./reviewsService"
import { useAuth } from "../../lib/useAuth"
import ReviewsDrawer from "./ReviewsDrawer"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"

interface SaleProduct {
  product_id: string
  product_name: string
  variant_id: string | null
  variant_name: string | null
  image_url: string | null
  alreadyReviewed?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  saleId: string | null
}

/**
 * Drawer "Califica los productos de este pedido": lista los items
 * únicos del sale y al toque abre `ReviewsDrawer` para escribir la
 * reseña del producto. Marca con check los productos que el cliente
 * ya reseñó.
 */
export default function RateOrderProductsDrawer({
  open,
  onClose,
  saleId,
}: Props) {
  const { email } = useAuth()
  const [items, setItems] = useState<SaleProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [activeProduct, setActiveProduct] = useState<SaleProduct | null>(null)

  useBodyScrollLock(open)

  const load = useCallback(async () => {
    if (!saleId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("sale_items")
        .select(
          "product_id,product_name,variant_id,variant_name,variants(image_url,image_urls)",
        )
        .eq("sale_id", saleId)
      if (error) throw error
      // Dedup por product_id (un mismo producto puede tener varias variantes en el sale).
      const seen = new Set<string>()
      const unique: SaleProduct[] = []
      for (const row of (data ?? []) as any[]) {
        if (!row.product_id || seen.has(row.product_id)) continue
        seen.add(row.product_id)
        const img =
          (row.variants?.image_urls?.[0] as string | undefined) ??
          (row.variants?.image_url as string | undefined) ??
          null
        unique.push({
          product_id: row.product_id,
          product_name: row.product_name ?? "Producto",
          variant_id: row.variant_id ?? null,
          variant_name: row.variant_name ?? null,
          image_url: img,
        })
      }
      // Verifica cuáles ya están reseñados (best-effort, ignora errores).
      if (email) {
        await Promise.all(
          unique.map(async (it) => {
            try {
              it.alreadyReviewed = await hasReviewed(it.product_id, email)
            } catch {
              it.alreadyReviewed = false
            }
          }),
        )
      }
      setItems(unique)
    } catch (e: any) {
      debug.warn("[rate-order] load:", e?.message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [saleId, email])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[215] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60"
          />

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={OVERLAY_PANEL_TRANSITION}
            style={OVERLAY_PANEL_STYLE}
            className="relative w-full max-w-md max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-premium overflow-hidden"
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>

            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <Star size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black tracking-tight">
                  Califica tus productos
                </p>
                <p className="text-[10px] font-bold text-slate-500">
                  Una estrella por producto + tu opinión = más puntos
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 scroll-container-ios">
              {loading ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-400 italic py-6 justify-center">
                  <Loader2 size={12} className="animate-spin" /> Cargando…
                </div>
              ) : items.length === 0 ? (
                <p className="text-center text-[11px] text-slate-400 italic py-8">
                  No hay productos para calificar en este pedido.
                </p>
              ) : (
                items.map((it) => (
                  <button
                    key={it.product_id}
                    type="button"
                    onClick={() => setActiveProduct(it)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 hover:border-amber-300/60 dark:hover:border-amber-500/40 press text-left"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center text-slate-300 shrink-0 p-1">
                      {it.image_url ? (
                        <img
                          src={it.image_url}
                          alt=""
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <Package size={18} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 truncate">
                        {it.product_name}
                      </p>
                      {it.variant_name && (
                        <p className="text-[10px] text-slate-500 truncate">
                          {it.variant_name}
                        </p>
                      )}
                    </div>
                    {it.alreadyReviewed ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        ✓ Reseñado
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center gap-1">
                        <Star size={10} /> Calificar
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>

          {/* Sub-drawer con el formulario de reseña por producto */}
          {activeProduct && (
            <ReviewsDrawer
              open={!!activeProduct}
              onClose={() => {
                setActiveProduct(null)
                // Recargar para actualizar el flag alreadyReviewed
                load()
              }}
              productId={activeProduct.product_id}
              productName={activeProduct.product_name}
              productImage={activeProduct.image_url}
              variantId={activeProduct.variant_id}
              defaultEmail={email ?? undefined}
            />
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

import {
  Trash2,
  Edit3,
  PlusCircle,
  Package,
  DollarSign,
  AlertTriangle,
  Boxes,
  ChevronDown,
  Sparkles,
  TrendingUp
} from "lucide-react"

import Badge from "../../components/ui/Badge"
import { motion, AnimatePresence } from "framer-motion"
import type { Product } from "../../types/database"
import { useProductCard } from "./useProductCard"

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(n)

export default function ProductCard({
  product,
  onAddVariant,
  onMove,
  onEdit,
  refresh
}: {
  product: Product
  onAddVariant: (productId: string, productName: string) => void
  onMove: (variantId: string, type: "entrada" | "venta") => void
  onEdit: (product: Product) => void
  refresh: () => void
}) {
  const ui = useProductCard(product, refresh)

  const prices =
    product.variants?.map(v => Number(v.price ?? 0)).filter(p => p > 0) ?? []

  const minPrice = prices.length ? Math.min(...prices) : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-[2.5rem] border border-pink-50 shadow-premium p-6 space-y-5"
    >
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-14 h-14 rounded-2xl object-cover shrink-0 shadow-sm"
              loading="lazy"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center text-primary/40"
              style={{ background: "linear-gradient(135deg,#fdf2f8,#faf5ff)" }}
            >
              <Package size={24} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900 italic leading-tight truncate">
              {product.name}
            </h3>

            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-black">
              {product.category ?? "General"}
            </span>

            {product.cost == null && (
              <Badge tone="rose" className="mt-1 text-[9px] px-2 py-1">
                Sin costo
              </Badge>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onEdit(product)}
            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <Edit3 size={16} />
          </button>

          <button
            onClick={ui.handleDelete}
            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-500"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Costo" value={product.cost ? money(product.cost) : "—"} />
        <MiniStat label="Desde" value={minPrice ? money(minPrice) : "—"} highlight />
        <MiniStat
          label="Stock"
          value={ui.totalStock}
          color={
            Number(ui.totalStock) <= (product.min_stock ?? 0)
              ? "text-rose-500"
              : "text-emerald-500"
          }
        />
      </div>

      {/* TABS */}
      <div className="flex gap-2 pt-2">
        <TabButton
          active={ui.openDetails}
          onClick={() => ui.setOpenDetails(!ui.openDetails)}
          label="Detalles"
        />

        <TabButton
          active={ui.openVariants}
          onClick={() => ui.setOpenVariants(!ui.openVariants)}
          label={`Variantes (${ui.variantCount})`}
        />

        <button
          onClick={() => onAddVariant(product.id, product.name)}
          className="ml-auto w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-white"
        >
          <PlusCircle size={16} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* DETALLES */}
        {ui.openDetails && (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3"
          >
            {ui.margin !== null && (
              <div className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-xl">
                <span className="text-[9px] font-black text-slate-500 flex items-center gap-2">
                  <TrendingUp size={12} /> Margen
                </span>
                <span className="text-sm font-black text-emerald-600">
                  {ui.margin}%
                </span>
              </div>
            )}

            <div className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-xl">
              <span className="text-[9px] font-black text-slate-500 flex items-center gap-2">
                <Package size={12} /> Stock mínimo
              </span>
              <span className="text-sm font-black text-slate-700">
                {product.min_stock ?? 0} pz
              </span>
            </div>
          </motion.div>
        )}

        {/* VARIANTES */}
        {ui.openVariants && (
          <motion.div
            key="variants"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {product.variants?.length ? (
              product.variants.map((v, i) => {
                const photos =
                  (v.image_urls && v.image_urls.length > 0
                    ? v.image_urls
                    : v.image_url
                    ? [v.image_url]
                    : []) ?? []
                return (
                  <div
                    key={v.id || i}
                    className="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-3 py-2.5 shadow-sm gap-2"
                  >
                    {/* Mini-galería: portada + badge contador clickeable */}
                    <button
                      type="button"
                      onClick={() => onEdit(product)}
                      className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 group"
                      title={
                        photos.length > 0
                          ? `${photos.length} foto${photos.length > 1 ? "s" : ""} · tap para editar`
                          : "Agregar fotos"
                      }
                    >
                      {photos[0] ? (
                        <img
                          src={photos[0]}
                          alt={v.variant_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <Package size={20} />
                        </div>
                      )}
                      {photos.length > 1 && (
                        <span className="absolute bottom-0.5 right-0.5 px-1 py-0 rounded-md bg-black/65 text-white text-[8px] font-black tabular-nums">
                          +{photos.length - 1}
                        </span>
                      )}
                      {photos.length === 0 && (
                        <span className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/40 to-transparent text-white text-[7px] font-black uppercase tracking-widest pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          + foto
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-800 truncate">
                        {v.variant_name}
                      </p>
                      <p className="text-[9px] text-slate-400 truncate">
                        SKU: {v.sku || "---"}
                      </p>
                      {/* Strip de miniaturas (si hay 2+ fotos) */}
                      {photos.length > 1 && (
                        <div className="flex gap-0.5 mt-1">
                          {photos.slice(0, 5).map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt=""
                              loading="lazy"
                              className="w-5 h-5 rounded object-cover border border-white shadow-sm"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] font-black text-emerald-500">
                          {v.stock} pz
                        </p>
                        <p className="text-[10px] font-black text-primary">
                          {v.price ? money(v.price) : "—"}
                        </p>
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={() => onMove(v.id, "venta")}
                          className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500"
                        >
                          −
                        </button>
                        <button
                          onClick={() => onMove(v.id, "entrada")}
                          className="w-8 h-8 rounded-xl bg-primary text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-6 text-center border border-dashed border-slate-200 rounded-2xl">
                <p className="text-[10px] text-slate-400">Sin variantes</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* MINI STAT */
function MiniStat({ label, value, highlight, color }: any) {
  return (
    <div className={`rounded-xl p-3 text-center border ${
      highlight ? "bg-primary/5 border-primary/10" : "bg-white border-slate-100"
    }`}>
      <p className="text-[8px] text-slate-400 font-black uppercase">{label}</p>
      <p className={`text-xs font-black ${color || "text-slate-800"}`}>
        {value}
      </p>
    </div>
  )
}

/* TAB BUTTON */
function TabButton({ active, onClick, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${
        active
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </button>
  )
}
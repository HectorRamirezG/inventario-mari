import {
  Package,
  Tag,
  DollarSign,
  Hash,
  Layers,
  ShoppingCart,
  ArrowUpCircle,
  Zap,
  Star
} from "lucide-react"
import { motion } from "framer-motion"

import Modal from "../../components/ui/Modal"
import Input from "../../components/ui/Input"
import Button from "../../components/ui/Button"
import CategoryCombobox from "../../components/ui/CategoryCombobox"

import {
  useCreateProduct,
  useCreateVariant,
  useMovementModal
} from "./useProductModals"

/* ===============================
   1. CREAR PRODUCTO (iOS STYLE)
================================ */
export function CreateProductModal({ isOpen, onClose, onSuccess }: any) {
  const f = useCreateProduct(onClose, onSuccess)

  return (
    <Modal open={isOpen} title="Nuevo Producto" onClose={onClose}>
      <div className="flex flex-col gap-10 pb-6">

        {/* BLOQUE 1 */}
        <div className="space-y-4">
          <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">
            Información Básica
          </label>

          <div className="flex flex-col gap-3">
            <Input
              value={f.name}
              onChange={e => f.setName(e.target.value)}
              placeholder="Nombre del producto"
              className="h-12 rounded-[1.5rem] bg-white border border-slate-100 font-black text-[11px]"
            />

            <CategoryCombobox
              value={f.category}
              onChange={(v) => f.setCategory(v)}
              placeholder="Categoría (Rostro, Ojos, Labios...)"
            />
          </div>
        </div>

        {/* BLOQUE 2 */}
        <div className="space-y-4">
          <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">
            Finanzas
          </label>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <DollarSign size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
              <input
                type="number"
                value={f.cost}
                onChange={e => f.setCost(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Costo"
                className="w-full h-12 pl-10 pr-4 rounded-[1.5rem] bg-white border border-slate-100 font-black text-[11px]"
              />
            </div>

            <div className="relative">
              <Layers size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="number"
                value={f.minStock}
                onChange={e => f.setMinStock(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Stock mínimo"
                className="w-full h-12 pl-10 pr-4 rounded-[1.5rem] bg-white border border-slate-100 font-black text-[11px]"
              />
            </div>
          </div>

          <div className="bg-slate-50 rounded-[1.5rem] p-3 border border-slate-100 text-[10px] font-black text-slate-400">
            El precio se calculará automáticamente en <span className="text-primary">Precios</span>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-12 rounded-[1.5rem] text-[10px] font-black uppercase"
          >
            Cancelar
          </Button>

          <Button
            onClick={f.save}
            disabled={f.saving}
            className="flex-[2] h-12 rounded-[1.5rem] bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
          >
            {f.saving ? "Guardando..." : "Crear"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ===============================
   2. VARIANTE (HOMOLOGADO)
================================ */
export function CreateVariantModal({ isOpen, productId, productName, onClose, onSuccess }: any) {
  const f = useCreateVariant(productId, onClose, onSuccess)

  return (
    <Modal open={isOpen} title="Nueva Variante" onClose={onClose}>
      <div className="flex flex-col gap-8">

        {/* PRODUCTO BASE */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-4">
          <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Producto</p>
          <p className="text-sm font-black text-slate-900">{productName}</p>
        </div>

        {/* FORM */}
        <div className="flex flex-col gap-3">
          <Input
            icon={<Layers size={14} className="text-slate-300" />}
            value={f.variantName}
            onChange={e => f.setVariantName(e.target.value)}
            placeholder="Nombre variante"
            className="h-12 rounded-[1.5rem] bg-white border border-slate-100 text-[11px] font-black"
          />

          <Input
            icon={<Hash size={14} className="text-slate-300" />}
            value={f.sku}
            onChange={e => f.setSku(e.target.value)}
            placeholder="SKU"
            className="h-12 rounded-[1.5rem] bg-white border border-slate-100 text-[11px] font-black"
          />

          <div className="relative">
            <ArrowUpCircle size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
            <input
              type="number"
              value={f.initialStock}
              onChange={e => f.setInitialStock(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Stock inicial"
              className="w-full h-12 pl-10 pr-4 rounded-[1.5rem] bg-white border border-slate-100 text-[11px] font-black"
            />
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-[1.5rem] text-[10px] font-black">
            Cancelar
          </Button>
          <Button onClick={f.save} disabled={f.saving} className="flex-[2] h-12 rounded-[1.5rem] bg-slate-900 text-white text-[10px] font-black">
            {f.saving ? "Guardando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ===============================
   3. MOVIMIENTO (FOCO + IOS)
================================ */
export function MovementModal({ isOpen, variantId, type, onClose, onSuccess }: any) {
  const f = useMovementModal(variantId, type, onClose, onSuccess)
  const isVenta = type === "venta"

  return (
    <Modal open={isOpen} title={isVenta ? "Salida" : "Entrada"} onClose={onClose}>
      <div className="flex flex-col gap-10">

        {/* INPUT CENTRAL */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="py-10 text-center"
        >
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300 mb-3">
            Cantidad
          </p>

          <input
            autoFocus
            value={f.qty}
            onChange={e => f.setQty(e.target.value === "" ? "" : Number(e.target.value))}
            type="number"
            placeholder="0"
            className={`w-full bg-transparent text-6xl font-black text-center outline-none ${
              isVenta ? "text-rose-500" : "text-emerald-500"
            }`}
          />
        </motion.div>

        {/* ACTIONS */}
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-[1.5rem] text-[10px] font-black">
            Cancelar
          </Button>

          <Button
            onClick={() => f.apply()}
            disabled={f.saving}
            className={`flex-[2] h-12 rounded-[1.5rem] text-white text-[10px] font-black ${
              isVenta ? "bg-rose-500" : "bg-emerald-500"
            }`}
          >
            {f.saving ? "Procesando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
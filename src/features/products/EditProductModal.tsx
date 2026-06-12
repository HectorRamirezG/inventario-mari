import { Edit3, Layers, Package, DollarSign, Zap, Sparkles } from "lucide-react"
import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import Badge from "../../components/ui/Badge"
import { FieldInput } from "../../components/ui/Field"
import { money } from "../../lib/money"

import type { Product } from "../../types/database"
import EditVariantModal from "./EditVariantModal"
import { useEditProductModal } from "./useEditProductModal"

export default function EditProductModal({
  open,
  product,
  onClose,
  onSaved
}: {
  open: boolean
  product: Product | null
  onClose: () => void
  onSaved: () => void
}) {
  const form = useEditProductModal(product, open, onClose, onSaved)

  return (
    <>
      <Modal
        key={product?.id ?? "new"}
        open={open}
        title="Editar Producto"
        onClose={onClose}
      >
        <div className="flex flex-col gap-10 max-h-[78vh] overflow-y-auto pb-6">

          {/* GENERAL */}
          <div className="space-y-4">
            <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">
              General
            </label>

            <FieldInput
              id="pname"
              label="Nombre"
              required
              value={form.name}
              onChange={e => form.setName(e.target.value)}
              className="h-12 rounded-[1.5rem] bg-white border border-slate-100 font-black text-[11px]"
            />

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <DollarSign size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
                <input
                  type="number"
                  value={form.cost}
                  onChange={e => form.setCost(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Costo"
                  className="w-full h-12 pl-10 pr-4 rounded-[1.5rem] bg-white border border-slate-100 font-black text-[11px]"
                />
              </div>

              <div className="flex-1 relative">
                <Layers size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="number"
                  value={form.minStock}
                  onChange={e => form.setMinStock(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Min"
                  className="w-full h-12 pl-10 pr-4 rounded-[1.5rem] bg-white border border-slate-100 font-black text-[11px]"
                />
              </div>
            </div>
          </div>

          {/* SUGERENCIAS */}
          <div className="space-y-4">
            <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">
              Precios sugeridos
            </label>

            <div className="bg-white border border-slate-100 rounded-[2rem] p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[8px] font-black text-slate-400 uppercase">
                  Base
                </span>
                <Badge tone={form.cost ? "primary" : "bad"} className="text-[8px]">
                  {form.cost ? money(Number(form.cost)) : "Sin costo"}
                </Badge>
              </div>

              {form.sug ? (
                <div className="grid grid-cols-3 gap-2">
                  <PriceCard label="Men" value={form.sug.men} />
                  <PriceCard label="Med" value={form.sug.med} />
                  <PriceCard label="May" value={form.sug.may} />
                </div>
              ) : (
                <p className="text-[9px] text-slate-400 text-center">
                  Ingresa costo
                </p>
              )}
            </div>
          </div>

          {/* VARIANTES */}
          <div className="space-y-3">
            <label className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 px-1">
              Variantes
            </label>

            <div className="space-y-2">
              {product?.variants?.length ? (
                product.variants.map(v => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-[1.5rem]"
                  >
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-slate-800">
                        {v.variant_name}
                      </span>
                      <span className="text-[8px] text-slate-400 font-mono">
                        {v.sku || "---"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-emerald-600">
                        {v.stock}
                      </span>
                      <button
                        onClick={() => form.openEditVariant(v)}
                        className="p-2 text-slate-300 hover:text-primary"
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center border border-dashed border-slate-200 rounded-[2rem]">
                  <p className="text-[9px] text-slate-400">
                    Sin variantes
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-12 rounded-[1.5rem] text-[10px] font-black"
          >
            Cancelar
          </Button>

          <Button
            onClick={form.save}
            disabled={form.saving}
            className="flex-[2] h-12 rounded-[1.5rem] bg-slate-900 text-white text-[10px] font-black"
          >
            {form.saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </Modal>

      {form.openVar && (
        <EditVariantModal
          open={form.openVar}
          variant={form.editVar}
          productName={form.name || "Producto"}
          onClose={() => form.setOpenVar(false)}
          onSaved={onSaved}
        />
      )}
    </>
  )
}

function PriceCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 rounded-[1rem] p-2 text-center">
      <p className="text-[7px] text-slate-400 font-black">{label}</p>
      <p className="text-[10px] font-black text-slate-800">{money(value)}</p>
    </div>
  )
}
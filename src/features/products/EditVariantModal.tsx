import { useEffect, useState } from "react"
import { toast } from "react-hot-toast"
import { Tag, Hash, Package, Sparkles } from "lucide-react"
import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import { updateVariant } from "./productService"
import type { Variant } from "../../types/database"

export default function EditVariantModal({
  open,
  variant,
  productName,
  onClose,
  onSaved
}: {
  open: boolean
  variant: Variant | null
  productName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [stock, setStock] = useState<number | "">("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && variant) {
      setName(variant.variant_name ?? "")
      setSku(variant.sku ?? "")
      setStock(variant.stock ?? 0)
    }
  }, [variant, open])

  async function handleSave() {
    if (!variant) return
    if (!name.trim()) return toast.error("Nombre requerido")

    setSaving(true)
    try {
      await updateVariant(variant.id, {
        variant_name: name.trim(),
        sku: sku.trim() || null,
        stock: Number(stock)
      })
      toast.success("Actualizado")
      onSaved()
      onClose()
    } catch {
      toast.error("Error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Editar Variante" onClose={onClose} size="sm">
      <div className="flex flex-col gap-8 pb-6">

        {/* CONTEXTO */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary">
            <Package size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-[8px] font-black uppercase text-slate-400">
              Producto
            </span>
            <span className="text-[11px] font-black text-slate-800">
              {productName}
            </span>
          </div>
        </div>

        {/* FORM */}
        <div className="flex flex-col gap-4">

          {/* NOMBRE */}
          <div className="flex flex-col gap-1">
            <label className="text-[8px] font-black uppercase text-slate-400 flex items-center gap-1">
              <Tag size={10} /> Nombre
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Variante"
              className="h-12 px-4 rounded-[1.5rem] bg-white border border-slate-100 text-[11px] font-black outline-none w-full"
            />
          </div>

          {/* SKU + STOCK (FIX) */}
          <div className="grid grid-cols-2 gap-3 w-full">

            <div className="flex flex-col gap-1 w-full">
              <label className="text-[8px] font-black uppercase text-slate-400 flex items-center gap-1">
                <Hash size={10} /> SKU
              </label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Opcional"
                className="h-12 px-4 rounded-[1.5rem] bg-white border border-slate-100 text-[11px] font-black outline-none uppercase w-full"
              />
            </div>

            <div className="flex flex-col gap-1 w-full">
              <label className="text-[8px] font-black uppercase text-slate-400 flex items-center gap-1">
                <Sparkles size={10} /> Stock
              </label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
                className="h-12 px-4 rounded-[1.5rem] bg-white border border-slate-100 text-[11px] font-black outline-none text-center w-full"
              />
            </div>

          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-14 rounded-[2rem] bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest active:scale-95"
          >
            {saving ? "Guardando..." : "Actualizar"}
          </Button>

          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full h-12 rounded-[1.5rem] text-[10px] font-black text-slate-400"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
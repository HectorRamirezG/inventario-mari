import { useEffect, useMemo, useState } from "react"
import { toast } from "react-hot-toast"

import { getPricingConfig } from "../pricing/pricingConfigService"
import { suggestedPrices } from "../pricing/suggest"
import { updateProduct } from "./productService"

import type { Product, Variant } from "../../types/database"
import type { PricingConfig } from "../pricing/pricingTypes"

export function useEditProductModal(
  product: Product | null,
  open: boolean,
  onClose: () => void,
  onSaved: () => void
) {
  const [pricingCfg, setPricingCfg] = useState<PricingConfig | null>(null)

  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [cost, setCost] = useState<number | "">("")
  const [minStock, setMinStock] = useState<number | "">("")
  const [saving, setSaving] = useState(false)

  const [openVar, setOpenVar] = useState(false)
  const [editVar, setEditVar] = useState<Variant | null>(null)

  useEffect(() => {
    async function loadCfg() {
      try {
        const cfg = await getPricingConfig()
        setPricingCfg(cfg)
      } catch {
        setPricingCfg(null)
      }
    }
    loadCfg()
  }, [])

  useEffect(() => {
    if (open && product) {
      setName(product.name ?? "")
      setCategory(product.category ?? "")
      setCost(product.cost ?? "")
      setMinStock(product.min_stock ?? "")
    } else if (!open) {
      setName("")
      setCategory("")
      setCost("")
      setMinStock("")
      setEditVar(null)
      setOpenVar(false)
    }
  }, [product, open])

  const sug = useMemo(() => {
    if (!pricingCfg) return null

    const numericCost = Number(cost)
    if (isNaN(numericCost) || numericCost <= 0) return null

    return suggestedPrices(numericCost, pricingCfg)
  }, [pricingCfg, cost])

  async function save() {
    if (!product) return

    if (!name.trim()) return toast.error("El nombre es obligatorio")
    if (cost === "" || Number(cost) <= 0) return toast.error("Pon el costo unitario")

    setSaving(true)

    try {
      await updateProduct(product.id, {
        name: name.trim(),
        category: category.trim() || null,
        cost: Number(cost),
        min_stock: minStock === "" ? 0 : Number(minStock)
      })

      toast.success("Producto actualizado")
      onClose()
      onSaved()
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message ?? "Error actualizando")
    } finally {
      setSaving(false)
    }
  }

  function openEditVariant(v: Variant) {
    setEditVar(v)
    setOpenVar(true)
  }

  return {
    pricingCfg,
    name,
    setName,
    category,
    setCategory,
    cost,
    setCost,
    minStock,
    setMinStock,
    saving,
    save,
    sug,
    openVar,
    setOpenVar,
    editVar,
    openEditVariant
  }
}
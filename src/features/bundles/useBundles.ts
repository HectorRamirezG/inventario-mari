import { useEffect, useState, useCallback } from "react"
import { toast } from "react-hot-toast"
import { bundlesRepo, BundlesRepository } from "./bundleService"
import { catalogService, type CatalogItem } from "../sales/catalogService"
import type { Bundle } from "../../types/database"

export interface BundleDraftItem {
  variant_id: string
  qty: number
}

export interface BundleDraft {
  id?: string
  name: string
  description: string
  price: number | ""
  counts_as_wholesale: boolean
  items: BundleDraftItem[]
}

const emptyDraft = (): BundleDraft => ({
  name: "",
  description: "",
  price: "",
  counts_as_wholesale: true,
  items: [],
})

export function useBundles() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openEdit, setOpenEdit] = useState(false)
  const [draft, setDraft] = useState<BundleDraft>(emptyDraft())

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [bs, cat] = await Promise.all([
        bundlesRepo.listActive(),
        catalogService.all(),
      ])
      setBundles(bs)
      setCatalog(cat)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const openNew = () => {
    setDraft(emptyDraft())
    setOpenEdit(true)
  }

  const openEditOf = (b: Bundle) => {
    setDraft({
      id: b.id,
      name: b.name,
      description: b.description ?? "",
      price: Number(b.price ?? 0),
      counts_as_wholesale: b.counts_as_wholesale,
      items: (b.items ?? []).map(it => ({ variant_id: it.variant_id, qty: it.qty })),
    })
    setOpenEdit(true)
  }

  const addItem = (variantId: string) => {
    setDraft(d => {
      if (d.items.some(i => i.variant_id === variantId)) return d
      return { ...d, items: [...d.items, { variant_id: variantId, qty: 1 }] }
    })
  }

  const updateItemQty = (variantId: string, qty: number) => {
    setDraft(d => ({
      ...d,
      items: d.items.map(i => i.variant_id === variantId ? { ...i, qty: Math.max(1, qty) } : i),
    }))
  }

  const removeItem = (variantId: string) =>
    setDraft(d => ({ ...d, items: d.items.filter(i => i.variant_id !== variantId) }))

  const setField = <K extends keyof BundleDraft>(k: K, v: BundleDraft[K]) =>
    setDraft(d => ({ ...d, [k]: v }))

  const computedCost = draft.items.reduce((acc, it) => {
    const v = catalog.find(c => c.id === it.variant_id)
    const cost = Number(v?.effective_cost ?? 0)
    return acc + cost * it.qty
  }, 0)

  const computedPieces = draft.counts_as_wholesale
    ? draft.items.reduce((acc, it) => acc + it.qty, 0)
    : 1

  const save = async () => {
    if (!draft.name.trim()) return toast.error("Falta el nombre del paquete")
    if (draft.items.length === 0) return toast.error("Agrega al menos un producto")
    if (!draft.price || Number(draft.price) <= 0)
      return toast.error("Define un precio para el paquete")

    try {
      await bundlesRepo.upsertWithItems({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        price: Number(draft.price),
        counts_as_wholesale: draft.counts_as_wholesale,
        items: draft.items,
      })
      toast.success(draft.id ? "Paquete actualizado" : "Paquete creado")
      setOpenEdit(false)
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar")
    }
  }

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este paquete?")) return
    try {
      await bundlesRepo.softDelete(id)
      toast.success("Paquete eliminado")
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? "Error al eliminar")
    }
  }

  return {
    bundles, catalog, loading,
    openEdit, draft, setOpenEdit,
    openNew, openEditOf,
    addItem, updateItemQty, removeItem, setField,
    computedCost, computedPieces,
    save, remove, refresh,
    helpers: { totalPieces: BundlesRepository.totalPieces, cost: BundlesRepository.cost },
  }
}

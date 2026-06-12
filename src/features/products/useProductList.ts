import { useEffect, useMemo, useState } from "react"
import { getProducts } from "./productService"
import type { Product } from "../../types/database"

export function useProductList() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")

  const [openNewProduct, setOpenNewProduct] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const [openVariant, setOpenVariant] = useState(false)
  const [variantProductId, setVariantProductId] = useState<string | null>(null)
  const [variantProductName, setVariantProductName] = useState<string | null>(null)

  const [openMove, setOpenMove] = useState(false)
  const [moveVariantId, setMoveVariantId] = useState<string | null>(null)
  const [moveType, setMoveType] = useState<"entrada" | "venta">("entrada")

  async function refresh() {
    setLoading(true)
    try {
      const data = await getProducts()
      setProducts(data)
    } catch (e) {
      console.error("Error cargando productos:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // Filtrado optimizado
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return products
    return products.filter(p => {
      const byProduct = (p.name ?? "").toLowerCase().includes(s) || (p.category ?? "").toLowerCase().includes(s)
      const byVariant = (p.variants ?? []).some(v => 
        `${v.variant_name ?? ""} ${v.sku ?? ""}`.toLowerCase().includes(s)
      )
      return byProduct || byVariant
    })
  }, [q, products])

  const handleEdit = (p: Product) => {
    setEditProduct({ ...p })
    setOpenEdit(true)
  }

  const handleCloseEdit = () => {
    setOpenEdit(false)
    setTimeout(() => setEditProduct(null), 200)
  }

  const handleAddVariant = (productId: string, productName: string) => {
    setVariantProductId(productId)
    setVariantProductName(productName)
    setOpenVariant(true)
  }

  const handleMove = (variantId: string, type: "entrada" | "venta") => {
    setMoveVariantId(variantId)
    setMoveType(type)
    setOpenMove(true)
  }

  return {
    products, loading, q, setQ, filtered, refresh,
    openNewProduct, setOpenNewProduct,
    openEdit, editProduct, handleEdit, handleCloseEdit,
    openVariant, variantProductId, variantProductName, handleAddVariant, setOpenVariant,
    openMove, moveVariantId, moveType, handleMove, setOpenMove
  }
}
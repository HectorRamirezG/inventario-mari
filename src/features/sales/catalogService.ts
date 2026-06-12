import { supabase } from "../../lib/supabase"
import type { Variant, Product } from "../../types/database"

/**
 * Item unificado del catálogo: variante hidratada con su producto.
 * Reemplaza ProductVariantLookup, VariantCatalogItem, getAllVariants etc.
 */
export interface CatalogItem extends Variant {
  product: Pick<Product, "id" | "name" | "category" | "cost">
}

const SELECT = `
  id, product_id, variant_name, sku, stock, is_active,
  cost_override, price, price_menudeo, price_medio, price_mayoreo,
  products:products (
    id, name, category, cost
  )
`

const hydrate = (rows: any[] | null | undefined): CatalogItem[] =>
  (rows ?? [])
    .filter(r => r.products)
    .map(r => ({
      ...r,
      price:         Number(r.price ?? 0),
      price_menudeo: Number(r.price_menudeo ?? 0),
      price_medio:   Number(r.price_medio ?? 0),
      price_mayoreo: Number(r.price_mayoreo ?? 0),
      stock:         Number(r.stock ?? 0),
      cost_override: r.cost_override != null ? Number(r.cost_override) : null,
      effective_cost: r.cost_override ?? r.products.cost ?? null,
      product: {
        id:       r.products.id,
        name:     r.products.name,
        category: r.products.category,
        cost:     r.products.cost != null ? Number(r.products.cost) : null,
      },
    })) as CatalogItem[]

export class CatalogService {
  /** Todas las variantes activas (orden alfabético) */
  async all(): Promise<CatalogItem[]> {
    const { data, error } = await supabase
      .from("variants")
      .select(SELECT)
      .eq("is_active", true)
      .order("variant_name", { ascending: true })
    if (error) { console.error("[catalog] all:", error.message); return [] }
    return hydrate(data as any[])
  }

  /** Búsqueda por nombre de variante, SKU o nombre de producto */
  async search(term: string): Promise<CatalogItem[]> {
    const t = term.trim()
    if (t.length < 2) return []

    const { data, error } = await supabase
      .from("variants")
      .select(SELECT)
      .or(`variant_name.ilike.%${t}%,sku.ilike.%${t}%`)
      .limit(20)

    if (error) { console.error("[catalog] search:", error.message); return [] }
    let result = hydrate(data as any[])

    if (result.length === 0) {
      const { data: alt, error: e2 } = await supabase
        .from("variants")
        .select(SELECT.replace("products:products", "products!inner"))
        .ilike("products.name", `%${t}%`)
        .limit(20)
      if (e2) { console.error("[catalog] search alt:", e2.message); return [] }
      result = hydrate(alt as any[])
    }
    return result
  }
}

export const catalogService = new CatalogService()

// Wrappers compatibles
export const getAllVariants = () => catalogService.all()
export const searchVariants = (t: string) => catalogService.search(t)

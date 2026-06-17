import { supabase } from "../../lib/supabase"

export interface RelatedProduct {
  productId: string
  name: string
  cooccurrences: number
}

/**
 * Devuelve productos que se han vendido en las mismas ventas que el
 * producto dado. Útil para sugerencias "Comprado junto con…".
 */
export async function fetchRelatedProducts(
  productId: string,
  limit = 4
): Promise<RelatedProduct[]> {
  if (!productId) return []

  const { data: ownItems, error: e1 } = await supabase
    .from("sale_items")
    .select("sale_id")
    .eq("product_id", productId)
    .limit(500)
  if (e1 || !ownItems || ownItems.length === 0) return []

  const saleIds = Array.from(
    new Set(
      (ownItems as any[]).map((r) => r.sale_id as string).filter(Boolean)
    )
  )
  if (saleIds.length === 0) return []

  const { data: companions, error: e2 } = await supabase
    .from("sale_items")
    .select("product_id,product_name")
    .in("sale_id", saleIds)
    .neq("product_id", productId)
  if (e2 || !companions) return []

  const counts = new Map<string, { name: string; n: number }>()
  for (const row of companions as any[]) {
    const pid = row.product_id as string | null
    if (!pid) continue
    const cur = counts.get(pid) ?? { name: String(row.product_name ?? ""), n: 0 }
    cur.n += 1
    counts.set(pid, cur)
  }

  return Array.from(counts.entries())
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      cooccurrences: v.n,
    }))
    .sort((a, b) => b.cooccurrences - a.cooccurrences)
    .slice(0, limit)
}

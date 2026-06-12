import { supabase } from "../../lib/supabase"
import { BaseRepository } from "../../lib/repository"
import type { Bundle, BundleItem } from "../../types/database"

const SELECT_FULL = `
  id, name, description, price, counts_as_wholesale, is_active, created_at,
  items:bundle_items (
    id, bundle_id, variant_id, qty,
    variant:variants (
      id, product_id, variant_name, sku, stock,
      price, price_menudeo, price_medio, price_mayoreo,
      cost_override,
      product:products ( id, name, cost, category )
    )
  )
`

class BundlesRepository extends BaseRepository<Bundle> {
  constructor() { super("bundles") }

  async listActive(): Promise<Bundle[]> {
    const { data, error } = await supabase
      .from("bundles")
      .select(SELECT_FULL)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) { console.error("[bundles] list:", error.message); return [] }
    return (data ?? []) as unknown as Bundle[]
  }

  async getFull(id: string): Promise<Bundle | null> {
    const { data, error } = await supabase
      .from("bundles")
      .select(SELECT_FULL)
      .eq("id", id)
      .maybeSingle()
    if (error) { console.error("[bundles] getFull:", error.message); return null }
    return data as unknown as Bundle | null
  }

  /**
   * Crea o actualiza un bundle con sus componentes.
   * - Si pasas `id` actualiza encabezado y reemplaza items.
   * - Si no, crea uno nuevo.
   */
  async upsertWithItems(input: {
    id?: string
    name: string
    description?: string | null
    price: number
    counts_as_wholesale?: boolean
    items: { variant_id: string; qty: number }[]
  }): Promise<string> {
    const header = {
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      counts_as_wholesale: input.counts_as_wholesale ?? true,
      is_active: true,
    }

    let bundleId = input.id
    if (bundleId) {
      const { error } = await supabase.from("bundles").update(header).eq("id", bundleId)
      if (error) throw error
      await supabase.from("bundle_items").delete().eq("bundle_id", bundleId)
    } else {
      const { data, error } = await supabase.from("bundles").insert(header).select("id").single()
      if (error) throw error
      bundleId = data.id as string
    }

    if (input.items.length > 0) {
      const rows = input.items.map(it => ({
        bundle_id: bundleId!,
        variant_id: it.variant_id,
        qty: it.qty,
      }))
      const { error } = await supabase.from("bundle_items").insert(rows)
      if (error) throw error
    }

    return bundleId!
  }

  /** Cuántas piezas suma este bundle (para mayoreo) */
  static totalPieces(b: Bundle): number {
    if (!b.counts_as_wholesale) return 1
    return (b.items ?? []).reduce((acc, it) => acc + Number(it.qty || 0), 0)
  }

  /** Costo unitario del bundle (suma de costos de sus variantes × qty) */
  static cost(b: Bundle): number {
    return (b.items ?? []).reduce((acc, it) => {
      const v: any = it.variant
      const c = Number(v?.cost_override ?? v?.product?.cost ?? 0)
      return acc + c * Number(it.qty || 0)
    }, 0)
  }
}

export const bundlesRepo = new BundlesRepository()
export { BundlesRepository }

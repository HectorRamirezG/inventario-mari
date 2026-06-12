import { BaseRepository } from "../../lib/repository"
import { supabase } from "../../lib/supabase"
import type { Product, Variant } from "../../types/database"

class ProductsRepository extends BaseRepository<Product> {
  constructor() { super("products") }

  /** Catálogo completo activo con variantes activas hidratadas */
  async listActive(): Promise<Product[]> {
    const { data, error } = await supabase
      .from("products")
      .select(`
        id, name, category, cost, min_stock, is_active, created_at,
        variants (
          id, product_id, variant_name, sku, stock, is_active,
          cost_override, price, price_menudeo, price_medio, price_mayoreo
        )
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) { console.error(error); return [] }

    return (data ?? []).map((p: any) => {
      const variants: Variant[] = (p.variants ?? [])
        .filter((v: any) => v.is_active !== false)
        .map((v: any) => ({
          ...v,
          price:         Number(v.price ?? 0),
          price_menudeo: Number(v.price_menudeo ?? 0),
          price_medio:   Number(v.price_medio ?? 0),
          price_mayoreo: Number(v.price_mayoreo ?? 0),
          stock:         Number(v.stock ?? 0),
          effective_cost: (v.cost_override ?? p.cost) ?? null,
        }))
      return { ...p, variants } as Product
    })
  }
}

class VariantsRepository extends BaseRepository<Variant> {
  constructor() { super("variants") }

  async createForProduct(productId: string, payload: Partial<Variant>) {
    return this.create({
      ...payload,
      product_id: productId,
      price:         payload.price ?? 0,
      price_menudeo: payload.price_menudeo ?? 0,
      price_medio:   payload.price_medio ?? 0,
      price_mayoreo: payload.price_mayoreo ?? 0,
      stock:         payload.stock ?? 0,
      is_active:     true,
    } as Partial<Variant>)
  }
}

export const productsRepo = new ProductsRepository()
export const variantsRepo = new VariantsRepository()

// ----- API compatible con código existente -----
export const getProducts   = () => productsRepo.listActive()
export const updateProduct = (id: string, patch: Partial<Product>) => productsRepo.update(id, patch)
export const updateVariant = (id: string, patch: Partial<Variant>) => variantsRepo.update(id, patch)
export const createProduct = (payload: Partial<Product>) => productsRepo.create({ ...payload, is_active: true })
export const createVariant = (payload: Partial<Variant>) =>
  variantsRepo.createForProduct(payload.product_id as string, payload)
export const deleteProduct = (id: string) => productsRepo.softDelete(id)
export const deleteVariant = (id: string) => variantsRepo.softDelete(id)

import { supabase } from "../../lib/supabase"
import type { Product, Variant } from "../../types/database"

export async function getProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      category,
      cost,
      min_stock,
      is_active,
      variants (
        id,
        variant_name,
        sku,
        stock,
        is_active,
        cost_override,
        price
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  const raw = (data ?? []) as Product[]

  return raw
    .filter(p => p.is_active !== false)
    .map(p => {
      const variants: Variant[] = (p.variants ?? [])
        .filter(v => v.is_active !== false)
        .map(v => ({
          ...v,
          price: Number(v.price ?? 0),
          effective_cost: (v.cost_override ?? p.cost) ?? null
        }))

      return { ...p, variants }
    })
}

export async function updateProduct(productId: string, patch: Partial<Product>) {
  const { error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)

  if (error) throw error
}

export async function updateVariant(
  variantId: string,
  patch: Partial<
    Pick<
      Variant,
      | "variant_name"
      | "sku"
      | "cost_override"
      | "price"
      | "is_active"
      | "stock"
      | "image_url"
      | "image_urls"
    >
  >
) {
  const { error } = await supabase
    .from("variants")
    .update(patch)
    .eq("id", variantId)

  if (error) throw error
}

export async function createProduct(product: Partial<Product>): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .insert([{ ...product, is_active: true }])
    .select()
    .single()

  if (error) throw error
  return data as Product
}

export async function createVariant(variant: Partial<Variant>): Promise<Variant> {
  const { data, error } = await supabase
    .from("variants")
    .insert([{
      ...variant,
      price: variant.price ?? 0,
      stock: variant.stock ?? 0,
      is_active: true
    }])
    .select()
    .single()

  if (error) throw error
  return data as Variant
}

export async function deleteProduct(productId: string) {
  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", productId)

  if (error) throw error
}
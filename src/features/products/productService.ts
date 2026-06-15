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

  if (!error) return

  // Si la columna image_urls aún no existe (DB sin la migración 0012),
  // reintenta enviando sólo lo legacy. Así el panel sigue funcionando
  // aunque el usuario no haya corrido el SQL todavía.
  const msg = error.message ?? ""
  const isMissingCol =
    /column .* (does not exist|not found)/i.test(msg) ||
    /could not find the .* column/i.test(msg) ||
    /image_urls/.test(msg)

  if (isMissingCol && "image_urls" in patch) {
    const safe = { ...patch }
    delete (safe as any).image_urls
    // Si image_url venía en null, garantiza que se quede null en vez de undefined
    if (!("image_url" in safe) && Array.isArray(patch.image_urls)) {
      safe.image_url = patch.image_urls[0] ?? null
    }
    const retry = await supabase
      .from("variants")
      .update(safe)
      .eq("id", variantId)
    if (retry.error) throw retry.error
    return
  }

  throw error
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
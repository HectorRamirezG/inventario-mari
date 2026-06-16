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
      image_url,
      variants (
        id,
        product_id,
        variant_name,
        sku,
        stock,
        is_active,
        cost_override,
        price,
        price_menudeo,
        price_medio,
        price_mayoreo,
        image_url,
        image_urls
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
  const safe = pick(patch, PRODUCT_COLUMNS)
  if (Object.keys(safe).length === 0) return
  const { error } = await supabase
    .from("products")
    .update(safe)
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
  const safePatch = pick(patch, VARIANT_COLUMNS)
  if (Object.keys(safePatch).length === 0) return

  const { error } = await supabase
    .from("variants")
    .update(safePatch)
    .eq("id", variantId)

  if (!error) return

  // Si la columna image_urls aún no existe (DB sin la migración 0028),
  // reintenta enviando sólo lo legacy. Así el panel sigue funcionando
  // aunque el usuario no haya corrido el SQL todavía.
  const msg = error.message ?? ""
  const isMissingCol =
    /column .* (does not exist|not found)/i.test(msg) ||
    /could not find the .* column/i.test(msg) ||
    /image_urls/.test(msg)

  if (isMissingCol && "image_urls" in safePatch) {
    const retryPatch = { ...safePatch } as Record<string, any>
    delete retryPatch.image_urls
    // Si image_url venía en null, garantiza que se quede null en vez de undefined
    if (!("image_url" in retryPatch) && Array.isArray(patch.image_urls)) {
      retryPatch.image_url = patch.image_urls[0] ?? null
    }
    const retry = await supabase
      .from("variants")
      .update(retryPatch)
      .eq("id", variantId)
    if (retry.error) throw retry.error
    return
  }

  throw error
}

// Whitelist de columnas reales en `products` (nada de joins ni calculados)
const PRODUCT_COLUMNS = [
  "id",
  "name",
  "category",
  "cost",
  "min_stock",
  "is_active",
  "image_url",
] as const

// Whitelist de columnas reales en `variants`
const VARIANT_COLUMNS = [
  "id",
  "product_id",
  "variant_name",
  "sku",
  "stock",
  "cost_override",
  "price",
  "price_menudeo",
  "price_medio",
  "price_mayoreo",
  "is_active",
  "image_url",
  "image_urls",
] as const

function pick<T extends Record<string, any>>(obj: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, any> = {}
  for (const k of keys) {
    if (k in obj && obj[k] !== undefined) out[k] = obj[k]
  }
  return out as Partial<T>
}

export async function createProduct(product: Partial<Product>): Promise<Product> {
  const safe = pick(product, PRODUCT_COLUMNS)
  const { data, error } = await supabase
    .from("products")
    .insert([{ ...safe, is_active: true }])
    .select()
    .single()

  if (error) throw error
  return data as Product
}

export async function createVariant(variant: Partial<Variant>): Promise<Variant> {
  const safe = pick(variant, VARIANT_COLUMNS)
  const { data, error } = await supabase
    .from("variants")
    .insert([{
      ...safe,
      price: variant.price ?? 0,
      stock: variant.stock ?? 0,
      is_active: true,
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
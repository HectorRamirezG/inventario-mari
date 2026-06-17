import { supabase } from "../../lib/supabase"
import type { Product, Variant } from "../../types/database"
import { debug } from "../../lib/debug"

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
    debug.error(error)
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
  const { data, error } = await supabase
    .from("products")
    .update(safe)
    .eq("id", productId)
    .select("id")

  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    debug.error("[updateProduct] 0 filas actualizadas", { productId, safe })
    throw new Error(
      "No se pudo guardar el producto. ¿RLS bloqueando? " +
      "(0 filas actualizadas)"
    )
  }
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
      | "price_menudeo"
      | "price_medio"
      | "price_mayoreo"
      | "is_active"
      | "stock"
      | "image_url"
      | "image_urls"
    >
  >
) {
  const safePatch = pick(patch, VARIANT_COLUMNS)
  if (Object.keys(safePatch).length === 0) return

  // .select() es CRÍTICO: sin esto, una RLS que deniega silenciosamente
  // devuelve `{ data: null, error: null }` y el caller cree que guardó.
  // Con .select() la respuesta devuelve [] cuando RLS bloquea → podemos
  // detectarlo y avisar.
  const { data, error } = await supabase
    .from("variants")
    .update(safePatch)
    .eq("id", variantId)
    .select("id")

  if (!error) {
    if (!Array.isArray(data) || data.length === 0) {
      // 0 filas afectadas → RLS deniega o el id no existe. En ambos
      // casos es un fallo real que el usuario debe saber.
      debug.error("[updateVariant] 0 filas actualizadas", { variantId, safePatch })
      throw new Error(
        "No se pudo guardar. ¿Tu sesión sigue activa con permisos de admin? " +
        "(0 filas actualizadas — posible RLS bloqueando)"
      )
    }
    return
  }

  // Sólo reintentamos sin image_urls cuando la BD claramente NO tiene la
  // columna (códigos PostgREST / Postgres específicos), NO cualquier error
  // que mencione la palabra "image_urls" — eso causaba que se descartara
  // silenciosamente la galería completa cuando había RLS u otros errores.
  const msg = error.message ?? ""
  const code = (error as any).code ?? ""
  debug.warn("[updateVariant] error:", { msg, code, safePatch })

  const isMissingCol =
    code === "42703" || // Postgres: column does not exist
    code === "PGRST204" || // PostgREST: column not found in schema cache
    /column "?image_urls"? does not exist/i.test(msg) ||
    /could not find the 'image_urls' column/i.test(msg)

  if (isMissingCol && "image_urls" in safePatch) {
    const retryPatch = { ...safePatch } as Record<string, any>
    delete retryPatch.image_urls
    // Si image_url no venía en el patch, garantiza que se quede con la 1ª
    // de image_urls (para no perder TODA la portada al hacer fallback).
    if (!("image_url" in retryPatch) && Array.isArray(patch.image_urls)) {
      retryPatch.image_url = patch.image_urls[0] ?? null
    }
    const retry = await supabase
      .from("variants")
      .update(retryPatch)
      .eq("id", variantId)
      .select("id")
    if (retry.error) throw retry.error
    if (!Array.isArray(retry.data) || retry.data.length === 0) {
      throw new Error(
        "No se pudo guardar (retry sin image_urls). ¿RLS bloqueando?"
      )
    }
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
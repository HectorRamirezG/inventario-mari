import { supabase } from "../../lib/supabase"

/**
 * "Compradora verificada" — chip que distingue reviews de quien sí pagó.
 *
 * No hay columna `is_verified_buyer` en `reviews`. Lo calculamos en
 * vivo: dado un set de emails + un product_id, ¿cuáles emails tienen
 * alguna sale (no cancelada) con ese product_id en sus sale_items?
 *
 * Cache en memoria por (product_id, emails sorted) para no hacer la
 * misma query mil veces si el drawer se reabre.
 */

const cache = new Map<string, Set<string>>()
const TTL_MS = 5 * 60_000
const cacheLoadedAt = new Map<string, number>()

export async function getVerifiedBuyerEmails(
  productId: string,
  emails: string[],
): Promise<Set<string>> {
  const normEmails = Array.from(
    new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean)),
  )
  if (normEmails.length === 0) return new Set()

  const key = `${productId}::${normEmails.sort().join(",")}`
  const cached = cache.get(key)
  const cachedAt = cacheLoadedAt.get(key) ?? 0
  if (cached && Date.now() - cachedAt < TTL_MS) return cached

  // Query: sale_items con product_id + sales con customer_email en emails
  //        y status != cancelled.
  const { data, error } = await supabase
    .from("sale_items")
    .select("sales!inner(customer_email, status)")
    .eq("product_id", productId)
    .in("sales.customer_email", normEmails)
    .neq("sales.status", "cancelled")
    .limit(500)
  if (error || !Array.isArray(data)) {
    const empty = new Set<string>()
    cache.set(key, empty)
    cacheLoadedAt.set(key, Date.now())
    return empty
  }
  const verified = new Set<string>()
  for (const row of data as any[]) {
    const email = (row.sales?.customer_email ?? "").toLowerCase()
    if (email) verified.add(email)
  }
  cache.set(key, verified)
  cacheLoadedAt.set(key, Date.now())
  return verified
}

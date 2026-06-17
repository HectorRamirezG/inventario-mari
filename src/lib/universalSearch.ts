import { supabase } from "../../lib/supabase"

/**
 * Búsqueda universal para el CommandPalette.
 * Hace queries paralelas a productos, ventas (por folio) y customers
 * y devuelve un set unificado para renderizar en el palette.
 *
 * Diseñado para correr cada vez que el usuario escribe (debounced
 * desde el componente, ~250ms). Limit chico (5 por tipo) para que el
 * payload sea mínimo y el render fluido.
 */

export interface UniversalResult {
  kind: "product" | "sale" | "customer"
  /** ID original del registro (uuid). */
  refId: string
  /** Lo que se muestra como label. */
  label: string
  /** Subtítulo (precio, folio, email, etc.). */
  hint?: string
  /** Foto si aplica (producto). */
  image?: string | null
}

const LIMIT = 5

export async function universalSearch(
  query: string
): Promise<UniversalResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const like = `%${q}%`
  const out: UniversalResult[] = []

  // 1. Productos (catálogo admin). Busca en name + sku.
  const productsP = supabase
    .from("products")
    .select("id, name, image_url, sku")
    .or(`name.ilike.${like},sku.ilike.${like}`)
    .eq("is_active", true)
    .limit(LIMIT)

  // 2. Ventas por folio corto. Soporta tanto "abc123" como UUID parcial.
  //    Como no podemos hacer ILIKE sobre uuid, intentamos solo si q parece prefijo hex.
  const isHexPrefix = /^[0-9a-f-]+$/i.test(q)
  const salesByIdP = isHexPrefix
    ? supabase
        .from("sales")
        .select(
          "id, customer_name, customer_email, total, balance, status, is_layaway, created_at"
        )
        .ilike("id::text", `${q}%`)
        .limit(LIMIT)
    : Promise.resolve({ data: [], error: null } as any)

  // 3. Ventas por cliente (nombre o email).
  const salesByCustomerP = supabase
    .from("sales")
    .select(
      "id, customer_name, customer_email, total, balance, status, is_layaway, created_at"
    )
    .or(`customer_name.ilike.${like},customer_email.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(LIMIT)

  const [
    { data: products, error: pErr },
    { data: salesById },
    { data: salesByCustomer, error: scErr },
  ] = await Promise.all([productsP, salesByIdP, salesByCustomerP])

  if (!pErr && products) {
    for (const p of products) {
      out.push({
        kind: "product",
        refId: p.id,
        label: p.name,
        hint: p.sku ? `SKU ${p.sku}` : "Producto",
        image: p.image_url ?? null,
      })
    }
  }

  // Dedupe ventas por id (puede aparecer en ambas queries)
  const seen = new Set<string>()
  const allSales = [...(salesById ?? []), ...(salesByCustomer ?? [])]
  for (const s of allSales) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    const folio = String(s.id).slice(0, 8)
    out.push({
      kind: "sale",
      refId: s.id,
      label: `${s.customer_name || "Mostrador"} · $${Number(s.total).toFixed(0)}`,
      hint:
        s.balance > 0
          ? `Folio ${folio} · pendiente $${Number(s.balance).toFixed(0)}`
          : `Folio ${folio} · pagado`,
    })
  }

  // Si encontré ventas, también extraigo el customer como entidad propia
  // para que el admin pueda saltar a un "perfil" del cliente.
  const customerMap = new Map<string, { name: string; email: string }>()
  for (const s of salesByCustomer ?? []) {
    const key = (s.customer_email || s.customer_name || "")
      .trim()
      .toLowerCase()
    if (!key) continue
    if (customerMap.has(key)) continue
    customerMap.set(key, {
      name: s.customer_name || s.customer_email || "Cliente",
      email: s.customer_email || "",
    })
  }
  if (!scErr) {
    for (const [key, c] of Array.from(customerMap.entries()).slice(0, LIMIT)) {
      out.push({
        kind: "customer",
        refId: key,
        label: c.name,
        hint: c.email || "Ver historial",
      })
    }
  }

  return out
}

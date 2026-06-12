import { supabase } from "../../lib/supabase"

export interface CustomerSnapshot {
  name: string
  phone: string | null
  address: string | null
  location: string | null
  /** Total acumulado de todas sus compras */
  total_spent: number
  /** Número de ventas (incluye pagadas y pendientes) */
  visits: number
  /** Saldo pendiente actual */
  pending_balance: number
  /** Última fecha de venta */
  last_visit: string | null
}

/**
 * Busca clientes anteriores por nombre o teléfono y los agrupa.
 * Útil para auto-completar al teclear el nombre en una nueva venta.
 *
 * Nota: agrupamos por `customer_name` normalizado (lowercase/trim).
 * Si Mari crece, se puede migrar a una tabla `customers` real y un
 * `customer_id` en sales, pero para una tienda chica esto basta.
 */
export async function searchCustomers(
  query: string,
  limit = 5
): Promise<CustomerSnapshot[]> {
  const q = query.trim()
  if (q.length < 2) return []

  // Buscamos por nombre o teléfono parcial (Postgres ILIKE)
  const { data, error } = await supabase
    .from("sales")
    .select(
      "customer_name, customer_phone, customer_address, customer_location, total, balance, created_at"
    )
    .or(`customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(300) // tomamos un buffer y agrupamos en cliente

  if (error) {
    console.error("searchCustomers:", error.message)
    return []
  }

  // Agrupa por nombre normalizado
  const map = new Map<string, CustomerSnapshot>()
  for (const row of data ?? []) {
    const name = (row as any).customer_name?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    const existing = map.get(key)
    const total = Number((row as any).total) || 0
    const balance = Number((row as any).balance) || 0
    const created = (row as any).created_at as string | null

    if (!existing) {
      map.set(key, {
        name,
        phone: (row as any).customer_phone ?? null,
        address: (row as any).customer_address ?? null,
        location: (row as any).customer_location ?? null,
        total_spent: total,
        visits: 1,
        pending_balance: balance,
        last_visit: created,
      })
    } else {
      existing.total_spent += total
      existing.visits += 1
      existing.pending_balance += balance
      // Conserva el primero (más reciente por orden) con info válida
      existing.phone = existing.phone ?? (row as any).customer_phone ?? null
      existing.address = existing.address ?? (row as any).customer_address ?? null
      existing.location = existing.location ?? (row as any).customer_location ?? null
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
}

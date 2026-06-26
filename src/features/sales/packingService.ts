import { supabase } from "../../lib/supabase"

/**
 * Modo Empaque (Packing Mode) — workflow tipo "cocina de restaurante":
 * Mari ve UN pedido a la vez, fullscreen, con foto del cliente, lista de
 * items con miniaturas, dirección, link al mapa. Tap "✓ Empacado" → siguiente.
 *
 * Criterio para "qué empacar hoy":
 *   - Ventas NO canceladas
 *   - Con balance pagado COMPLETO (paid >= total) — listas para enviar
 *   - Que NO tengan delivery_note con status delivered o cancelled
 *   - Que NO estén marcadas como empacadas hoy (localStorage `mari:packed:{id}`)
 *
 * El "empaquetado" no se persiste en BD (no hay columna packed_at).
 * Se guarda en localStorage por sesión con TTL 24h, así Mari puede
 * cerrar la pantalla y al volver no le aparecen otra vez las que ya empacó.
 */

const PACKED_KEY = "mari:packed:v1"
const TTL_MS = 24 * 60 * 60 * 1000

export interface PackingItem {
  id: string // sale_item.id
  product_id: string | null
  variant_id: string | null
  product_name: string
  variant_name: string | null
  qty: number
  image_url: string | null
}

export interface PackingOrder {
  sale_id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  customer_address: string | null
  customer_location: string | null
  notes: string | null
  total: number
  is_layaway: boolean
  is_foreign_shipping: boolean
  created_at: string
  items: PackingItem[]
  /** Si ya existe comanda asociada, su estado */
  delivery_status: "draft" | "sent" | "picked_up" | null
  /** Token público de la comanda (para abrir mapa, etc) */
  delivery_token: string | null
}

/* ─────────── Lectura de la cola ─────────── */

export async function listPackingQueue(): Promise<PackingOrder[]> {
  // 1) Ventas pagadas que NO están canceladas y NO entregadas.
  //    Limitamos a 50 (ordenadas por más antigua primero — FIFO).
  const { data: salesRaw, error: salesErr } = await supabase
    .from("sales")
    .select(
      "id, customer_name, customer_phone, customer_email, customer_address, customer_location, notes, total, is_layaway, is_foreign_shipping, created_at, balance, status",
    )
    .lte("balance", 0)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(50)

  if (salesErr) throw salesErr
  if (!Array.isArray(salesRaw) || salesRaw.length === 0) return []

  const saleIds = salesRaw.map((s) => s.id)

  // 2) Para cada venta, traer sus items en lote
  const { data: itemsRaw } = await supabase
    .from("sale_items")
    .select("id, sale_id, product_id, variant_id, product_name, variant_name, qty")
    .in("sale_id", saleIds)

  // 3) Y las variantes para sacar la primera foto
  const variantIds = Array.from(
    new Set((itemsRaw ?? []).map((i: any) => i.variant_id).filter(Boolean)),
  ) as string[]
  let variantsRaw: any[] = []
  if (variantIds.length > 0) {
    const { data: v } = await supabase
      .from("variants")
      .select("id, image_url, image_urls")
      .in("id", variantIds)
    variantsRaw = v ?? []
  }
  const variantById = new Map(variantsRaw.map((v) => [v.id, v]))

  // 4) Comandas existentes para esas ventas (saber su status)
  const { data: notesRaw } = await supabase
    .from("delivery_notes")
    .select("id, sale_id, status, public_token")
    .in("sale_id", saleIds)
  const noteBySale = new Map<string, any>()
  ;(notesRaw ?? []).forEach((n) => {
    // Si hay más de una, nos quedamos con la última no cancelada.
    const prev = noteBySale.get(n.sale_id)
    if (!prev) noteBySale.set(n.sale_id, n)
    else if (prev.status === "cancelled") noteBySale.set(n.sale_id, n)
  })

  // 5) Filtrar ventas cuya comanda ya está delivered/cancelled
  const filtered = salesRaw.filter((s) => {
    const note = noteBySale.get(s.id)
    if (!note) return true
    if (note.status === "delivered") return false
    return true
  })

  // 6) Filtrar las marcadas localmente como empacadas (TTL 24h)
  const packedSet = getPackedSet()
  const visible = filtered.filter((s) => !packedSet.has(s.id))

  // 7) Ensamble final
  return visible.map((s) => {
    const myItems = (itemsRaw ?? [])
      .filter((i: any) => i.sale_id === s.id)
      .map((i: any) => {
        const v = i.variant_id ? variantById.get(i.variant_id) : null
        const image_url =
          (Array.isArray(v?.image_urls) && v.image_urls[0]) ||
          v?.image_url ||
          null
        return {
          id: i.id,
          product_id: i.product_id,
          variant_id: i.variant_id,
          product_name: i.product_name ?? "Producto",
          variant_name: i.variant_name ?? null,
          qty: i.qty,
          image_url,
        } satisfies PackingItem
      })

    const note = noteBySale.get(s.id)
    return {
      sale_id: s.id,
      customer_name: s.customer_name ?? "Cliente",
      customer_phone: s.customer_phone ?? null,
      customer_email: s.customer_email ?? null,
      customer_address: s.customer_address ?? null,
      customer_location: s.customer_location ?? null,
      notes: s.notes ?? null,
      total: Number(s.total ?? 0),
      is_layaway: !!s.is_layaway,
      is_foreign_shipping: !!s.is_foreign_shipping,
      created_at: s.created_at,
      items: myItems,
      delivery_status: note?.status ?? null,
      delivery_token: note?.public_token ?? null,
    } satisfies PackingOrder
  })
}

/* ─────────── Marcado de "empacado" (localStorage con TTL) ─────────── */

type PackedMap = Record<string, number> // sale_id -> timestamp ms

function loadPackedMap(): PackedMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(PACKED_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw) as PackedMap
    // GC de entries vencidas
    const now = Date.now()
    const out: PackedMap = {}
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number" && now - v < TTL_MS) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function savePackedMap(m: PackedMap) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PACKED_KEY, JSON.stringify(m))
  } catch {
    // ignore quota errors
  }
}

function getPackedSet(): Set<string> {
  return new Set(Object.keys(loadPackedMap()))
}

export function markAsPacked(saleId: string) {
  const m = loadPackedMap()
  m[saleId] = Date.now()
  savePackedMap(m)
}

export function unmarkAsPacked(saleId: string) {
  const m = loadPackedMap()
  delete m[saleId]
  savePackedMap(m)
}

export function clearAllPacked() {
  if (typeof window === "undefined") return
  localStorage.removeItem(PACKED_KEY)
}

export function listPackedSaleIds(): string[] {
  return Object.keys(loadPackedMap())
}

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

/**
 * Servicio de paquetes (bundles).
 * Tabla detrás: `bundles` (ver supabase/add_bundles.sql). Si la tabla no
 * existe aún, todas las funciones devuelven vacío sin romper la app.
 */

export interface BundleSlot {
  /** Etiqueta del slot que ve el cliente (ej. "Labial favorito"). */
  label: string
  /** Cuántas piezas pide este slot (default 1). */
  qty: number
  /** IDs de variantes elegibles. Si vacío, slot libre (cualquier activa). */
  eligible_variant_ids: string[]
}

export interface Bundle {
  id: string
  name: string
  description: string | null
  image_url: string | null
  slots: BundleSlot[]
  discount_percent: number
  active: boolean
  created_at: string
  updated_at: string
}

/** Sanea slots: filtra basura, valida qty>=1, asegura array de IDs. */
function sanitizeSlots(raw: unknown): BundleSlot[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s: any) => ({
      label: typeof s?.label === "string" ? s.label.slice(0, 60) : "",
      qty: Math.max(1, Math.min(20, Math.floor(Number(s?.qty)) || 1)),
      eligible_variant_ids: Array.isArray(s?.eligible_variant_ids)
        ? (s.eligible_variant_ids as unknown[]).filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          )
        : [],
    }))
    .filter((s) => s.label.length > 0)
}

function rowToBundle(r: any): Bundle {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: r.description ?? null,
    image_url: r.image_url ?? null,
    slots: sanitizeSlots(r.slots),
    discount_percent: Math.max(
      0,
      Math.min(100, Number(r.discount_percent) || 0),
    ),
    active: !!r.active,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  }
}

/** Lista bundles ACTIVOS para el cliente. Silencia si la tabla no existe. */
export async function listActiveBundles(): Promise<Bundle[]> {
  const { data, error } = await supabase
    .from("bundles")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    debug.warn("[bundles] list active error:", error.message)
    return []
  }
  return (data ?? []).map(rowToBundle)
}

/** Lista TODOS los bundles para admin (incluye inactivos). */
export async function listAllBundles(): Promise<Bundle[]> {
  const { data, error } = await supabase
    .from("bundles")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    debug.warn("[bundles] list all error:", error.message)
    return []
  }
  return (data ?? []).map(rowToBundle)
}

export async function createBundle(input: {
  name: string
  description?: string | null
  image_url?: string | null
  slots: BundleSlot[]
  discount_percent?: number
  active?: boolean
}): Promise<Bundle> {
  const { data, error } = await supabase
    .from("bundles")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      image_url: input.image_url || null,
      slots: sanitizeSlots(input.slots),
      discount_percent: Math.max(
        0,
        Math.min(100, Number(input.discount_percent) || 0),
      ),
      active: input.active ?? true,
    })
    .select()
    .single()
  if (error) throw error
  return rowToBundle(data)
}

export async function updateBundle(
  id: string,
  patch: Partial<{
    name: string
    description: string | null
    image_url: string | null
    slots: BundleSlot[]
    discount_percent: number
    active: boolean
  }>,
): Promise<Bundle> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name.trim()
  if (patch.description !== undefined)
    body.description = patch.description?.trim() || null
  if (patch.image_url !== undefined) body.image_url = patch.image_url
  if (patch.slots !== undefined) body.slots = sanitizeSlots(patch.slots)
  if (patch.discount_percent !== undefined)
    body.discount_percent = Math.max(
      0,
      Math.min(100, Number(patch.discount_percent) || 0),
    )
  if (patch.active !== undefined) body.active = !!patch.active
  const { data, error } = await supabase
    .from("bundles")
    .update(body)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return rowToBundle(data)
}

export async function deleteBundle(id: string): Promise<void> {
  const { error } = await supabase.from("bundles").delete().eq("id", id)
  if (error) throw error
}

/** Hook reactivo: lista de bundles activos para el cliente. */
export function useActiveBundles() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    listActiveBundles().then((b) => {
      if (!alive) return
      setBundles(b)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])
  return { bundles, loading, reload: () => listActiveBundles().then(setBundles) }
}

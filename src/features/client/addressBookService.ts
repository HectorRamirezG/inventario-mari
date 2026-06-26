import { supabase } from "../../lib/supabase"

/**
 * Direcciones guardadas del cliente (Casa, Oficina, Mamá, etc).
 *
 * Persistencia: como NO existe tabla `user_addresses`, las guardamos en
 * `user_profiles.tags` reutilizando el campo array de text como capa
 * estructurada con prefijo `addr:` + JSON. Esto evita un cambio de schema
 * para arrancar la feature.
 *
 *   tag = "addr:" + base64url(json)
 *
 * El cliente puede tener varias direcciones; la "principal" se marca con
 * is_primary y se duplica también en user_profiles.address (legacy single
 * field) para que componentes que solo leen ese campo sigan funcionando.
 *
 * Si en el futuro se crea tabla dedicada, este service se cambia sin
 * mover la UI.
 */

const TAG_PREFIX = "addr:"

export interface SavedAddress {
  id: string
  label: string // "Casa", "Oficina", "Mamá"…
  address: string
  location_url?: string | null
  postal_code?: string | null
  notes?: string | null // "Tocar 2 veces" etc
  is_primary?: boolean
}

/* ─────────── Codificación segura ─────────── */

function encodeAddress(a: SavedAddress): string {
  try {
    const json = JSON.stringify(a)
    const b64 = btoa(unescape(encodeURIComponent(json)))
    return TAG_PREFIX + b64.replace(/=+$/, "")
  } catch {
    return ""
  }
}

function decodeAddress(tag: string): SavedAddress | null {
  if (!tag.startsWith(TAG_PREFIX)) return null
  try {
    const b64 = tag.slice(TAG_PREFIX.length)
    const padded = b64 + "===".slice((b64.length + 3) % 4)
    const json = decodeURIComponent(escape(atob(padded)))
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== "object" || !parsed.id) return null
    return parsed as SavedAddress
  } catch {
    return null
  }
}

/* ─────────── API ─────────── */

export async function listMyAddresses(email: string): Promise<SavedAddress[]> {
  if (!email) return []
  const { data, error } = await supabase
    .from("user_profiles")
    .select("tags")
    .eq("email", email.toLowerCase())
    .maybeSingle()
  if (error || !data?.tags) return []
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : []
  return tags
    .map(decodeAddress)
    .filter((a): a is SavedAddress => a != null)
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1
      if (!a.is_primary && b.is_primary) return 1
      return a.label.localeCompare(b.label)
    })
}

export async function saveAddress(
  email: string,
  addr: SavedAddress,
): Promise<SavedAddress[]> {
  if (!email) throw new Error("email requerido")
  // Trae tags actuales
  const { data: row, error } = await supabase
    .from("user_profiles")
    .select("tags, address, location_url")
    .eq("email", email.toLowerCase())
    .maybeSingle()
  if (error) throw error
  const currentTags = Array.isArray(row?.tags) ? (row!.tags as string[]) : []
  const nonAddrTags = currentTags.filter((t) => !t.startsWith(TAG_PREFIX))
  const addrTags = currentTags
    .map(decodeAddress)
    .filter((a): a is SavedAddress => a != null)
  // Reemplaza por id o agrega
  let next = addrTags.filter((a) => a.id !== addr.id)
  next.push(addr)
  // Sanea is_primary: solo una
  if (addr.is_primary) {
    next = next.map((a) => (a.id === addr.id ? a : { ...a, is_primary: false }))
  }
  const newTags = [...nonAddrTags, ...next.map(encodeAddress).filter(Boolean)]
  // Si esta es primary, duplicamos en user_profiles.address legacy
  const updatePayload: Record<string, any> = { tags: newTags }
  if (addr.is_primary) {
    updatePayload.address = addr.address
    if (addr.location_url) updatePayload.location_url = addr.location_url
  }
  const { error: upErr } = await supabase
    .from("user_profiles")
    .update(updatePayload)
    .eq("email", email.toLowerCase())
  if (upErr) throw upErr
  return next.sort((a, b) =>
    a.is_primary && !b.is_primary
      ? -1
      : !a.is_primary && b.is_primary
      ? 1
      : a.label.localeCompare(b.label),
  )
}

export async function deleteAddress(
  email: string,
  id: string,
): Promise<SavedAddress[]> {
  const list = await listMyAddresses(email)
  const next = list.filter((a) => a.id !== id)
  const { data: row } = await supabase
    .from("user_profiles")
    .select("tags")
    .eq("email", email.toLowerCase())
    .maybeSingle()
  const currentTags = Array.isArray(row?.tags) ? (row!.tags as string[]) : []
  const nonAddrTags = currentTags.filter((t) => !t.startsWith(TAG_PREFIX))
  const newTags = [...nonAddrTags, ...next.map(encodeAddress).filter(Boolean)]
  await supabase
    .from("user_profiles")
    .update({ tags: newTags })
    .eq("email", email.toLowerCase())
  return next
}

export async function setPrimary(
  email: string,
  id: string,
): Promise<SavedAddress[]> {
  const list = await listMyAddresses(email)
  const target = list.find((a) => a.id === id)
  if (!target) return list
  return saveAddress(email, { ...target, is_primary: true })
}

export function newAddress(): SavedAddress {
  return {
    id: `addr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    address: "",
    is_primary: false,
  }
}

/* ─────────── Migración silenciosa ─────────── */

/**
 * Si el user_profiles tiene address legacy y NO tiene ninguna dirección
 * estructurada, la creamos como su primera dirección "Casa" automáticamente.
 * Idempotente.
 */
export async function autoMigrateLegacyAddress(email: string): Promise<void> {
  if (!email) return
  const { data: row } = await supabase
    .from("user_profiles")
    .select("address, location_url, tags")
    .eq("email", email.toLowerCase())
    .maybeSingle()
  if (!row?.address) return
  const tags = Array.isArray(row.tags) ? (row.tags as string[]) : []
  const hasStructured = tags.some((t) => t.startsWith(TAG_PREFIX))
  if (hasStructured) return
  const seed: SavedAddress = {
    id: `addr_legacy_${Date.now().toString(36)}`,
    label: "Casa",
    address: row.address,
    location_url: row.location_url ?? null,
    is_primary: true,
  }
  try {
    await saveAddress(email, seed)
  } catch {
    // best effort
  }
}

import { supabase } from "../../lib/supabase"

export interface UserProfileDetail {
  id: string
  email: string | null
  full_name: string | null
  role: string
  avatar_url: string | null
  phone: string | null
  address: string | null
  location_url: string | null
}

export async function fetchMyProfile(userId: string): Promise<UserProfileDetail | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,role,avatar_url,phone,address,location_url")
    .eq("id", userId)
    .maybeSingle()
  if (error) {
    console.warn("[profile] fetch error:", error.message)
    return null
  }
  return (data as UserProfileDetail) ?? null
}

export async function updateMyProfile(
  userId: string,
  patch: Partial<
    Pick<UserProfileDetail, "full_name" | "avatar_url" | "phone" | "address" | "location_url">
  >
) {
  const { error } = await supabase
    .from("user_profiles")
    .update(patch)
    .eq("id", userId)

  if (!error) return

  // Fallback si la DB aún no tiene las columnas extendidas (sin migración 0012)
  const msg = error.message ?? ""
  const isMissingCol =
    /column .* (does not exist|not found)/i.test(msg) ||
    /could not find the .* column/i.test(msg)

  if (isMissingCol) {
    // Reintenta sólo con full_name
    if ("full_name" in patch) {
      const safe = { full_name: patch.full_name }
      const retry = await supabase
        .from("user_profiles")
        .update(safe)
        .eq("id", userId)
      if (retry.error) throw retry.error
      throw new Error(
        "Tu DB no tiene los campos nuevos. Corre la migración 0012 en Supabase."
      )
    }
    throw new Error(
      "Tu DB no tiene los campos nuevos (avatar/teléfono/etc). Corre la migración 0012 en Supabase."
    )
  }

  throw error
}

/** Cambia el correo del usuario. Supabase enviará un email de confirmación. */
export async function updateMyEmail(email: string) {
  const { error } = await supabase.auth.updateUser({ email })
  if (error) throw error
}

/** Cambia la contraseña del usuario logueado. */
export async function updateMyPassword(password: string) {
  if (password.length < 6) throw new Error("Mínimo 6 caracteres")
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/**
 * Devuelve un mapa email → UserProfileDetail para los emails dados.
 * Útil para enriquecer el listado de apartados con el avatar del cliente.
 */
export async function fetchProfilesByEmails(
  emails: string[]
): Promise<Record<string, UserProfileDetail>> {
  const unique = Array.from(new Set(emails.filter(Boolean)))
  if (unique.length === 0) return {}
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,avatar_url,phone,address,location_url,role")
    .in("email", unique)
  if (error) {
    console.warn("[profile] batch fetch error:", error.message)
    return {}
  }
  const map: Record<string, UserProfileDetail> = {}
  ;(data ?? []).forEach((p: any) => {
    if (p.email) map[p.email.toLowerCase()] = p as UserProfileDetail
  })
  return map
}

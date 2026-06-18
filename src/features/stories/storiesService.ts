import { supabase } from "../../lib/supabase"
import { compressImage } from "../../lib/imageCompress"

/**
 * Stories — fotos del día estilo Instagram dentro de la tienda.
 *
 * Tabla `stories`. Persistencia y reglas en `supabase/stories.sql`.
 * Las stories tienen `expires_at` (default 24h) y `is_published`.
 * La vista pública solo retorna las activas (no expiradas + publicadas).
 */

export interface Story {
  id: string
  image_url: string
  caption: string | null
  product_id: string | null
  link_url: string | null
  is_published: boolean
  expires_at: string
  view_count: number
  created_at: string
  created_by: string | null
}

export interface CreateStoryInput {
  image_url: string
  caption?: string | null
  product_id?: string | null
  link_url?: string | null
  /** Horas que estará viva (default 24). */
  ttl_hours?: number
}

/** Lista stories activas (publicadas + no expiradas). Para el cliente. */
export async function listActiveStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .eq("is_published", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Story[]
}

/** Lista TODAS las stories (incluso expiradas) — para el admin. */
export async function listAllStories(opts?: {
  includeExpired?: boolean
  limit?: number
}): Promise<Story[]> {
  let query = supabase
    .from("stories")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50)

  if (!opts?.includeExpired) {
    query = query.gt("expires_at", new Date().toISOString())
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Story[]
}

/** Crea una story nueva. */
export async function createStory(input: CreateStoryInput): Promise<Story> {
  const ttl = input.ttl_hours ?? 24
  const expiresAt = new Date(Date.now() + ttl * 3600 * 1000).toISOString()

  const { data, error } = await supabase
    .from("stories")
    .insert({
      image_url: input.image_url,
      caption: input.caption?.trim() || null,
      product_id: input.product_id ?? null,
      link_url: input.link_url?.trim() || null,
      expires_at: expiresAt,
      is_published: true,
    })
    .select()
    .single()
  if (error) throw error
  return data as Story
}

/** Pausa o reactiva una story. */
export async function togglePublishStory(
  id: string,
  is_published: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("stories")
    .update({ is_published })
    .eq("id", id)
  if (error) throw error
}

/** Extiende la vida de la story por N horas adicionales. */
export async function extendStory(id: string, hours = 24): Promise<void> {
  const { data: current, error: fetchErr } = await supabase
    .from("stories")
    .select("expires_at")
    .eq("id", id)
    .maybeSingle()
  if (fetchErr) throw fetchErr
  if (!current) throw new Error("Story no encontrada")

  const base = new Date(current.expires_at).getTime()
  const next = Math.max(base, Date.now()) + hours * 3600 * 1000
  const { error } = await supabase
    .from("stories")
    .update({ expires_at: new Date(next).toISOString() })
    .eq("id", id)
  if (error) throw error
}

/** Elimina permanentemente. */
export async function deleteStory(id: string): Promise<void> {
  const { error } = await supabase.from("stories").delete().eq("id", id)
  if (error) throw error
}

/** Sube imagen al bucket `product-images/stories/...` y retorna URL pública. */
export async function uploadStoryImage(file: File): Promise<string> {
  const compact = await compressImage(file, { maxWidth: 1600, quality: 0.82 })
  const ext = (compact.name.split(".").pop() || "jpg").toLowerCase()
  const path = `stories/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, compact, {
      cacheControl: "3600",
      upsert: false,
      contentType: compact.type || "image/jpeg",
    })
  if (error) throw error

  const { data } = supabase.storage.from("product-images").getPublicUrl(path)
  return data.publicUrl
}

/** Marca una story como vista. Idempotente, sin rate limit server-side
 *  (el cliente decide cuándo llamarlo — típicamente una vez por sesión). */
export async function registerStoryView(storyId: string): Promise<void> {
  const KEY = `mari:story-viewed:${storyId}`
  if (typeof window !== "undefined" && sessionStorage.getItem(KEY)) return
  try {
    await supabase.rpc("increment_story_view", { p_story_id: storyId })
    if (typeof window !== "undefined") sessionStorage.setItem(KEY, "1")
  } catch {
    /* silencioso — la vista no es crítica */
  }
}

/** Formato humano del tiempo restante hasta expirar. */
export function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return "Expiró"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h >= 1) return `${h}h ${m}m`
  return `${m}m`
}

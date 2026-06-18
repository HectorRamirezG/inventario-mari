import { supabase } from "../../lib/supabase"
import { notifyAdmins, notifyClient } from "../notifications/notificationsService"
import { compressImage } from "../../lib/imageCompress"

/**
 * Wishes — sugerencias y peticiones del cliente.
 *
 * Tabla `wishes`. Persistencia y reglas en `supabase/wishes.sql`.
 * Esta capa SOLO orquesta CRUD y subida de imágenes. No mezcla lógica
 * de UI.
 */

export type WishStatus =
  | "pending"
  | "reviewing"
  | "available"
  | "unavailable"
  | "fulfilled"

export const WISH_STATUS_LABEL: Record<WishStatus, string> = {
  pending: "Por revisar",
  reviewing: "En análisis",
  available: "¡Disponible!",
  unavailable: "No disponible",
  fulfilled: "Cerrado",
}

export const WISH_STATUS_TONE: Record<
  WishStatus,
  { bg: string; text: string; ring: string }
> = {
  pending: {
    bg: "bg-amber-50 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-200 dark:ring-amber-500/30",
  },
  reviewing: {
    bg: "bg-sky-50 dark:bg-sky-500/15",
    text: "text-sky-700 dark:text-sky-300",
    ring: "ring-sky-200 dark:ring-sky-500/30",
  },
  available: {
    bg: "bg-emerald-50 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-500/30",
  },
  unavailable: {
    bg: "bg-rose-50 dark:bg-rose-500/15",
    text: "text-rose-700 dark:text-rose-300",
    ring: "ring-rose-200 dark:ring-rose-500/30",
  },
  fulfilled: {
    bg: "bg-slate-100 dark:bg-slate-800/60",
    text: "text-slate-600 dark:text-slate-300",
    ring: "ring-slate-200 dark:ring-slate-700",
  },
}

export interface Wish {
  id: string
  customer_email: string
  customer_name: string | null
  customer_phone: string | null
  product_id: string | null
  variant_id: string | null
  title: string
  description: string | null
  image_url: string | null
  size: string | null
  color: string | null
  status: WishStatus
  admin_note: string | null
  created_at: string
  resolved_at: string | null
}

export interface CreateWishInput {
  customer_email: string
  customer_name?: string | null
  customer_phone?: string | null
  product_id?: string | null
  variant_id?: string | null
  title: string
  description?: string | null
  image_url?: string | null
  size?: string | null
  color?: string | null
}

/** Crea un wish nuevo. Retorna la fila creada. */
export async function createWish(input: CreateWishInput): Promise<Wish> {
  const payload = {
    customer_email: input.customer_email.trim().toLowerCase(),
    customer_name: input.customer_name?.trim() || null,
    customer_phone: input.customer_phone?.trim() || null,
    product_id: input.product_id ?? null,
    variant_id: input.variant_id ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    image_url: input.image_url ?? null,
    size: input.size?.trim() || null,
    color: input.color?.trim() || null,
  }
  const { data, error } = await supabase
    .from("wishes")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  const wish = data as Wish

  // Notifica a admins (best-effort)
  await notifyAdmins({
    type: "wish_created",
    title: `Nueva sugerencia: ${payload.title.slice(0, 60)}`,
    body: `${payload.customer_name ?? "Cliente"}${payload.size ? " · talla " + payload.size : ""}${payload.color ? " · " + payload.color : ""}. Revísala para responder.`,
    link: "/admin",
    metadata: { wish_id: wish.id, customer_email: payload.customer_email },
  })

  return wish
}

/** Lista wishes del cliente (por email). Ordenado por creación desc. */
export async function listWishesByEmail(email: string): Promise<Wish[]> {
  const { data, error } = await supabase
    .from("wishes")
    .select("*")
    .ilike("customer_email", email.trim())
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as Wish[]
}

/** Lista TODOS los wishes (admin). Filtros opcionales. */
export async function listAllWishes(opts?: {
  status?: WishStatus | "all"
  limit?: number
}): Promise<Wish[]> {
  let query = supabase
    .from("wishes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200)

  if (opts?.status && opts.status !== "all") {
    query = query.eq("status", opts.status)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Wish[]
}

/** Cambia el status. Si pasa a "available" / "unavailable" / "fulfilled"
 *  setea `resolved_at`. Notificación al cliente se manda aparte (helper). */
export async function updateWishStatus(
  id: string,
  status: WishStatus,
  adminNote?: string | null,
): Promise<Wish> {
  const isResolved =
    status === "available" || status === "unavailable" || status === "fulfilled"
  const patch: Record<string, unknown> = {
    status,
    resolved_at: isResolved ? new Date().toISOString() : null,
  }
  if (adminNote !== undefined) patch.admin_note = adminNote || null

  const { data, error } = await supabase
    .from("wishes")
    .update(patch)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  const wish = data as Wish

  // Notif al cliente con copy específico por status
  if (wish.customer_email) {
    const baseTitle =
      status === "available"
        ? "¡Tu deseo ya está disponible!"
        : status === "unavailable"
        ? "Tu deseo aún no se puede conseguir"
        : status === "fulfilled"
        ? "Mari cerró tu sugerencia"
        : status === "reviewing"
        ? "Mari está analizando tu deseo"
        : null
    if (baseTitle) {
      await notifyClient(wish.customer_email, {
        type: status === "available" ? "wish_available" : "wish_status",
        title: baseTitle,
        body: adminNote
          ? `${adminNote.slice(0, 160)}`
          : status === "available"
          ? `"${wish.title}" ya lo tenemos. Pásate a la tienda a verlo.`
          : `Te avisamos del cambio en "${wish.title}".`,
        link: "/mis-deseos",
        metadata: { wish_id: wish.id, status, admin_note: adminNote ?? null },
      })
    }
  }

  return wish
}

/** Elimina un wish (admin). */
export async function deleteWish(id: string): Promise<void> {
  const { error } = await supabase.from("wishes").delete().eq("id", id)
  if (error) throw error
}

/** Sube una imagen para un wish al bucket `product-images/wishes/...`.
 *  Reusa el bucket existente para no proliferar buckets nuevos. */
export async function uploadWishImage(
  file: File,
  customerEmail: string,
): Promise<string> {
  const compact = await compressImage(file, { maxWidth: 1600, quality: 0.82 })
  const ext = (compact.name.split(".").pop() || "jpg").toLowerCase()
  const slug =
    customerEmail
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40) || "guest"
  const path = `wishes/${slug}/${Date.now()}-${Math.random()
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

/** Cuenta total agrupada por status (para KPIs admin). */
export async function getWishStats(): Promise<Record<WishStatus, number>> {
  const out: Record<WishStatus, number> = {
    pending: 0,
    reviewing: 0,
    available: 0,
    unavailable: 0,
    fulfilled: 0,
  }
  const statuses: WishStatus[] = [
    "pending",
    "reviewing",
    "available",
    "unavailable",
    "fulfilled",
  ]
  await Promise.all(
    statuses.map(async (s) => {
      const { count } = await supabase
        .from("wishes")
        .select("id", { count: "exact", head: true })
        .eq("status", s)
      out[s] = count ?? 0
    }),
  )
  return out
}

/** Ranking simple: títulos más pedidos (para detectar tendencias). */
export async function getTopWishedTitles(limit = 5): Promise<
  Array<{ title: string; count: number }>
> {
  const { data, error } = await supabase
    .from("wishes")
    .select("title")
    .in("status", ["pending", "reviewing"])
    .limit(500)
  if (error) return []
  const counts = new Map<string, number>()
  ;(data ?? []).forEach((r: any) => {
    const key = String(r.title || "").trim().toLowerCase()
    if (!key) return
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

import { supabase } from "../../lib/supabase"

/**
 * Reviews — reseñas con foto del cliente.
 *
 * Tabla `reviews` + view `product_review_stats`.
 * Persistencia y reglas en `supabase/reviews.sql`.
 *
 * WORKFLOW:
 *   pending  → recién creada, oculta del público
 *   approved → visible en el producto
 *   rejected → oculta, archivada con motivo
 */

export type ReviewStatus = "pending" | "approved" | "rejected"

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Por aprobar",
  approved: "Publicada",
  rejected: "Rechazada",
}

export const REVIEW_STATUS_TONE: Record<
  ReviewStatus,
  { bg: string; text: string; ring: string }
> = {
  pending: {
    bg: "bg-amber-50 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-200 dark:ring-amber-500/30",
  },
  approved: {
    bg: "bg-emerald-50 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-500/30",
  },
  rejected: {
    bg: "bg-rose-50 dark:bg-rose-500/15",
    text: "text-rose-700 dark:text-rose-300",
    ring: "ring-rose-200 dark:ring-rose-500/30",
  },
}

export interface Review {
  id: string
  product_id: string
  variant_id: string | null
  customer_email: string
  customer_name: string | null
  rating: number
  comment: string | null
  image_url: string | null
  status: ReviewStatus
  admin_note: string | null
  moderated_at: string | null
  moderated_by: string | null
  created_at: string
}

export interface ProductReviewStats {
  product_id: string
  review_count: number
  avg_rating: number
}

export interface CreateReviewInput {
  product_id: string
  variant_id?: string | null
  customer_email: string
  customer_name?: string | null
  rating: number
  comment?: string | null
  image_url?: string | null
}

/** Crea una reseña. Empieza en `pending` para moderación. */
export async function createReview(input: CreateReviewInput): Promise<Review> {
  const payload = {
    product_id: input.product_id,
    variant_id: input.variant_id ?? null,
    customer_email: input.customer_email.trim().toLowerCase(),
    customer_name: input.customer_name?.trim() || null,
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment?.trim() || null,
    image_url: input.image_url ?? null,
  }
  const { data, error } = await supabase
    .from("reviews")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as Review
}

/** Reseñas aprobadas de un producto, en orden cronológico inverso. */
export async function listApprovedReviewsByProduct(
  productId: string,
  limit = 30,
): Promise<Review[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Review[]
}

/** Lista TODAS las reseñas (admin). Filtros opcionales. */
export async function listAllReviews(opts?: {
  status?: ReviewStatus | "all"
  productId?: string | null
  limit?: number
}): Promise<Review[]> {
  let query = supabase
    .from("reviews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200)

  if (opts?.status && opts.status !== "all") {
    query = query.eq("status", opts.status)
  }
  if (opts?.productId) {
    query = query.eq("product_id", opts.productId)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Review[]
}

/** Stats agregadas por producto. Retorna mapa indexado por product_id. */
export async function getProductReviewStats(
  productIds?: string[],
): Promise<Map<string, ProductReviewStats>> {
  let query = supabase.from("product_review_stats").select("*")
  if (productIds && productIds.length) {
    query = query.in("product_id", productIds)
  }
  const { data, error } = await query
  if (error) return new Map()
  const map = new Map<string, ProductReviewStats>()
  ;(data ?? []).forEach((row: any) => {
    map.set(row.product_id, {
      product_id: row.product_id,
      review_count: Number(row.review_count) || 0,
      avg_rating: Number(row.avg_rating) || 0,
    })
  })
  return map
}

/** Cuenta agregada por status (KPIs admin). */
export async function getReviewStatusStats(): Promise<
  Record<ReviewStatus, number>
> {
  const out: Record<ReviewStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  }
  const statuses: ReviewStatus[] = ["pending", "approved", "rejected"]
  await Promise.all(
    statuses.map(async (s) => {
      const { count } = await supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", s)
      out[s] = count ?? 0
    }),
  )
  return out
}

/** Cambia status y registra moderación. */
export async function moderateReview(
  id: string,
  status: ReviewStatus,
  adminNote?: string | null,
): Promise<Review> {
  const patch: Record<string, unknown> = {
    status,
    moderated_at: new Date().toISOString(),
  }
  if (adminNote !== undefined) patch.admin_note = adminNote || null

  const { data, error } = await supabase
    .from("reviews")
    .update(patch)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data as Review
}

/** Elimina permanentemente. */
export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase.from("reviews").delete().eq("id", id)
  if (error) throw error
}

/** Sube imagen al bucket `product-images/reviews/...`. */
export async function uploadReviewImage(
  file: File,
  customerEmail: string,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
  const slug =
    customerEmail
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40) || "guest"
  const path = `reviews/${slug}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`

  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    })
  if (error) throw error

  const { data } = supabase.storage.from("product-images").getPublicUrl(path)
  return data.publicUrl
}

/** ¿Este cliente ya reseñó este producto? Útil para evitar duplicados. */
export async function hasReviewed(
  productId: string,
  customerEmail: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .ilike("customer_email", customerEmail.trim())
  return (count ?? 0) > 0
}

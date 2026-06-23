import { supabase } from "../../lib/supabase"
import { notifyAdmins, notifyClient } from "../notifications/notificationsService"
import { compressImage } from "../../lib/imageCompress"
import { getBusinessRules } from "../settings/businessRulesService"

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
  // Si modo directo o auto-approve está prendido, la reseña entra ya
  // como `approved` y se ve de inmediato en la vista pública. La columna
  // `status` tiene default 'pending' en BD; lo sobreescribimos solo
  // cuando la regla aplica.
  const rules = getBusinessRules()
  const autoApprove = rules.direct_mode_enabled || rules.auto_approve_reviews

  const payload: Record<string, any> = {
    product_id: input.product_id,
    variant_id: input.variant_id ?? null,
    customer_email: input.customer_email.trim().toLowerCase(),
    customer_name: input.customer_name?.trim() || null,
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment?.trim() || null,
    image_url: input.image_url ?? null,
  }
  if (autoApprove) {
    payload.status = "approved"
  }
  let { data, error } = await supabase
    .from("reviews")
    .insert(payload)
    .select()
    .single()
  // Fallback: si RLS bloquea seteo directo de status, reintentamos sin él
  if (error && autoApprove && /status|check constraint|permission denied/i.test(error.message)) {
    delete payload.status
    const retry = await supabase
      .from("reviews")
      .insert(payload)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }
  if (error) throw error
  const review = data as Review

  // Notifica a admins (best-effort) que llegó una reseña nueva
  await notifyAdmins({
    type: "review_created",
    title: autoApprove
      ? `Nueva reseña publicada ${"⭐".repeat(payload.rating)}${"☆".repeat(5 - payload.rating)}`
      : `Nueva reseña ${"⭐".repeat(payload.rating)}${"☆".repeat(5 - payload.rating)}`,
    body: payload.comment
      ? `${payload.customer_name ?? "Cliente"}: "${payload.comment.slice(0, 120)}"`
      : `${payload.customer_name ?? "Cliente"} dejó ${payload.rating}/5 estrellas. ${
          autoApprove ? "Ya está publicada (modo directo)." : "Revísala para publicarla."
        }`,
    link: "/admin",
    metadata: {
      review_id: review.id,
      product_id: payload.product_id,
      rating: payload.rating,
      auto_approved: autoApprove,
    },
  })

  // Achievement: primera reseña 5★ que llega a Mari (no se trackea por
  // sesión; es global "first ever" en este device). Como es one-shot
  // forever, no molesta aunque corra varias veces.
  if (payload.rating === 5) {
    try {
      const { tryUnlock } = await import("../../lib/achievements")
      tryUnlock("first_five_star_review")
    } catch {}
  }

  return review
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

/**
 * Reseñas hechas por un cliente (cualquier estado: pending/approved/rejected).
 * Útil para que el cliente vea su propio historial en "Mis reseñas".
 */
export async function listMyReviews(
  email: string,
  limit = 50,
): Promise<Review[]> {
  if (!email) return []
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("customer_email", email.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    if (/does not exist|not found|404/i.test(error.message)) return []
    throw error
  }
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
  const review = data as Review

  // Si publicamos la reseña, avisamos al cliente que su reseña fue
  // publicada para reforzar su engagement.
  if (status === "approved" && review.customer_email) {
    await notifyClient(review.customer_email, {
      type: "review_published",
      title: "¡Tu reseña fue publicada!",
      body: "Gracias por compartir tu opinión. Ya es visible para los demás clientes.",
      link: "/tienda",
      metadata: { review_id: review.id, product_id: review.product_id },
    })
  }

  return review
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
  // Reseñas con foto: las ven otros clientes, vale la pena mantener
  // calidad media. Defaults del compresor (1280px, q78, WebP).
  const compact = await compressImage(file)
  const ext = (compact.name.split(".").pop() || "jpg").toLowerCase()
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
    .upload(path, compact, {
      cacheControl: "3600",
      upsert: false,
      contentType: compact.type || "image/jpeg",
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

/* ─────────────── PRODUCTOS POR RESEÑAR ─────────────── */

/**
 * Producto que el cliente compró alguna vez y aún puede reseñar.
 * `lastPurchaseAt` ayuda a ordenar por más reciente primero.
 */
export interface ProductToReview {
  product_id: string
  product_name: string
  image_url: string | null
  last_purchase_at: string
  /** Si ya tiene reseña del mismo email (para flag opcional). */
  alreadyReviewed: boolean
}

/**
 * Lista los productos UNICOS que el cliente ha comprado y que aún NO
 * ha reseñado.
 *
 * Reglas para qué pedido cuenta:
 *   - Pedido NO cancelado (`status != 'cancelled'`).
 *   - Si la regla `reviews_on_paid_enabled` está activa → basta con que
 *     el pedido esté pagado (`balance <= 0`) o entregado.
 *   - Si está apagada → solo cuenta cuando el pedido tiene
 *     `delivery.status = 'delivered'` O cuando está pagado sin delivery
 *     (pickup en tienda).
 *
 * Algoritmo:
 *   1. Trae `sales` del cliente con joins ligeros.
 *   2. Filtra los que califican según la regla.
 *   3. Carga sale_items DISTINCT product_id de esos sales.
 *   4. Cross-check con reviews del mismo email.
 *   5. Devuelve los que NO tienen reseña (a menos que `includeReviewed=true`).
 *
 * Performance: best-effort. Limita a 200 productos.
 */
export async function listMyProductsToReview(
  email: string,
  opts: { onPaidEnabled?: boolean; includeReviewed?: boolean } = {},
): Promise<ProductToReview[]> {
  if (!email) return []
  const { onPaidEnabled = false, includeReviewed = false } = opts

  // 1. Pedidos del cliente (no cancelados) con datos minimos.
  const { data: salesRaw } = await supabase
    .from("sales")
    .select("id, paid, total, status, created_at")
    .ilike("customer_email", email.trim())
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(100)

  const sales = (salesRaw ?? []) as Array<{
    id: string
    paid: number | null
    total: number | null
    status: string
    created_at: string
  }>
  if (sales.length === 0) return []

  // 2. Cargamos las comandas asociadas para saber cuales fueron entregadas.
  const saleIds = sales.map((s) => s.id)
  const { data: deliveriesRaw } = await supabase
    .from("delivery_notes")
    .select("sale_id, status")
    .in("sale_id", saleIds)
  const deliveryBySale = new Map<string, string>()
  for (const d of (deliveriesRaw ?? []) as Array<{ sale_id: string; status: string }>) {
    // Si una venta tiene varias comandas, gana el estatus "mas avanzado"
    // (delivered > picked_up > sent > draft > cancelled). Para nuestro
    // proposito basta con marcar si esta entregada.
    if (d.status === "delivered" || !deliveryBySale.has(d.sale_id)) {
      deliveryBySale.set(d.sale_id, d.status)
    }
  }

  // 3. Filtra sales segun la regla.
  const eligibleSales = sales.filter((s) => {
    const balance = Math.max(0, (Number(s.total) || 0) - (Number(s.paid) || 0))
    const isPaid = balance <= 0
    if (!isPaid) return false
    const deliveryStatus = deliveryBySale.get(s.id) // undefined si no hay comanda
    if (onPaidEnabled) return true // pagado basta
    // Default: entregado, o pagado sin comanda (pickup).
    return deliveryStatus === "delivered" || !deliveryStatus
  })
  if (eligibleSales.length === 0) return []

  // 4. sale_items DISTINCT product_id con info para mostrar.
  const eligibleIds = eligibleSales.map((s) => s.id)
  const { data: itemsRaw } = await supabase
    .from("sale_items")
    .select("sale_id, product_id, product_name, variants(image_url, image_urls)")
    .in("sale_id", eligibleIds)
    .limit(500)

  const items = (itemsRaw ?? []) as Array<{
    sale_id: string
    product_id: string | null
    product_name: string | null
    variants:
      | { image_url: string | null; image_urls: string[] | null }
      | null
  }>

  // Mapa sale_id -> created_at para resolver last_purchase_at por producto.
  const saleCreatedAt = new Map(eligibleSales.map((s) => [s.id, s.created_at]))

  const productsMap = new Map<string, ProductToReview>()
  for (const it of items) {
    if (!it.product_id) continue
    const existing = productsMap.get(it.product_id)
    const purchaseAt = saleCreatedAt.get(it.sale_id) ?? ""
    if (existing) {
      if (purchaseAt > existing.last_purchase_at) {
        existing.last_purchase_at = purchaseAt
      }
      continue
    }
    const img =
      it.variants?.image_urls?.[0] ?? it.variants?.image_url ?? null
    productsMap.set(it.product_id, {
      product_id: it.product_id,
      product_name: it.product_name ?? "Producto",
      image_url: img,
      last_purchase_at: purchaseAt,
      alreadyReviewed: false,
    })
  }

  if (productsMap.size === 0) return []

  // 5. Cross-check con reviews: marca alreadyReviewed.
  const productIds = Array.from(productsMap.keys())
  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("product_id")
    .in("product_id", productIds)
    .ilike("customer_email", email.trim())
  const reviewedSet = new Set(
    ((reviewRows ?? []) as Array<{ product_id: string }>).map(
      (r) => r.product_id,
    ),
  )
  for (const id of reviewedSet) {
    const p = productsMap.get(id)
    if (p) p.alreadyReviewed = true
  }

  // 6. Filtra y ordena por fecha de compra DESC.
  const list = Array.from(productsMap.values())
    .filter((p) => includeReviewed || !p.alreadyReviewed)
    .sort((a, b) => b.last_purchase_at.localeCompare(a.last_purchase_at))
    .slice(0, 200)

  return list
}

/** Count rápido de productos pendientes por reseñar — para badges. */
export async function countMyProductsToReview(
  email: string,
  opts: { onPaidEnabled?: boolean } = {},
): Promise<number> {
  try {
    const list = await listMyProductsToReview(email, opts)
    return list.length
  } catch {
    return 0
  }
}

/* ─────────────── STORIES DE RESEÑAS (marketing orgánico) ─────────────── */

/**
 * Reseña destacada para mostrar como "story" en el Home cliente.
 * Incluye nombre del producto para que el cliente pueda navegar.
 */
export interface TopReviewStory {
  id: string
  product_id: string
  product_name: string
  rating: number
  comment: string | null
  image_url: string
  customer_name: string | null
  created_at: string
}

/**
 * Reseñas TOP con foto para la mini-banda de "Stories de reseñas".
 *
 * Criterio: aprobadas, rating >= 4, con `image_url`. Las ordena por
 * recientes primero (creemos que el feed se sienta vivo). Limit 12 que
 * es lo que cabe en un scroll horizontal estilo Instagram.
 *
 * Si la tabla `reviews` aún no existe (cliente sin SQL aplicado), no
 * truena: devuelve lista vacía.
 */
export async function listTopReviewsWithPhoto(
  limit = 12,
): Promise<TopReviewStory[]> {
  try {
    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, product_id, rating, comment, image_url, customer_name, created_at",
      )
      .eq("status", "approved")
      .gte("rating", 4)
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) return []
    const rows = (data ?? []) as Array<{
      id: string
      product_id: string
      rating: number
      comment: string | null
      image_url: string
      customer_name: string | null
      created_at: string
    }>
    if (rows.length === 0) return []

    // Resuelve nombres de producto en una sola query.
    const productIds = Array.from(new Set(rows.map((r) => r.product_id)))
    const { data: prodRows } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds)
    const nameMap = new Map<string, string>()
    for (const p of (prodRows ?? []) as Array<{ id: string; name: string }>) {
      nameMap.set(p.id, p.name)
    }

    return rows.map((r) => ({
      ...r,
      product_name: nameMap.get(r.product_id) ?? "Producto",
    }))
  } catch {
    return []
  }
}

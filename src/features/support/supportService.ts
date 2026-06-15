import { supabase } from "../../lib/supabase"

export type SupportCategory = "damaged" | "shipping" | "comment"
export type SupportStatus = "open" | "in_progress" | "resolved"

export const SUPPORT_CATEGORIES: {
  id: SupportCategory
  label: string
  hint: string
  emoji: string
}[] = [
  {
    id: "damaged",
    label: "Producto dañado o incorrecto",
    hint: "Llegó roto, sucio, no coincide con lo pedido",
    emoji: "📦",
  },
  {
    id: "shipping",
    label: "Duda con envío foráneo",
    hint: "Tracking, fecha, paquetería, dirección",
    emoji: "🚚",
  },
  {
    id: "comment",
    label: "Comentario o sugerencia",
    hint: "Idea, queja, felicitación, mejora",
    emoji: "💬",
  },
]

export interface SupportTicket {
  id: string
  sale_id: string | null
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  category: SupportCategory
  description: string | null
  image_url: string | null
  status: SupportStatus
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

/**
 * Sube una imagen al bucket `product-images/support/` y devuelve la URL pública.
 * Reutilizamos el bucket que ya usan proofs (mismas policies abiertas).
 */
export async function uploadSupportImage(input: {
  saleId: string | null
  file: File
}): Promise<string> {
  if (!input.file.type.startsWith("image/")) {
    throw new Error("Sólo imágenes")
  }
  if (input.file.size > 5 * 1024 * 1024) {
    throw new Error("La foto pesa más de 5MB")
  }
  const ext = input.file.name.split(".").pop()?.toLowerCase() || "jpg"
  const sub = input.saleId ?? "anon"
  const path = `support/${sub}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from("product-images")
    .upload(path, input.file, { cacheControl: "31536000", upsert: false })
  if (upErr) throw upErr

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path)

  return publicUrl
}

/**
 * Crea un ticket de soporte desde el ticket público del cliente. Llama a
 * la RPC `create_support_ticket` que hace el INSERT con SECURITY DEFINER.
 */
export async function createSupportTicket(input: {
  saleId: string | null
  category: SupportCategory
  description: string
  imageUrl?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_sale_id: input.saleId,
    p_category: input.category,
    p_description: input.description,
    p_image_url: input.imageUrl ?? null,
  })
  if (error) throw error
  return data as string
}

/** Lista para la bandeja admin (orden cronológico) */
export async function listSupportTickets(opts?: {
  status?: SupportStatus | "all"
  limit?: number
}): Promise<SupportTicket[]> {
  const status = opts?.status ?? "open"
  const limit = opts?.limit ?? 100
  let q = supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (status !== "all") q = q.eq("status", status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as SupportTicket[]
}

export async function updateSupportStatus(
  ticketId: string,
  status: SupportStatus
): Promise<void> {
  const { error } = await supabase.rpc("update_support_ticket_status", {
    p_ticket_id: ticketId,
    p_status: status,
  })
  if (error) throw error
}

/**
 * Mensaje pre-llenado de WhatsApp para que admin resuelva rápido.
 * Devuelve href listo para `<a href=...>`.
 */
export function buildSupportWhatsApp(ticket: SupportTicket): string {
  const phone = (ticket.customer_phone ?? "").replace(/\D/g, "")
  if (!phone) return ""
  const fullPhone = phone.length === 10 ? `52${phone}` : phone

  const cat =
    SUPPORT_CATEGORIES.find((c) => c.id === ticket.category)?.label ??
    ticket.category
  const nameLine = ticket.customer_name ? `, ${ticket.customer_name.split(" ")[0]}` : ""

  const lines = [
    `Hola${nameLine} 👋`,
    `Soy Mari, recibí tu mensaje sobre:`,
    `*${cat}*`,
    ticket.description ? `\n"${ticket.description}"` : "",
    `\n¿Cómo te puedo ayudar a resolverlo? ✨`,
  ]
  const text = lines.filter(Boolean).join("\n")
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`
}

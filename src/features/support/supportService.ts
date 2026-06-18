import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"
import { compressImage } from "../../lib/imageCompress"

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
  const isVideo = input.file.type.startsWith("video/")
  if (!input.file.type.startsWith("image/") && !isVideo) {
    throw new Error("Sólo imágenes o videos")
  }
  const limit = isVideo ? 25 * 1024 * 1024 : 5 * 1024 * 1024
  if (input.file.size > limit) {
    throw new Error(isVideo ? "El video pesa más de 25MB" : "La foto pesa más de 5MB")
  }
  const payload = isVideo
    ? input.file
    : await compressImage(input.file, { maxWidth: 1024, quality: 0.72 })
  const ext = payload.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg")
  const sub = input.saleId ?? "anon"
  const path = `support/${sub}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from("product-images")
    .upload(path, payload, {
      cacheControl: "31536000",
      upsert: false,
      contentType: payload.type || (isVideo ? "video/mp4" : "image/jpeg"),
    })
  if (upErr) throw upErr

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path)

  return publicUrl
}

/**
 * Crea un ticket de soporte desde el ticket público del cliente. Llama a
 * la RPC `create_support_ticket` que hace el INSERT con SECURITY DEFINER.
 * Después intenta notificar a TODOS los admins activos vía insert directo
 * en `notifications` (best-effort: si RLS lo bloquea, no rompe el flujo;
 * de cualquier modo la sección Soporte del admin se refresca al entrar).
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
  const ticketId = data as string

  // Notifica a admins (best-effort).
  // Buscamos correos de admin/staff activos y creamos una fila por cada uno
  // en `notifications`. Es opcional: si la migración/RLS no lo permite,
  // sólo dejamos warning en consola y devolvemos el ticketId igual.
  try {
    const meta = SUPPORT_CATEGORIES.find((c) => c.id === input.category)
    const catLabel = meta?.label ?? input.category
    const catEmoji = meta?.emoji ?? "💬"

    const { data: admins, error: aErr } = await supabase
      .from("user_profiles")
      .select("email")
      .in("role", ["admin", "staff"])
      .not("email", "is", null)
    if (aErr) throw aErr

    const rows = (admins ?? [])
      .filter((a) => !!a.email)
      .map((a) => ({
        recipient_email: a.email as string,
        recipient_role: "admin" as const,
        type: "support_ticket",
        title: `${catEmoji} Nuevo reporte de cliente`,
        body: input.description?.slice(0, 140) || catLabel,
        link: "/admin",
        metadata: {
          ticket_id: ticketId,
          sale_id: input.saleId,
          category: input.category,
        },
      }))

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("notifications").insert(rows)
      if (insErr) debug.warn("[support] notif admin fallo:", insErr.message)
    }
  } catch (e: any) {
    debug.warn("[support] notif admin excepción:", e?.message)
  }

  return ticketId
}

/** Lista para la bandeja admin (orden cronológico). Devuelve [] si la
 *  tabla aún no existe (la migración 0016 / 0017 no se corrió). */
export async function listSupportTickets(opts?: {
  status?: SupportStatus | "all"
  limit?: number
}): Promise<SupportTicket[]> {
  const status = opts?.status ?? "open"
  const limit = opts?.limit ?? 100
  try {
    let q = supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (status !== "all") q = q.eq("status", status)
    const { data, error } = await q
    if (error) {
      // 404 / tabla inexistente: devolvemos [] silencioso
      if (/does not exist|not found|404/i.test(error.message)) return []
      throw error
    }
    return (data ?? []) as SupportTicket[]
  } catch (e: any) {
    if (/does not exist|not found|404/i.test(e?.message ?? "")) return []
    throw e
  }
}

/** Indica si la tabla de soporte está lista para uso. Se usa en la UI
 *  para mostrar un mensaje claro cuando el admin no corrió la migración. */
export async function supportTableReady(): Promise<boolean> {
  const { error } = await supabase
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .limit(1)
  if (!error) return true
  return !/does not exist|not found|404/i.test(error.message)
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
 * Resuelve la incidencia y notifica al cliente con un mensaje de
 * respuesta visible en su buzón. Hace 3 cosas:
 *   1) Update del estatus vía RPC oficial.
 *   2) Si la columna `resolution_message` existe en support_tickets,
 *      la guarda con el texto del admin.
 *   3) Inserta en `notifications` para el cliente (recipient_email +
 *      recipient_role='client'). Si falla por RLS hace fallback silencioso.
 */
export async function resolveTicket(
  ticket: SupportTicket,
  message: string
): Promise<void> {
  // 1) Cambia el estatus
  await updateSupportStatus(ticket.id, "resolved")

  // 2) Persiste el mensaje (si existe columna)
  if (message.trim()) {
    try {
      await supabase
        .from("support_tickets")
        .update({ resolution_message: message.trim() })
        .eq("id", ticket.id)
    } catch {
      /* columna puede no existir todavía — no rompemos */
    }
  }

  // 3) Notificación al cliente
  if (ticket.customer_email) {
    try {
      await supabase.from("notifications").insert({
        recipient_email: ticket.customer_email,
        recipient_role: "client",
        type: "support_resolved",
        title: "Tu reporte fue resuelto",
        body: message.trim() || "Resolvimos tu incidencia. Si necesitas más ayuda, escríbenos.",
        link: ticket.sale_id ? `/mis-pedidos` : null,
        metadata: {
          ticket_id: ticket.id,
          sale_id: ticket.sale_id,
          category: ticket.category,
          resolution_message: message.trim() || null,
        },
      })
    } catch (e: any) {
      debug.warn("[support] notif insert fallo:", e?.message)
    }
  }
}

/** Lista las incidencias del cliente logueado (por email). */
export async function listMyTickets(
  email: string
): Promise<SupportTicket[]> {
  if (!email) return []
  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) {
      if (/does not exist|not found|404/i.test(error.message)) return []
      throw error
    }
    return (data ?? []) as SupportTicket[]
  } catch (e: any) {
    if (/does not exist|not found|404/i.test(e?.message ?? "")) return []
    throw e
  }
}

/**
 * Construye un href de wa.me con la plantilla de RESOLUCIÓN ya redactada.
 * Diferente a buildSupportWhatsApp (que es para abrir el caso).
 */
export function buildSupportResolutionWhatsApp(
  ticket: SupportTicket,
  message: string
): string {
  const phone = (ticket.customer_phone ?? "").replace(/\D/g, "")
  if (!phone) return ""
  const fullPhone = phone.length === 10 ? `52${phone}` : phone

  const nameLine = ticket.customer_name ? `, ${ticket.customer_name.split(" ")[0]}` : ""
  const folio = ticket.sale_id ? ` (folio ${ticket.sale_id.slice(0, 8).toUpperCase()})` : ""
  const lines = [
    `Hola${nameLine}, soy del equipo Beauty's Me.`,
    `Tu reporte${folio} ya fue resuelto:`,
    "",
    message.trim() || "Listo, todo arreglado. Cualquier cosa avísame.",
  ]
  const text = lines.join("\n")
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`
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
    `Equipo Beauty's Me, recibimos tu mensaje sobre:`,
    `*${cat}*`,
    ticket.description ? `\n"${ticket.description}"` : "",
    `\n¿Cómo te puedo ayudar a resolverlo? ✨`,
  ]
  const text = lines.filter(Boolean).join("\n")
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`
}

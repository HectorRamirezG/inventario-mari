import { supabase } from "../../lib/supabase"
import { notifyClient, notifyAdmins } from "../notifications/notificationsService"

/**
 * Delivery Notes (Comandas de entrega) — service.
 *
 * Persistencia y reglas en `supabase/delivery_notes.sql`.
 * Workflow: draft → sent → picked_up → delivered (o cancelled).
 *
 * Patrón: Mari arma la comanda asociada a una venta y obtiene un
 * `public_token` para mandar por WhatsApp al repartidor. El repartidor
 * abre el link y ve toda la info via `getPublicDeliveryNote(token)`.
 */

export type DeliveryStatus =
  | "draft"
  | "sent"
  | "picked_up"
  | "delivered"
  | "cancelled"

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  draft: "Borrador",
  sent: "Enviado al repartidor",
  picked_up: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

export const DELIVERY_STATUS_TONE: Record<
  DeliveryStatus,
  { bg: string; text: string }
> = {
  draft: { bg: "bg-slate-100", text: "text-slate-600" },
  sent: { bg: "bg-amber-100", text: "text-amber-700" },
  picked_up: { bg: "bg-sky-100", text: "text-sky-700" },
  delivered: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { bg: "bg-rose-100", text: "text-rose-700" },
}

export interface DeliveryNote {
  id: string
  sale_id: string
  driver_name: string | null
  driver_phone: string | null
  delivery_address: string | null
  delivery_location_url: string | null
  delivery_zone: string | null
  delivery_time_target: string | null
  meeting_point: string | null
  amount_to_collect: number
  payment_method_expected: string | null
  notes: string | null
  status: DeliveryStatus
  public_token: string
  created_at: string
  sent_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
}

export interface CreateDeliveryInput {
  sale_id: string
  driver_name?: string | null
  driver_phone?: string | null
  delivery_address?: string | null
  delivery_location_url?: string | null
  delivery_zone?: string | null
  delivery_time_target?: string | null
  meeting_point?: string | null
  amount_to_collect: number
  payment_method_expected?: string | null
  notes?: string | null
}

/* ─────────── CRUD ─────────── */

export async function createDeliveryNote(
  input: CreateDeliveryInput,
): Promise<DeliveryNote> {
  const payload = {
    sale_id: input.sale_id,
    driver_name: input.driver_name?.trim() || null,
    driver_phone: input.driver_phone?.trim() || null,
    delivery_address: input.delivery_address?.trim() || null,
    delivery_location_url: input.delivery_location_url?.trim() || null,
    delivery_zone: input.delivery_zone?.trim() || null,
    delivery_time_target: input.delivery_time_target?.trim() || null,
    meeting_point: input.meeting_point?.trim() || null,
    amount_to_collect: Number(input.amount_to_collect) || 0,
    payment_method_expected: input.payment_method_expected?.trim() || null,
    notes: input.notes?.trim() || null,
    status: "draft" as DeliveryStatus,
  }
  const { data, error } = await supabase
    .from("delivery_notes")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data as DeliveryNote
}

export async function listDeliveryNotesBySale(
  saleId: string,
): Promise<DeliveryNote[]> {
  const { data, error } = await supabase
    .from("delivery_notes")
    .select("*")
    .eq("sale_id", saleId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as DeliveryNote[]
}

export async function listActiveDeliveryNotes(): Promise<DeliveryNote[]> {
  const { data, error } = await supabase
    .from("delivery_notes")
    .select("*")
    .in("status", ["sent", "picked_up"])
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as DeliveryNote[]
}

export async function updateDeliveryStatus(
  id: string,
  status: DeliveryStatus,
  cancellationReason?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  const now = new Date().toISOString()
  if (status === "sent") patch.sent_at = now
  if (status === "picked_up") patch.picked_up_at = now
  if (status === "delivered") patch.delivered_at = now
  if (status === "cancelled") {
    patch.cancelled_at = now
    if (cancellationReason) patch.cancellation_reason = cancellationReason
  }
  const { error } = await supabase
    .from("delivery_notes")
    .update(patch)
    .eq("id", id)
  if (error) throw error

  // ───── Notificaciones cliente + admin según nuevo estatus ─────
  // Recuperamos email/nombre del cliente desde la sale asociada.
  if (status === "picked_up" || status === "delivered") {
    try {
      const { data: note } = await supabase
        .from("delivery_notes")
        .select("sale_id,driver_name")
        .eq("id", id)
        .maybeSingle()
      if (note?.sale_id) {
        const { data: sale } = await supabase
          .from("sales")
          .select("customer_email,customer_name,public_token")
          .eq("id", note.sale_id)
          .maybeSingle()
        if (sale && (sale as any).customer_email) {
          if (status === "picked_up") {
            await notifyClient((sale as any).customer_email, {
              type: "delivery_picked_up",
              title: "Tu pedido va en camino 🛵",
              body: note.driver_name
                ? `${note.driver_name} ya tiene tu pedido y va para allá.`
                : "El repartidor ya tiene tu pedido y va para allá.",
              link: (sale as any).public_token
                ? `/ticket/${(sale as any).public_token}`
                : null,
              metadata: { delivery_id: id, sale_id: note.sale_id, driver: note.driver_name },
            })
          } else {
            await notifyClient((sale as any).customer_email, {
              type: "delivery_delivered",
              title: "Tu pedido fue entregado 💖",
              body: "Esperamos te encante. Cualquier cosa, escríbenos.",
              link: (sale as any).public_token
                ? `/ticket/${(sale as any).public_token}`
                : null,
              metadata: { delivery_id: id, sale_id: note.sale_id },
            })
          }
        }
        // Notif a admins también para que vean el movimiento en su buzón
        await notifyAdmins({
          type: status === "picked_up" ? "delivery_picked_up" : "delivery_delivered",
          title:
            status === "picked_up"
              ? `Comanda en camino${note.driver_name ? " · " + note.driver_name : ""}`
              : `Comanda entregada${note.driver_name ? " · " + note.driver_name : ""}`,
          body: null,
          link: `/apartados?sale=${note.sale_id}`,
          metadata: { delivery_id: id, sale_id: note.sale_id },
        })
      }
    } catch {
      /* best-effort */
    }
  }
}

export async function deleteDeliveryNote(id: string): Promise<void> {
  const { error } = await supabase.from("delivery_notes").delete().eq("id", id)
  if (error) throw error
}

/* ─────────── Pública (repartidor) ─────────── */

export interface PublicDeliveryNote {
  token: string
  status: DeliveryStatus
  driver_name: string | null
  driver_phone: string | null
  delivery_address: string | null
  delivery_location_url: string | null
  delivery_zone: string | null
  delivery_time_target: string | null
  meeting_point: string | null
  amount_to_collect: number
  payment_method_expected: string | null
  notes: string | null
  created_at: string
  sale: {
    id: string
    total: number
    paid: number
    balance: number
    is_layaway: boolean
    status: string
  }
  customer: {
    name: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
  }
  items: Array<{
    name: string
    variant_name: string
    qty: number
    unit_price: number
    subtotal: number
    image: string | null
  }>
}

export async function getPublicDeliveryNote(
  token: string,
): Promise<PublicDeliveryNote | null> {
  const { data, error } = await supabase.rpc("get_delivery_note", {
    p_token: token,
  })
  if (error) throw error
  const note = (data as PublicDeliveryNote) ?? null

  // ───── Registra que el repartidor ABRIÓ el link (una sola vez) ─────
  // Usamos localStorage para no spammear: marcamos el token como "visto"
  // y solo notificamos a Mari la primera vez.
  if (note && typeof window !== "undefined") {
    const KEY = `mari:delivery-opened:${token}`
    try {
      if (!localStorage.getItem(KEY)) {
        localStorage.setItem(KEY, new Date().toISOString())
        // Notif a admins en background, no bloquea la vista pública
        notifyAdmins({
          type: "delivery_picked_up",
          title: `${note.driver_name ?? "El repartidor"} abrió la comanda`,
          body: note.customer.name
            ? `Pedido de ${note.customer.name}. Ya tiene la info.`
            : "El repartidor ya tiene los datos del pedido.",
          link: `/apartados?sale=${note.sale.id}`,
          metadata: {
            sale_id: note.sale.id,
            driver: note.driver_name,
            event: "opened_link",
          },
        }).catch(() => {})
      }
    } catch {
      /* localStorage puede no estar disponible */
    }
  }

  return note
}

/* ─────────── Helpers ─────────── */

/** URL pública para abrir la comanda. */
export function publicDeliveryUrl(token: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}/comanda/${token}`
}

/** Mensaje de WhatsApp pre-armado para el repartidor. */
export function buildDeliveryWhatsAppMessage(
  note: DeliveryNote,
  customerName: string | null,
): string {
  const url = publicDeliveryUrl(note.public_token)
  const lines = [
    `Hola${note.driver_name ? " " + note.driver_name : ""}, te paso la comanda:`,
    "",
    `Cliente: ${customerName || "—"}`,
    note.delivery_time_target
      ? `Entrega: ${note.delivery_time_target}`
      : null,
    note.amount_to_collect > 0
      ? `Cobrar: $${note.amount_to_collect.toFixed(2)} (${note.payment_method_expected || "efectivo"})`
      : `Ya pagado, solo entrega.`,
    "",
    `Ver detalles + mapa:`,
    url,
  ].filter(Boolean)
  return lines.join("\n")
}

/** Abre WhatsApp Web/App con el mensaje listo para el repartidor. */
export function openWhatsAppDelivery(
  note: DeliveryNote,
  customerName: string | null,
): void {
  if (!note.driver_phone) return
  const phone = note.driver_phone.replace(/\D/g, "")
  const fullPhone = phone.length === 10 ? "52" + phone : phone
  const text = encodeURIComponent(
    buildDeliveryWhatsAppMessage(note, customerName),
  )
  const url = `https://wa.me/${fullPhone}?text=${text}`
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

/* ─────────── Historial de repartidores (localStorage) ─────────── */

/** Guarda repartidor recurrente en localStorage para autocompletar. */
const DRIVERS_KEY = "mari:delivery-drivers"

export interface DriverRecord {
  name: string
  phone: string
  lastUsed: number
}

export function getKnownDrivers(): DriverRecord[] {
  try {
    const raw = localStorage.getItem(DRIVERS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function rememberDriver(name: string, phone: string): void {
  try {
    const clean = phone.replace(/\D/g, "")
    if (!clean) return
    const list = getKnownDrivers()
    const idx = list.findIndex((d) => d.phone === clean)
    const entry: DriverRecord = {
      name: name.trim() || "Repartidor",
      phone: clean,
      lastUsed: Date.now(),
    }
    if (idx >= 0) list[idx] = entry
    else list.unshift(entry)
    // máximo 8 conductores
    localStorage.setItem(DRIVERS_KEY, JSON.stringify(list.slice(0, 8)))
  } catch {
    /* noop */
  }
}

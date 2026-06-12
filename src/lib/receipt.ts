import type { Sale } from "../types/database"

/** Normaliza un teléfono: deja sólo dígitos y agrega 52 si tiene 10. */
export function cleanPhone(raw?: string | null): string {
  const digits = (raw ?? "").replace(/[^\d]/g, "")
  if (!digits) return ""
  return digits.length === 10 ? "52" + digits : digits
}

/** Formato MXN sin decimales. */
const money = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  }).format(n || 0)

const dateShort = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso))

/**
 * Genera un recibo en texto plano (con emoticones discretos) listo
 * para mandar por WhatsApp. Cabe en un solo mensaje.
 */
export function buildReceiptText(sale: Sale): string {
  const lines: string[] = []
  lines.push(`*Mari Inventario*`)
  lines.push(`Recibo ${sale.id.slice(0, 8).toUpperCase()}`)
  lines.push(`Fecha: ${dateShort(sale.created_at)}`)
  lines.push("")
  lines.push(`Cliente: ${sale.customer_name ?? "—"}`)
  lines.push("")
  lines.push(`--- Productos ---`)
  for (const it of sale.sale_items ?? []) {
    const desc = [it.product_name, it.variant_name].filter(Boolean).join(" · ")
    lines.push(`${it.qty}x ${desc}  —  ${money(it.qty * it.unit_price)}`)
  }
  lines.push("")
  lines.push(`Subtotal: *${money(sale.total)}*`)
  if (Number(sale.paid) > 0) {
    lines.push(`Pagado:   ${money(sale.paid)}`)
  }
  if (Number(sale.balance) > 0) {
    lines.push(`Saldo pendiente: *${money(sale.balance)}*`)
  } else {
    lines.push(`Estado: PAGADO ✅`)
  }
  if (sale.notes) {
    lines.push("")
    lines.push(`Nota: ${sale.notes}`)
  }
  lines.push("")
  lines.push("Gracias por tu compra ✨")
  return lines.join("\n")
}

/**
 * Abre WhatsApp con el recibo pre-rellenado.
 * - Si hay teléfono, lo manda al chat de ese contacto.
 * - Si no, abre el "share" para que el usuario elija destinatario.
 */
export function sendReceiptByWhatsApp(sale: Sale) {
  const text = encodeURIComponent(buildReceiptText(sale))
  const phone = cleanPhone(sale.customer_phone)
  const url = phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`
  window.open(url, "_blank", "noopener,noreferrer")
}

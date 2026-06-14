import type { Sale } from "../types/database"
import {
  formatMoney,
  formatDate,
  intlPhone,
  shortId,
} from "./format"
import { getStoreInfo } from "./useStoreInfo"

/**
 * Genera un recibo en texto plano (con emoticones discretos) listo
 * para mandar por WhatsApp/Email. Cabe en un solo mensaje.
 */
export function buildReceiptText(sale: Sale): string {
  const store = getStoreInfo()
  const lines: string[] = []
  lines.push(`*${store.name}*`)
  if (store.tagline) lines.push(`_${store.tagline}_`)
  lines.push(`Recibo ${shortId(sale.id)}`)
  lines.push(`Fecha: ${formatDate(sale.created_at)}`)
  lines.push("")
  lines.push(`Cliente: ${sale.customer_name ?? "—"}`)
  lines.push("")
  lines.push(`--- Productos ---`)
  for (const it of sale.sale_items ?? []) {
    const desc = [it.product_name, it.variant_name].filter(Boolean).join(" · ")
    lines.push(`${it.qty}x ${desc}  —  ${formatMoney(it.qty * it.unit_price)}`)
  }
  lines.push("")
  lines.push(`Subtotal: *${formatMoney(sale.total)}*`)
  if (Number(sale.paid) > 0) {
    lines.push(`Pagado:   ${formatMoney(sale.paid)}`)
  }
  if (Number(sale.balance) > 0) {
    lines.push(`Saldo pendiente: *${formatMoney(sale.balance)}*`)
    if (sale.payment_url) {
      lines.push("")
      lines.push(`Liga de pago: ${sale.payment_url}`)
    }
  } else {
    lines.push(`Estado: PAGADO ✅`)
  }
  if (sale.notes) {
    lines.push("")
    lines.push(`Nota: ${sale.notes}`)
  }
  if (store.phone) {
    lines.push("")
    lines.push(`Contacto: ${store.phone}`)
  }
  lines.push("")
  lines.push(store.thanks_message)
  return lines.join("\n")
}

/**
 * Abre WhatsApp con el recibo pre-rellenado.
 * - Si hay teléfono, lo manda al chat de ese contacto.
 * - Si no, abre el "share" para que el usuario elija destinatario.
 */
export function sendReceiptByWhatsApp(sale: Sale) {
  const text = encodeURIComponent(buildReceiptText(sale))
  const phone = intlPhone(sale.customer_phone)
  const url = phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`
  window.open(url, "_blank", "noopener,noreferrer")
}

/** Abre el cliente de correo con el recibo pre-llenado. */
export function sendReceiptByEmail(sale: Sale, to?: string) {
  const subject = `Recibo ${shortId(sale.id)}`
  const body = buildReceiptText(sale)
  const href = `mailto:${to ?? ""}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`
  window.location.href = href
}

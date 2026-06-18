import type { Sale } from "../types/database"
import {
  formatMoney,
  formatDate,
  intlPhone,
  shortId,
} from "./format"
import { getStoreInfo } from "./useStoreInfo"

/**
 * URL pública del ticket que se abre sin login.
 * El token viene del trigger `sales_set_public_token` (migración 0007).
 */
export function publicTicketUrl(sale: Pick<Sale, "id" | "public_token">): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const token = sale.public_token || sale.id
  return `${origin}/ticket/${encodeURIComponent(token)}`
}

const TIER_TAG: Record<string, string> = {
  menudeo: "Menudeo",
  medio: "Medio mayoreo",
  mayoreo: "Mayoreo",
}

/**
 * Genera un recibo listo para WhatsApp con formato premium.
 * Incluye separadores, emojis, dirección + pin de ubicación si existen
 * y enlace al ticket digital.
 * @param avatarUrl URL de la foto de perfil del cliente (opcional, útil para
 *                  que el repartidor sepa a quién busca).
 */
export function buildReceiptText(sale: Sale, avatarUrl?: string | null): string {
  const store = getStoreInfo()
  const lines: string[] = []
  const sep = "━━━━━━━━━━━━━━━━━━━━━━━━━"

  // ═══════ Encabezado ═══════
  lines.push(`✨ *${store.name}* ✨`)
  if (store.tagline) lines.push(`_${store.tagline}_`)
  lines.push(sep)
  lines.push(`🧾 Recibo: *${shortId(sale.id)}*`)
  lines.push(`📅 ${formatDate(sale.created_at)}`)
  if (sale.is_layaway) lines.push(`📌 *APARTADO*`)

  // ═══════ Datos del cliente (bloque dedicado para que se lea de un vistazo) ═══════
  const hasCustomerExtras =
    !!sale.customer_name ||
    !!sale.customer_phone ||
    !!sale.customer_address ||
    !!sale.customer_location ||
    !!avatarUrl
  if (hasCustomerExtras) {
    lines.push("")
    lines.push("*👤 Cliente*")
    if (sale.customer_name) lines.push(`   ${sale.customer_name}`)
    if (sale.customer_phone) lines.push(`   📞 ${sale.customer_phone}`)
    if (sale.customer_address) lines.push(`   🏠 ${sale.customer_address}`)
    if (sale.customer_location) {
      lines.push(`   📍 Ubicación en mapa:`)
      lines.push(`   ${sale.customer_location}`)
    }
    if (avatarUrl) {
      lines.push(`   📸 Foto: ${avatarUrl}`)
    }
  }

  // ═══════ Detalle de productos ═══════
  lines.push("")
  lines.push("*🛍️ Detalle del pedido*")
  lines.push("──────────────────────────")

  for (const it of sale.sale_items ?? []) {
    const desc = it.variant_name
      ? `${it.product_name} — ${it.variant_name}`
      : it.product_name
    const tier = it.tier && it.tier !== "menudeo" ? ` [${TIER_TAG[it.tier]}]` : ""
    lines.push(`• ${it.qty}x ${desc}${tier}`)
    lines.push(
      `   ${formatMoney(it.unit_price)} c/u  ➔  *${formatMoney(it.qty * it.unit_price)}*`
    )
  }

  lines.push(sep)

  // ═══════ Subtotal + envío + descuento/cargo + total ═══════
  const itemsSum = (sale.sale_items ?? []).reduce(
    (a, it) => a + Number(it.qty) * Number(it.unit_price),
    0
  )
  const adj = Number(sale.adjustment_amount) || 0
  const ship = Number(sale.shipping_amount) || 0
  const isForeign = !!sale.is_foreign_shipping

  if (adj !== 0 || ship > 0 || isForeign) {
    lines.push(`Subtotal: ${formatMoney(itemsSum)} MXN`)
    if (isForeign || ship > 0) {
      lines.push(
        `📦 Envío${isForeign ? " foráneo" : ""}: ${
          ship > 0 ? `${formatMoney(ship)} MXN` : "¡Gratis! 🎉"
        }`
      )
    }
    if (adj > 0) {
      lines.push(`💖 Descuento: -${formatMoney(adj)} MXN`)
      if (sale.adjustment_reason) {
        lines.push(`   _${sale.adjustment_reason}_`)
      }
    } else if (adj < 0) {
      lines.push(`➕ Cargo extra: +${formatMoney(Math.abs(adj))} MXN`)
      if (sale.adjustment_reason) {
        lines.push(`   _${sale.adjustment_reason}_`)
      }
    }
  }

  lines.push(`💰 *TOTAL:* ${formatMoney(sale.total)} MXN`)
  if (Number(sale.paid) > 0) {
    lines.push(`💵 Pagado: ${formatMoney(sale.paid)} MXN`)
  }
  if (Number(sale.balance) > 0) {
    lines.push(`🚨 *Pendiente:* ${formatMoney(sale.balance)} MXN`)
  } else {
    lines.push(`✅ *PAGADO*`)
  }

  // ═══════ Acciones / links ═══════
  lines.push("")
  lines.push("*🔗 Ver ticket en línea*")
  lines.push(publicTicketUrl(sale))

  if (sale.payment_url) {
    lines.push("")
    lines.push("*💳 Pagar online*")
    lines.push(sale.payment_url)
  }

  if (sale.notes) {
    lines.push("")
    lines.push(`📝 _${sale.notes}_`)
  }

  // ═══════ Pie ═══════
  lines.push("")
  lines.push(sep)
  if (store.phone) lines.push(`📞 ${store.phone}`)
  if (store.address) lines.push(`📍 ${store.address}`)
  lines.push("")
  lines.push(`💄 ${store.thanks_message}`)

  return lines.join("\n")
}

/**
 * Abre WhatsApp con el recibo pre-rellenado.
 * Si hay teléfono → chat directo. Si no → share picker.
 * @param avatarUrl Foto del cliente para que el repartidor sepa a quién busca.
 */
export function sendReceiptByWhatsApp(sale: Sale, avatarUrl?: string | null) {
  const text = encodeURIComponent(buildReceiptText(sale, avatarUrl))
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

/**
 * Copia el enlace público del ticket al portapapeles.
 * Devuelve la URL para mostrarla en un toast.
 */
export async function copyPublicTicketUrl(sale: Sale): Promise<string> {
  const url = publicTicketUrl(sale)
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* ignore */
    }
  }
  return url
}

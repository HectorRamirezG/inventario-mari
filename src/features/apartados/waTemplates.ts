import type { Sale } from "../../types/database"
import { formatMoney, intlPhone, shortId } from "../../lib/format"
import { publicTicketUrl } from "../../lib/receipt"

export interface WaTemplate {
  id: string
  label: string
  emoji: string
  build: (sale: Sale, ctx: { daysLeft: number; daysSince: number }) => string
}

export const APARTADO_TEMPLATES: WaTemplate[] = [
  {
    id: "friendly_reminder",
    label: "Recordatorio amable",
    emoji: "💖",
    build: (sale) =>
      [
        `Hola ${firstName(sale)} 💖`,
        ``,
        `Pasamos a saludarte y recordarte que tu apartado ${shortId(sale.id)} sigue activo.`,
        `Saldo pendiente: *${formatMoney(Number(sale.balance) || 0)}*`,
        ``,
        `Cuando puedas, aquí está tu ticket:`,
        publicTicketUrl(sale),
        ``,
        `¡Gracias por preferirnos! ✨`,
      ].join("\n"),
  },
  {
    id: "due_tomorrow",
    label: "Vence mañana",
    emoji: "⏰",
    build: (sale, ctx) =>
      [
        `Hola ${firstName(sale)} ⏰`,
        ``,
        `Te aviso que tu apartado ${shortId(sale.id)} vence ${
          ctx.daysLeft === 1 ? "mañana" : "en " + ctx.daysLeft + " días"
        }.`,
        `Saldo: *${formatMoney(Number(sale.balance) || 0)}*`,
        ``,
        `Aquí puedes pagar en línea o avisarme cómo prefieres:`,
        publicTicketUrl(sale),
      ].join("\n"),
  },
  {
    id: "last_chance",
    label: "Última oportunidad",
    emoji: "🚨",
    build: (sale, ctx) =>
      [
        `Hola ${firstName(sale)} 🚨`,
        ``,
        ctx.daysLeft <= 0
          ? `Tu apartado venció hace ${Math.abs(ctx.daysLeft)} día(s) y aún tiene saldo.`
          : `Tu apartado vence en ${ctx.daysLeft} día(s) y aún hay saldo pendiente.`,
        ``,
        `Saldo: *${formatMoney(Number(sale.balance) || 0)}*`,
        ``,
        `Si no puedes liquidarlo, escríbeme para ayudarte a ajustar la fecha o decidir qué hacer con la pieza.`,
        ``,
        publicTicketUrl(sale),
      ].join("\n"),
  },
  {
    id: "delivery_ready",
    label: "Listo para entregar",
    emoji: "📦",
    build: (sale) =>
      [
        `Hola ${firstName(sale)} 📦`,
        ``,
        `Tu pedido ${shortId(sale.id)} ya está listo para entrega.`,
        sale.is_foreign_shipping
          ? `Te aviso cuando salga la guía de paquetería.`
          : `Avísame a qué hora te queda bien pasar a recogerlo o coordinar entrega.`,
        ``,
        publicTicketUrl(sale),
      ].join("\n"),
  },
  {
    id: "thanks",
    label: "Gracias y vuelve",
    emoji: "✨",
    build: (sale) =>
      [
        `Hola ${firstName(sale)} ✨`,
        ``,
        `Mil gracias por tu compra ${shortId(sale.id)}, ya quedó marcada como pagada.`,
        `¡Espero que disfrutes mucho tu pedido!`,
        ``,
        `Cuando quieras volver a apartar algo, aquí está la tienda:`,
        `${typeof window !== "undefined" ? window.location.origin : ""}/`,
      ].join("\n"),
  },
]

function firstName(sale: Sale): string {
  return (sale.customer_name ?? "").split(" ")[0] || "linda"
}

export function buildTemplateText(
  template: WaTemplate,
  sale: Sale
): string {
  const created = new Date(sale.created_at)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const created0 = new Date(created)
  created0.setHours(0, 0, 0, 0)
  const daysSince = Math.max(
    0,
    Math.round((today.getTime() - created0.getTime()) / 86400000)
  )
  const due = new Date(created0)
  due.setDate(due.getDate() + 30)
  const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000)
  return template.build(sale, { daysLeft, daysSince })
}

export function openTemplateInWhatsApp(template: WaTemplate, sale: Sale) {
  const text = buildTemplateText(template, sale)
  const phone = intlPhone(sale.customer_phone)
  const enc = encodeURIComponent(text)
  const url = phone ? `https://wa.me/${phone}?text=${enc}` : `https://wa.me/?text=${enc}`
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

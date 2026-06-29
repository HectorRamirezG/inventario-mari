/**
 * Parser de códigos QR / barras escaneados en el admin.
 *
 * Los QR del sistema pueden ser de varios tipos (ticket público,
 * comanda pública, deep-link de producto, SKU plano). Antes el scanner
 * de Ventas solo sabía buscar SKUs → si Mari escaneaba el QR del
 * ticket del cliente le decía "Código 'https://…' no encontrado".
 *
 * Este helper detecta el tipo del código UNA sola vez y lo entrega
 * ya tipado para que cada caller decida qué hacer:
 *   - `ticket` / `comanda`: navegar a Apartados / Comandas con el saleId.
 *   - `product`: agregar al carrito si está en catálogo.
 *   - `external_url`: avisar que no es un código válido para esta vista.
 *   - `sku`: lookup por SKU/variant_name como hasta ahora.
 *
 * NUNCA throws. Devuelve siempre algo razonable (último fallback = sku).
 */

export type ScannedCode =
  | { kind: "ticket"; token: string }
  | { kind: "comanda"; token: string }
  | { kind: "product"; id: string }
  | { kind: "external_url"; url: string }
  | { kind: "sku"; code: string }

/**
 * Convierte un string crudo del scanner en una unión etiquetada con el
 * tipo de código detectado. Reglas (orden importa):
 *   1. URL con `/ticket/<token>` → ticket (token de 8+ chars alfanum)
 *   2. URL con `/comanda/<token>` → comanda
 *   3. URL con `/p/<id>` → product (deep-link público de la tienda)
 *   4. Cualquier otra URL `http(s)://` → external_url
 *   5. Fallback: sku (texto plano upperased en el caller si aplica)
 */
export function parseScannedCode(raw: string): ScannedCode {
  const text = (raw ?? "").trim()
  if (!text) return { kind: "sku", code: "" }

  // Patrón compartido para tokens: 8+ chars alfanuméricos + guiones/underscore.
  // Cubre UUIDs sin guiones (32 chars) y formatos cortos.
  const TOKEN_RE = /([A-Za-z0-9_-]{8,})/.source

  const ticket = text.match(new RegExp(`/ticket/${TOKEN_RE}`, "i"))
  if (ticket) return { kind: "ticket", token: ticket[1] }

  const comanda = text.match(new RegExp(`/comanda/${TOKEN_RE}`, "i"))
  if (comanda) return { kind: "comanda", token: comanda[1] }

  const product = text.match(new RegExp(`/p/${TOKEN_RE}`, "i"))
  if (product) return { kind: "product", id: product[1] }

  if (/^https?:\/\//i.test(text)) {
    return { kind: "external_url", url: text }
  }

  return { kind: "sku", code: text }
}

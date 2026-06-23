/**
 * Helper para marcar/parsear pedidos como regalo dentro del campo
 * `sales.notes` (sin necesidad de columnas nuevas).
 *
 * Formato de prefix:
 *   [REGALO]\nPara: {recipient}\nMensaje: {message}\n---\n{original notes}
 *
 * La función `parseGiftFromNotes` extrae los datos y devuelve también las
 * notas restantes para que el admin las vea separadas del envoltorio.
 */

export interface GiftMeta {
  isGift: boolean
  recipient: string | null
  message: string | null
  /** Notas originales del cliente (post-prefix). Vacío si solo era envoltorio. */
  rest: string
}

const GIFT_TAG = "[REGALO]"

export function buildGiftNotes(
  recipient: string | null,
  message: string | null,
  extra: string | null,
): string {
  const lines: string[] = []
  const rec = (recipient ?? "").trim()
  const msg = (message ?? "").trim()
  const rest = (extra ?? "").trim()
  if (!rec && !msg && !rest) return ""
  if (rec || msg) {
    lines.push(GIFT_TAG)
    if (rec) lines.push(`Para: ${rec}`)
    if (msg) lines.push(`Mensaje: ${msg}`)
    if (rest) {
      lines.push("---")
      lines.push(rest)
    }
  } else {
    lines.push(rest)
  }
  return lines.join("\n")
}

export function parseGiftFromNotes(notes: string | null | undefined): GiftMeta {
  const raw = (notes ?? "").trim()
  if (!raw || !raw.startsWith(GIFT_TAG)) {
    return { isGift: false, recipient: null, message: null, rest: raw }
  }
  // Separar header del resto por "---"
  const parts = raw.split(/\n---\n/)
  const header = parts[0] ?? ""
  const rest = (parts.slice(1).join("\n---\n") ?? "").trim()
  let recipient: string | null = null
  let message: string | null = null
  const lines = header.split(/\r?\n/)
  for (const line of lines) {
    if (line.startsWith("Para:")) recipient = line.slice("Para:".length).trim() || null
    else if (line.startsWith("Mensaje:")) message = line.slice("Mensaje:".length).trim() || null
  }
  return {
    isGift: true,
    recipient,
    message,
    rest,
  }
}

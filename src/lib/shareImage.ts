import html2canvas from "html2canvas"
import toast from "react-hot-toast"

/**
 * Captura un nodo del DOM como PNG. Devuelve un Blob.
 * Útil para tickets, comprobantes, comandas.
 */
export async function nodeToBlob(node: HTMLElement, scale = 2): Promise<Blob | null> {
  const canvas = await html2canvas(node, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  })
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
}

/**
 * Comparte el ticket como IMAGEN PNG. Intenta:
 *  1) Web Share API con archivo (mobile WhatsApp/Telegram/etc).
 *  2) Si no soporta archivos, abre WhatsApp Web/app con texto + el link al
 *     ticket público.
 *  3) Si tampoco, descarga la imagen.
 */
export async function shareTicketImage(opts: {
  node: HTMLElement | null
  filename?: string
  text?: string
  whatsappPhone?: string | null
  fallbackUrl?: string | null
}) {
  const { node, filename = "ticket.png", text = "", whatsappPhone, fallbackUrl } = opts
  if (!node) {
    toast.error("No se pudo capturar el ticket")
    return
  }
  const tid = toast.loading("Generando imagen del ticket...")
  try {
    const blob = await nodeToBlob(node)
    if (!blob) throw new Error("No se pudo generar imagen")
    const file = new File([blob], filename, { type: "image/png" })

    const nav: any = navigator
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], text: text || undefined })
      toast.success("Listo", { id: tid })
      return
    }

    if (whatsappPhone) {
      downloadBlob(blob, filename)
      const cleanPhone = whatsappPhone.replace(/\D/g, "")
      const composed = encodeURIComponent(
        `${text}${fallbackUrl ? `\n${fallbackUrl}` : ""}`.trim()
      )
      window.open(
        `https://wa.me/${cleanPhone}${composed ? `?text=${composed}` : ""}`,
        "_blank"
      )
      toast.success("Imagen descargada · adjúntala en WhatsApp", { id: tid })
      return
    }

    downloadBlob(blob, filename)
    toast.success("Imagen descargada", { id: tid })
  } catch (e: any) {
    toast.error(e?.message ?? "Error generando imagen", { id: tid })
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

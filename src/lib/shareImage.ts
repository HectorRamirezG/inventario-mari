import toast from "react-hot-toast"

// IMPORTANTE: html2canvas (~200 KB gz) y jspdf (~150 KB gz) son pesados.
// Los cargamos en runtime SOLO cuando el usuario pide imagen o PDF, así el
// bundle inicial es mucho más liviano (Mari abre la app rapidísimo y solo
// paga el peso cuando va a generar un comprobante).
async function loadHtml2Canvas() {
  const mod = await import("html2canvas")
  return mod.default
}
async function loadJsPdf() {
  const mod = await import("jspdf")
  return mod.default ?? (mod as any).jsPDF
}

/**
 * html2canvas v1 no soporta funciones `oklch()` (color space que Tailwind v4
 * usa por defecto para sus paletas). Cuando el parser interno de html2canvas
 * se topa con `oklch(...)` revienta con:
 *   "Attempting to parse an unsupported color function 'oklch'"
 *
 * Workaround: antes de renderizar, walk del DOM clonado y resolver cada
 * color computado a `rgb()` usando un canvas auxiliar (el browser SÍ entiende
 * `oklch` y lo convierte automáticamente cuando lo asignamos a `fillStyle`).
 * Aplicamos el resultado como inline style en el clon, sin tocar el DOM real.
 *
 * Solo procesamos propiedades de color (color, background, border-color,
 * fill, stroke, etc.) para no inflar el clon con cientos de props inline.
 */
const COLOR_PROPS = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "fill",
  "stroke",
  "caret-color",
  "column-rule-color",
] as const

const colorResolverCanvas = document.createElement("canvas")
const colorResolverCtx = colorResolverCanvas.getContext("2d")

/** Convierte cualquier color CSS (oklch, oklab, color(), hex, hsl...) a rgb()
 *  usando el parser nativo del browser via ctx.fillStyle. Si falla, devuelve
 *  el valor original para no perder información. */
function resolveColor(value: string): string {
  if (!value || value === "none" || value === "transparent") return value
  // Atajos: si ya es rgb/rgba/hex, no hace falta convertir.
  if (/^(#|rgb|rgba|hsl|hsla)/i.test(value.trim())) return value
  if (!colorResolverCtx) return value
  try {
    colorResolverCtx.fillStyle = "#000"
    colorResolverCtx.fillStyle = value
    return colorResolverCtx.fillStyle as string
  } catch {
    return value
  }
}

/** Walks el clon aplicando estilos resueltos. Solo toca color props. */
function resolveOklchColors(root: HTMLElement) {
  const all = root.querySelectorAll<HTMLElement>("*")
  const nodes: HTMLElement[] = [root, ...Array.from(all)]
  for (const el of nodes) {
    const cs = window.getComputedStyle(el)
    for (const prop of COLOR_PROPS) {
      const computed = cs.getPropertyValue(prop)
      if (!computed) continue
      // Solo necesitamos reescribir si el valor original o el computado
      // contiene oklch/oklab (computed values en navegadores modernos suelen
      // preservar el color space original).
      if (!/oklch|oklab|color\(/i.test(computed)) continue
      const resolved = resolveColor(computed)
      if (resolved && resolved !== computed) {
        el.style.setProperty(prop, resolved)
      }
    }
    // Gradient backgrounds (background-image) también pueden traer oklch
    const bgImage = cs.getPropertyValue("background-image")
    if (bgImage && /oklch|oklab|color\(/i.test(bgImage)) {
      const replaced = bgImage.replace(
        /(oklch|oklab|color)\([^)]*\)/gi,
        (m) => resolveColor(m)
      )
      el.style.setProperty("background-image", replaced)
    }
  }
}

/**
 * Captura un nodo del DOM como canvas. Si alguna imagen externa falla
 * por CORS, html2canvas se cuelga; por eso usamos `imageTimeout` y
 * `allowTaint: true` como red de seguridad para no quedarnos esperando
 * para siempre.
 */
async function nodeToCanvas(node: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  const html2canvas = await loadHtml2Canvas()
  return html2canvas(node, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: true,    // ← si una img no resuelve CORS, no truena
    imageTimeout: 8000,  // ← evita "se queda cargando para siempre"
    logging: false,
    onclone: (_doc, clonedRoot) => {
      try {
        resolveOklchColors(clonedRoot as HTMLElement)
      } catch (e) {
        console.warn("[shareImage] resolveOklchColors failed", e)
      }
    },
  })
}

/** Wrap del canvas con timeout duro para evitar UI bloqueada. */
async function nodeToCanvasWithTimeout(
  node: HTMLElement,
  scale = 2,
  timeoutMs = 20000
): Promise<HTMLCanvasElement> {
  return Promise.race<HTMLCanvasElement>([
    nodeToCanvas(node, scale),
    new Promise<HTMLCanvasElement>((_, reject) =>
      setTimeout(
        () => reject(new Error("Tomó demasiado tiempo (timeout). Reintenta.")),
        timeoutMs
      )
    ),
  ])
}

/**
 * Captura un nodo del DOM como PNG. Devuelve un Blob.
 * Útil para tickets, comprobantes, comandas.
 */
export async function nodeToBlob(node: HTMLElement, scale = 2): Promise<Blob | null> {
  const canvas = await nodeToCanvasWithTimeout(node, scale)
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
    console.error("[shareTicketImage]", e)
    toast.error(e?.message ?? "Error generando imagen", { id: tid })
  }
}

/**
 * Exporta el nodo a PDF (formato carta) con la imagen capturada del
 * ticket centrada y escalada para llenar la página sin distorsionar.
 * Mismo look-and-feel que la imagen, pero como documento imprimible.
 */
export async function shareTicketPdf(opts: {
  node: HTMLElement | null
  filename?: string
}) {
  const { node, filename = "ticket.pdf" } = opts
  if (!node) {
    toast.error("No se pudo capturar el ticket")
    return
  }
  const tid = toast.loading("Generando PDF...")
  try {
    const canvas = await nodeToCanvasWithTimeout(node, 2)
    const imgData = canvas.toDataURL("image/png")

    // Página tamaño "letter" (216 × 279 mm) en orientación retrato.
    const JsPdfCtor = await loadJsPdf()
    const pdf = new JsPdfCtor({
      unit: "mm",
      format: "letter",
      orientation: "portrait",
    })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 12

    // Escalamos la imagen para que entre dentro del área útil sin deformar.
    const availW = pageW - margin * 2
    const availH = pageH - margin * 2
    const aspect = canvas.width / canvas.height
    let drawW = availW
    let drawH = availW / aspect
    if (drawH > availH) {
      drawH = availH
      drawW = availH * aspect
    }
    const offsetX = (pageW - drawW) / 2
    const offsetY = (pageH - drawH) / 2

    pdf.addImage(imgData, "PNG", offsetX, offsetY, drawW, drawH, undefined, "FAST")
    pdf.save(filename)
    toast.success("PDF descargado", { id: tid })
  } catch (e: any) {
    console.error("[shareTicketPdf]", e)
    toast.error(e?.message ?? "Error generando PDF", { id: tid })
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


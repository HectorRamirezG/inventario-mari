import toast from "react-hot-toast"
import { debug } from "./debug"

// IMPORTANTE: html2canvas (~200 KB gz) y jspdf (~150 KB gz) son pesados.
// Los cargamos en runtime SOLO cuando el usuario pide imagen o PDF, así el
// bundle inicial es mucho más liviano (abre la app rapidísimo y solo
// paga el peso cuando va a generar un comprobante).
async function loadHtml2Canvas() {
  try {
    const mod: any = await import("html2canvas")
    // Vite a veces envuelve módulos CJS como { default: { default: fn } }.
    // Probamos las rutas más comunes y caemos a `mod` si es la función.
    const fn =
      (typeof mod === "function" && mod) ||
      (typeof mod.default === "function" && mod.default) ||
      (mod.default && typeof mod.default.default === "function" && mod.default.default)
    if (typeof fn !== "function") {
      throw new Error(
        "html2canvas no exporta una función. Reinstala dependencias."
      )
    }
    return fn
  } catch (e: any) {
    // En producción debug.error es noop, por eso usamos console directo
    // — generar imagen/PDF es un flujo de usuario crítico que merece
    // un error visible si el chunk dynamic import falla.
    console.error("[shareImage] No se pudo cargar html2canvas:", e)
    throw new Error(
      "No se pudo cargar el generador de imagen. Revisa tu conexión."
    )
  }
}
async function loadJsPdf() {
  try {
    const mod: any = await import("jspdf")
    // jsPDF v2 exporta tanto `default` (clase) como nombre `jsPDF`.
    // Algunas builds de Vite agregan otro nivel de wrap.
    const Ctor =
      (typeof mod === "function" && mod) ||
      (typeof mod.default === "function" && mod.default) ||
      (typeof mod.jsPDF === "function" && mod.jsPDF) ||
      (mod.default && typeof mod.default.jsPDF === "function" && mod.default.jsPDF) ||
      (mod.default && typeof mod.default.default === "function" && mod.default.default)
    if (typeof Ctor !== "function") {
      throw new Error("jsPDF no exporta un constructor.")
    }
    return Ctor
  } catch (e: any) {
    console.error("[shareImage] No se pudo cargar jsPDF:", e)
    throw new Error(
      "No se pudo cargar el generador de PDF. Revisa tu conexión."
    )
  }
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
 * Captura un nodo del DOM como canvas.
 *
 * Estrategia:
 *  1) Intentamos primero `html-to-image` (lib moderna, ~50kb gz):
 *     - Usa `<foreignObject>` de SVG nativo → respeta CSS moderno
 *       (gradientes nuevos, oklch, filters, box-shadows, emojis).
 *     - El "preview" se ve casi idéntico al DOM real.
 *  2) Si falla (CORS de imágenes, browser muy viejo, etc.), caemos a
 *     `html2canvas` que repinta pixel-por-pixel con nuestro workaround
 *     de oklch. Sirve como red de seguridad.
 *
 * Ambos están detrás de `import()` dinámico para no inflar el bundle
 * inicial — solo se cargan cuando el usuario pide imagen/PDF.
 */
async function nodeToCanvas(
  node: HTMLElement,
  scale = 2,
): Promise<HTMLCanvasElement> {
  // ── Intento #1: html-to-image (moderno, mejor calidad visual) ──
  try {
    const htmlToImage: any = await import("html-to-image")
    const dataUrl: string = await htmlToImage.toPng(node, {
      pixelRatio: scale,
      cacheBust: true,
      backgroundColor: "#ffffff",
      // Ignora errores de imagen individual (CORS, 404, etc.) en vez
      // de cancelar todo el render. Devuelve el resto OK.
      skipFonts: false,
      filter: (n: HTMLElement) => {
        // Saltar nodos marcados como `data-no-capture` por si en el
        // futuro queremos esconder ciertos controles del preview.
        if (n.dataset && n.dataset.noCapture === "true") return false
        return true
      },
    })
    // Convertimos el dataURL a <canvas> para mantener compatibilidad
    // con el resto del pipeline (Web Share API + jsPDF esperan canvas/blob).
    return await dataUrlToCanvas(dataUrl)
  } catch (eModern: any) {
    console.warn(
      "[shareImage] html-to-image falló, caigo a html2canvas:",
      eModern?.message,
    )
  }

  // ── Intento #2: html2canvas (legacy, con workaround de oklch) ──
  const html2canvas = await loadHtml2Canvas()
  return html2canvas(node, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: true, // ← si una img no resuelve CORS, no truena
    imageTimeout: 8000, // ← evita "se queda cargando para siempre"
    logging: false,
    onclone: (_doc: Document, clonedRoot: HTMLElement) => {
      try {
        resolveOklchColors(clonedRoot)
      } catch (e) {
        debug.warn("[shareImage] resolveOklchColors failed", e)
      }
    },
  })
}

/** Convierte un data URL PNG en un <canvas> listo para `toBlob()` / jsPDF. */
async function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("No se pudo crear contexto 2D"))
        return
      }
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = () => reject(new Error("No se pudo cargar la imagen capturada"))
    img.src = dataUrl
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
    console.error("[shareTicketImage] FALLO:", e)
    debug.error("[shareTicketImage]", e)
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
    console.error("[shareTicketPdf] FALLO:", e)
    debug.error("[shareTicketPdf]", e)
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


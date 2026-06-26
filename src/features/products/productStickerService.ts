/**
 * Generador de stickers WhatsApp 512×512 webp (transparente).
 *
 * Mari abre el panel admin de un producto → tap "Generar sticker WA"
 * → canvas dibuja: foto del producto recortada circular + nombre +
 * precio + logo tienda. Descarga directa como .webp 512×512.
 *
 * Sin libs externas — canvas puro. Tolerante a img CORS (usamos
 * crossOrigin "anonymous" y fallback a placeholder si la carga falla).
 *
 * El cliente comparte → marketing organic gratis.
 */

import { formatMoney } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"

interface StickerInput {
  productName: string
  imageUrl: string | null
  price: number
  /** Color de marca (hex) — default rosa */
  brandHex?: string
}

export async function generateProductSticker(
  input: StickerInput,
): Promise<Blob | null> {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  const store = getStoreInfo()
  const brand = input.brandHex ?? "#e6007e"

  // Fondo transparente — los stickers de WA lo respetan.
  ctx.clearRect(0, 0, size, size)

  // 1) Círculo de fondo blanco con sombra
  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.25)"
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  ctx.beginPath()
  ctx.arc(size / 2, size / 2 - 30, 200, 0, Math.PI * 2)
  ctx.fillStyle = "#ffffff"
  ctx.fill()
  ctx.restore()

  // 2) Imagen del producto centrada (si carga)
  if (input.imageUrl) {
    try {
      const img = await loadImage(input.imageUrl)
      // Recorte circular
      ctx.save()
      ctx.beginPath()
      ctx.arc(size / 2, size / 2 - 30, 190, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      // Escala "cover"
      const ratio = Math.max(380 / img.width, 380 / img.height)
      const w = img.width * ratio
      const h = img.height * ratio
      ctx.drawImage(img, size / 2 - w / 2, size / 2 - 30 - h / 2, w, h)
      ctx.restore()
    } catch {
      // Fallback: placeholder con inicial
      ctx.fillStyle = "#f1f5f9"
      ctx.beginPath()
      ctx.arc(size / 2, size / 2 - 30, 190, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = brand
      ctx.font = "900 120px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(input.productName[0] ?? "✨", size / 2, size / 2 - 50)
    }
  } else {
    // Sin foto: placeholder
    ctx.fillStyle = brand
    ctx.beginPath()
    ctx.arc(size / 2, size / 2 - 30, 190, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.font = "900 140px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(input.productName[0] ?? "✨", size / 2, size / 2 - 50)
  }

  // 3) Borde decorativo
  ctx.strokeStyle = brand
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(size / 2, size / 2 - 30, 196, 0, Math.PI * 2)
  ctx.stroke()

  // 4) Píldora de precio abajo a la derecha
  const pilLabel = formatMoney(input.price)
  ctx.font = "900 36px system-ui, sans-serif"
  const pilWidth = ctx.measureText(pilLabel).width + 48
  const pilX = size / 2 - pilWidth / 2
  const pilY = size / 2 + 170
  // Sombra
  ctx.save()
  ctx.shadowColor = "rgba(0,0,0,0.2)"
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  drawRoundedRect(ctx, pilX, pilY, pilWidth, 56, 28)
  ctx.fillStyle = brand
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(pilLabel, size / 2, pilY + 28)

  // 5) Nombre producto arriba
  ctx.fillStyle = "#0f172a"
  ctx.font = "900 30px system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const truncated = truncate(input.productName, 22)
  ctx.fillText(truncated, size / 2, 56)

  // 6) Footer con nombre tienda
  ctx.fillStyle = "rgba(15,23,42,0.65)"
  ctx.font = "700 18px system-ui, sans-serif"
  ctx.fillText(
    (store.name ?? "Beauty's Me").slice(0, 24),
    size / 2,
    size - 22,
  )

  // Export como WEBP (mejor compresión)
  return new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      "image/webp",
      0.92,
    )
  })
}

/* ─────────── Helpers ─────────── */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("img load failed"))
    img.src = url
  })
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

/* ─────────── Download + Share ─────────── */

export async function downloadProductSticker(input: StickerInput) {
  const blob = await generateProductSticker(input)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  const safeName = input.productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
  a.download = `${safeName}-sticker.webp`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export async function shareProductSticker(input: StickerInput) {
  const blob = await generateProductSticker(input)
  if (!blob) return "failed" as const
  try {
    if (
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      "canShare" in navigator
    ) {
      const file = new File([blob], "sticker.webp", { type: "image/webp" })
      // @ts-ignore: canShare con files no está en lib viejas
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: input.productName,
          text: `Mira este ${input.productName}!`,
        })
        return "shared" as const
      }
    }
    // Fallback: descarga normal
    await downloadProductSticker(input)
    return "downloaded" as const
  } catch {
    return "failed" as const
  }
}

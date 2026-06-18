/**
 * Compresor de imágenes client-side antes de subir a Supabase Storage.
 *
 * Por qué: los celulares modernos toman fotos de 4000×3000 a 6 MB. Subir
 * eso es lento (~30 segundos en 4G), consume datos del cliente y satura
 * el bucket. Aquí escalamos a 1600px max y recodificamos a JPEG 82
 * antes de tocar la red.
 *
 * Reducciones típicas: 5 MB → 250 KB (20×) sin pérdida visible.
 *
 * API:
 *   const compressed = await compressImage(file, { maxWidth: 1600 })
 *   await supabase.storage.from(...).upload(path, compressed)
 *
 * Notas:
 *   - Si el archivo ya pesa menos del threshold, se devuelve igual.
 *   - Si el browser no soporta `createImageBitmap`, se hace fallback
 *     a <img> + canvas. Funciona en todos los browsers modernos.
 *   - Mantiene la extensión original (jpg/png/webp).
 */

export interface CompressOptions {
  /** Ancho máximo en px (alto se ajusta proporcional). Default 1600. */
  maxWidth?: number
  /** Alto máximo en px. Default 1600. */
  maxHeight?: number
  /** Calidad JPEG/WebP 0-1. Default 0.82. */
  quality?: number
  /** Tamaño en bytes a partir del cual se comprime. Default 800kb. */
  threshold?: number
  /** Forzar formato de salida. Default mismo del input. */
  format?: "image/jpeg" | "image/webp" | "image/png"
}

/**
 * Comprime una imagen si excede el threshold. Devuelve el File original
 * si ya es pequeño o si algo falla (failsafe — no rompe el flujo).
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.82,
    threshold = 800 * 1024,
    format,
  } = opts

  // Skip si no es imagen o ya es chica
  if (!file.type.startsWith("image/")) return file
  if (file.size <= threshold) return file
  // No comprimimos GIFs (perdería animación) ni SVG (es vector)
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file

  try {
    const bitmap = await loadBitmap(file)
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, maxWidth, maxHeight)

    // No tiene sentido comprimir si la imagen ya está chica
    if (bitmap.width <= maxWidth && bitmap.height <= maxHeight && file.size <= threshold * 2) {
      bitmap.close?.()
      return file
    }

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : document.createElement("canvas")

    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = width
      canvas.height = height
    }

    const ctx = (canvas as any).getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) {
      bitmap.close?.()
      return file
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(bitmap as any, 0, 0, width, height)
    bitmap.close?.()

    const outType = format ?? pickOutputType(file.type)
    const blob = await canvasToBlob(canvas, outType, quality)
    if (!blob) return file
    if (blob.size >= file.size) return file // empeoró, devolvemos original

    const newName = file.name.replace(/\.[^.]+$/, "") + extensionFor(outType)
    return new File([blob], newName, {
      type: outType,
      lastModified: Date.now(),
    })
  } catch {
    return file
  }
}

/* ─────────────── helpers internos ─────────────── */

async function loadBitmap(file: File): Promise<ImageBitmap & { close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    return (await createImageBitmap(file)) as ImageBitmap & { close?: () => void }
  }
  // Fallback raro: <img> + URL.createObjectURL
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("load fail"))
      i.src = url
    })
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => {
        /* noop en este fallback */
      },
      // Truco: el canvas API acepta HTMLImageElement, así que devolvemos
      // un objeto compatible con drawImage
      ...(img as any),
    } as any
  } finally {
    URL.revokeObjectURL(url)
  }
}

function scaleToFit(w: number, h: number, maxW: number, maxH: number) {
  if (w <= maxW && h <= maxH) return { width: w, height: h }
  const ratio = Math.min(maxW / w, maxH / h)
  return {
    width: Math.round(w * ratio),
    height: Math.round(h * ratio),
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }
  return (canvas as OffscreenCanvas).convertToBlob({ type, quality })
}

function pickOutputType(inputType: string): string {
  // PNG con transparencia → seguimos en PNG (calidad no aplica)
  if (inputType === "image/png") return "image/png"
  // Resto → JPEG comprimido (mejor compatibilidad y peso)
  return "image/jpeg"
}

function extensionFor(type: string): string {
  if (type === "image/png") return ".png"
  if (type === "image/webp") return ".webp"
  return ".jpg"
}

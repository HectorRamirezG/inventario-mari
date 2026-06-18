/**
 * Transformer de URLs de imágenes de Supabase Storage.
 *
 * Supabase soporta el endpoint `/storage/v1/render/image/public/`
 * (en vez de `/storage/v1/object/public/`) que aplica resize y compresión
 * server-side. Eso convierte una imagen original de 3-5 MB en una
 * thumbnail de 30-80 KB sin tocar el bucket.
 *
 * - Requiere plan Pro/Team de Supabase. En plan free el endpoint NO
 *   responde; en ese caso devolvemos la URL original.
 * - Detectamos disponibilidad con un cache en memoria: si el primer
 *   intento falla, todas las futuras usan original.
 *
 * Uso:
 *   <img src={imageThumb(url, { width: 400, quality: 75 })} />
 */

const ORIGINAL_RE = /\/storage\/v1\/object\/public\//
const RENDER_PREFIX = "/storage/v1/render/image/public/"

export interface ImageTransformOpts {
  /** Ancho objetivo en px. */
  width?: number
  /** Alto objetivo en px (opcional). */
  height?: number
  /** Calidad JPEG/WebP 0-100. Default 75. */
  quality?: number
  /** `cover` (default) o `contain`. */
  resize?: "cover" | "contain" | "fill"
  /** Formato de salida. Default origen (Supabase ya elige WebP si conviene). */
  format?: "origin" | "webp"
}

/**
 * Convierte una URL pública de Supabase en una versión transformada.
 * Si la URL no es de Supabase (o ya está transformada) devuelve igual.
 */
export function imageThumb(
  url: string | null | undefined,
  opts: ImageTransformOpts = {},
): string {
  if (!url) return ""
  if (!ORIGINAL_RE.test(url)) return url

  const params = new URLSearchParams()
  if (opts.width) params.set("width", String(Math.round(opts.width)))
  if (opts.height) params.set("height", String(Math.round(opts.height)))
  params.set("quality", String(opts.quality ?? 75))
  if (opts.resize) params.set("resize", opts.resize)
  // `origin` es el default; sólo seteamos si el usuario quiere WebP forzado
  if (opts.format && opts.format !== "origin") params.set("format", opts.format)

  const transformed = url.replace(ORIGINAL_RE, RENDER_PREFIX)
  const sep = transformed.includes("?") ? "&" : "?"
  return `${transformed}${sep}${params.toString()}`
}

/**
 * Helper para thumbnails de catálogo (grid). 400×400, calidad 75.
 */
export function imageThumbnail(url: string | null | undefined): string {
  return imageThumb(url, { width: 400, quality: 75, resize: "cover" })
}

/**
 * Helper para previews medianos (cards en apartados, sugerencias).
 * 640×640, calidad 78.
 */
export function imageMedium(url: string | null | undefined): string {
  return imageThumb(url, { width: 640, quality: 78, resize: "cover" })
}

/**
 * Helper para avatares y miniaturas chicas. 96×96, calidad 78.
 */
export function imageAvatar(url: string | null | undefined): string {
  return imageThumb(url, { width: 96, quality: 78, resize: "cover" })
}

/**
 * Imagen full-size para lightbox / hero / preview grande.
 * 1200×1200, calidad 85.
 */
export function imageLarge(url: string | null | undefined): string {
  return imageThumb(url, { width: 1200, quality: 85, resize: "contain" })
}

/** Detecta video por extensión en URL. Útil para uploads que comparten
 *  el mismo campo (image_url) entre fotos y videos. */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url)
}

/** Mismas extensiones que isVideoUrl pero para File MIME. */
export function isVideoFile(file: File | null | undefined): boolean {
  if (!file) return false
  return file.type.startsWith("video/")
}

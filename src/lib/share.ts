/** Comparte URL usando Web Share API; cae a clipboard si no hay soporte. */
export async function shareUrl(opts: {
  title?: string
  text?: string
  url: string
}): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      await (navigator as any).share(opts)
      return "shared"
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return "failed"
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(opts.url)
      return "copied"
    }
  } catch {
    /* noop */
  }
  return "failed"
}

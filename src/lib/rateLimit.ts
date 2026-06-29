import { debug } from "./debug"

/**
 * Rate limiter en memoria para acciones costosas del cliente (createSale,
 * uploadProof, etc.). Previene doble-tap y abuso por bots.
 *
 *   if (!rateLimit("create-sale", { max: 5, windowMs: 60_000 })) {
 *     toast.error("Demasiados intentos. Espera un momento.")
 *     return
 *   }
 *
 * No persiste entre refreshes (sería trivial bypass refrescando la
 * página). Para defensa real se necesita rate limiting server-side
 * (edge function o trigger DB). Esto cubre 99% de los casos de
 * doble-tap accidental y bots ingenuos.
 */
interface Bucket {
  hits: number[] // timestamps de los hits dentro de la ventana
}

const buckets = new Map<string, Bucket>()

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number } = { max: 5, windowMs: 60_000 },
): boolean {
  const now = Date.now()
  const b = buckets.get(key) ?? { hits: [] }
  // Limpia hits viejos fuera de la ventana
  b.hits = b.hits.filter((t) => now - t < opts.windowMs)
  if (b.hits.length >= opts.max) {
    debug.warn(`[rateLimit] ${key} bloqueado (${b.hits.length}/${opts.max})`)
    buckets.set(key, b)
    return false
  }
  b.hits.push(now)
  buckets.set(key, b)
  return true
}

/** Reset manual de un bucket (útil para tests o tras login). */
export function resetRateLimit(key: string): void {
  buckets.delete(key)
}

/** Devuelve cuántos ms faltan para que se libere otra petición.
 *  Útil para mostrar al usuario "espera Xs". */
export function rateLimitRetryAfterMs(
  key: string,
  opts: { max: number; windowMs: number } = { max: 5, windowMs: 60_000 },
): number {
  const b = buckets.get(key)
  if (!b || b.hits.length < opts.max) return 0
  const oldest = Math.min(...b.hits)
  return Math.max(0, opts.windowMs - (Date.now() - oldest))
}

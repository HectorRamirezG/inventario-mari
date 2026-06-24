/**
 * Captura simple del parámetro `?ref=email` del URL para tracking de
 * referidos cliente-side. Vive 30 días en localStorage; al hacer
 * signup, el LoginPage lo lee y lo incluye en la notificación al
 * admin (para que Mari otorgue manualmente los puntos `referral`).
 *
 * NO toca la BD. Si Mari quiere tracking server-side completo,
 * se puede agregar columna `user_profiles.referred_by` después.
 */

const KEY = "mari:referred-by:v1"
const TTL_DAYS = 30

interface Stored {
  email: string
  savedAt: string // ISO
}

/** Lee el referrer guardado. Retorna null si expiró o no existe. */
export function getReferredBy(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Stored
    const saved = Date.parse(data.savedAt)
    if (!saved) return null
    const ageMs = Date.now() - saved
    if (ageMs > TTL_DAYS * 24 * 3600 * 1000) {
      localStorage.removeItem(KEY)
      return null
    }
    return data.email.trim().toLowerCase() || null
  } catch {
    return null
  }
}

/** Guarda un referrer. Sanitiza: solo emails válidos básicos. */
export function setReferredBy(email: string): void {
  if (typeof window === "undefined") return
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes("@") || clean.length > 200) return
  try {
    const payload: Stored = { email: clean, savedAt: new Date().toISOString() }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* noop */
  }
}

/** Limpia el referrer (después del signup exitoso). */
export function clearReferredBy(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}

/**
 * Lee `?ref=email` de la URL actual. Si existe y es válido lo guarda
 * y limpia el query string del location (sin recargar) para que un
 * refresh no re-dispare. Best-effort: silencioso si falla.
 */
export function captureReferralFromUrl(): void {
  if (typeof window === "undefined") return
  try {
    const url = new URL(window.location.href)
    const ref = url.searchParams.get("ref")
    if (!ref) return
    setReferredBy(ref)
    // Limpia el query del URL para que un refresh no re-capture y para
    // no exponer el email del referrer en la barra del navegador.
    url.searchParams.delete("ref")
    const cleaned = url.pathname + (url.search ? url.search : "") + url.hash
    window.history.replaceState(null, "", cleaned)
  } catch {
    /* noop */
  }
}

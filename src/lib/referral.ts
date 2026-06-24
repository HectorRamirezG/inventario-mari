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

/** Resultado de la captura de referido en la URL. */
export type ReferralCaptureResult =
  /** No había `?ref=` en la URL. */
  | { kind: "none" }
  /** Se capturó, guardó y limpió el URL. El cliente NO está logueado
   *  o lo está con un email distinto al del referido. */
  | { kind: "captured"; email: string }
  /** Se ignoró: el cliente ya tiene sesión activa con otra cuenta,
   *  así que el ref NO le aplica (no puede ser referido a sí mismo
   *  desde otra cuenta). El URL igual se limpia. */
  | { kind: "ignored_logged_in"; refEmail: string; sessionEmail: string }
  /** Se ignoró: el cliente abrió SU PROPIO link de referido (auto-ref).
   *  Aplica solo si estás logueado con el mismo email. */
  | { kind: "ignored_self"; email: string }

/**
 * Lee `?ref=email` de la URL actual.
 *  - Si NO hay sesión: guarda en localStorage para que LoginPage lo lea.
 *  - Si HAY sesión con email distinto: NO guarda (no aplica para esta
 *    persona, que ya tiene cuenta).
 *  - Si HAY sesión con MISMO email (auto-ref): NO guarda y se ignora.
 *  - Siempre limpia el query `?ref=` del URL para que un refresh no
 *    re-dispare ni se exponga el email del referrer en la barra.
 *
 * `sessionEmail` es opcional para no requerir que la función conozca
 * useAuth — el caller (App.tsx) lo pasa.
 */
export function captureReferralFromUrl(
  sessionEmail?: string | null,
): ReferralCaptureResult {
  if (typeof window === "undefined") return { kind: "none" }
  let refEmail: string | null = null
  try {
    const url = new URL(window.location.href)
    refEmail = url.searchParams.get("ref")
    if (!refEmail) return { kind: "none" }
    // Limpia el query SIEMPRE (incluso si no aplica el ref) para no
    // exponer el email del referrer en la barra del navegador.
    url.searchParams.delete("ref")
    const cleaned = url.pathname + (url.search ? url.search : "") + url.hash
    window.history.replaceState(null, "", cleaned)
  } catch {
    return { kind: "none" }
  }

  const cleanRef = refEmail.trim().toLowerCase()
  if (!cleanRef || !cleanRef.includes("@")) return { kind: "none" }

  const cleanSession = sessionEmail?.trim().toLowerCase() ?? ""

  // Auto-ref: el cliente compartió su propio link y lo abrió logueado
  // (caso típico: prueba el link). No aplicamos pero no es bug.
  if (cleanSession && cleanSession === cleanRef) {
    return { kind: "ignored_self", email: cleanRef }
  }

  // Ya logueado con otra cuenta: no aplica (no podemos otorgarle puntos
  // a alguien que ya tiene cuenta), pero sí avisamos.
  if (cleanSession && cleanSession !== cleanRef) {
    return {
      kind: "ignored_logged_in",
      refEmail: cleanRef,
      sessionEmail: cleanSession,
    }
  }

  // Sin sesión: lo persistimos para que LoginPage muestre el chip y
  // bonifique al admin con el origen del nuevo registro.
  setReferredBy(cleanRef)
  return { kind: "captured", email: cleanRef }
}

// Recordatorio del último usuario logueado en ESTE dispositivo.
// Sirve para mostrar un Smart Login ("Continuar como María") con
// avatar en vez de pedir email manual cada vez. Sólo guarda lo
// estrictamente visual: email, nombre, avatar. NUNCA password.

const KEY = "mari:last-session:v1"

export interface LastSession {
  email: string
  full_name: string | null
  avatar_url: string | null
  savedAt: number
}

export function getLastSession(): LastSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastSession>
    if (!parsed?.email) return null
    return {
      email: String(parsed.email),
      full_name: parsed.full_name ?? null,
      avatar_url: parsed.avatar_url ?? null,
      savedAt: Number(parsed.savedAt) || Date.now(),
    }
  } catch {
    return null
  }
}

export function setLastSession(input: Omit<LastSession, "savedAt">): void {
  if (typeof window === "undefined") return
  try {
    const payload: LastSession = { ...input, savedAt: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* localStorage lleno o privado: ignoramos sin romper */
  }
}

export function clearLastSession(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* silencio */
  }
}

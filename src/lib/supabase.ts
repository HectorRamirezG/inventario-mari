import { createClient } from "@supabase/supabase-js"

/**
 * Limpia basura común de copy-paste (corchetes de markdown, comillas,
 * espacios). Si vino como link markdown `[https://x](https://x)` o con
 * comillas, el constructor de supabase-js lo rechaza con un Error.
 */
function sanitize(raw: string | undefined): string {
    if (!raw) return ""
    const markdown = raw.match(/\((https?:\/\/[^\s)]+)\)/i)
    let v = markdown ? markdown[1] : raw
    v = v.trim().replace(/^["'`<\[]+|["'`>\]]+$/g, "").trim()
    return v
}

// Defaults seguros — la `publishable key` está diseñada para correr en el
// browser, así que embeberla como fallback NO es un riesgo de seguridad.
// Esto evita que la app se rompa si las env vars de Vercel están mal.
const DEFAULT_URL = "https://naxdlainnnkyctcisnew.supabase.co"
const DEFAULT_ANON = "sb_publishable_UviL4QyL2c1Fiy5Dje5UkQ_se2lCZWB"

// URLs viejas / equivocadas: si la env var apunta a una de éstas,
// la ignoramos y usamos el default correcto.
const KNOWN_BAD_URLS = [
  "ppvfxgjcrxrtlxdvtijg.supabase.co",
]

let supabaseUrl = sanitize(import.meta.env.VITE_SUPABASE_URL as string | undefined)
let supabaseAnonKey = sanitize(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

const looksValid = supabaseUrl && /^https?:\/\//i.test(supabaseUrl)
const isBlacklisted = KNOWN_BAD_URLS.some(bad => supabaseUrl.includes(bad))

if (!looksValid || isBlacklisted) {
  // eslint-disable-next-line no-console
  console.warn(
    `[supabase] Ignorando URL inválida o vieja (${JSON.stringify(supabaseUrl)}). ` +
      `Usando ${DEFAULT_URL}. Arregla VITE_SUPABASE_URL en Vercel.`
  )
  supabaseUrl = DEFAULT_URL
}
if (!supabaseAnonKey) {
  supabaseAnonKey = DEFAULT_ANON
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE es más seguro en móvil y maneja mejor los redirects de
    // magic link / OAuth. Sin esto, en iOS Safari el callback a veces
    // dejaba la sesión en un limbo.
    flowType: "pkce",
    storageKey: "mari.auth",
  },
  realtime: {
    // Throttle interno; suficiente para nuestro volumen y evita
    // gastar quota cuando hay muchos toasts simultáneos.
    params: { eventsPerSecond: 5 },
    heartbeatIntervalMs: 25_000,
  },
  global: {
    headers: { "x-mari-client": "web-v2" },
  },
})

// ──────────────────────────────────────────────────────────
// Refresco automático cuando la app vuelve a foco
// ──────────────────────────────────────────────────────────
// En móvil, después de cambiar de app y volver, Supabase a veces
// queda con un token expirado. Forzamos un getSession() al volver
// a foco para que onAuthStateChange dispare el refresh.
if (typeof window !== "undefined") {
  let lastCheck = 0
  const refreshIfNeeded = () => {
    const now = Date.now()
    if (now - lastCheck < 5_000) return // throttle 5s
    lastCheck = now
    supabase.auth.getSession().catch(() => {/* silencio */})
  }
  window.addEventListener("focus", refreshIfNeeded)
  window.addEventListener("online", refreshIfNeeded)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshIfNeeded()
  })
}
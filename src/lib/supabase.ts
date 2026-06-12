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
  },
})
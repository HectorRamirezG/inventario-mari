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

let supabaseUrl = sanitize(import.meta.env.VITE_SUPABASE_URL as string | undefined)
let supabaseAnonKey = sanitize(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

if (!supabaseUrl || !/^https?:\/\//i.test(supabaseUrl)) {
  // eslint-disable-next-line no-console
  console.warn(
    `[supabase] VITE_SUPABASE_URL inválida (${JSON.stringify(supabaseUrl)}). ` +
      `Usando default ${DEFAULT_URL}. Arregla la env var en Vercel.`
  )
  supabaseUrl = DEFAULT_URL
}
if (!supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] VITE_SUPABASE_ANON_KEY faltante. Usando publishable default."
  )
  supabaseAnonKey = DEFAULT_ANON
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
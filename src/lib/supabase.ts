import { createClient } from "@supabase/supabase-js"

/**
 * Limpia basura común de copy-paste (corchetes de markdown, comillas,
 * espacios, paréntesis). Vercel guarda lo que sea que pegues; si el
 * valor venía de un enlace markdown como `[https://x](https://x)` o
 * con comillas, el constructor de supabase-js lo rechaza.
 */
function sanitize(raw: string | undefined): string {
  if (!raw) return ""
  // Si vino con sintaxis markdown `[url](url)`, prefiere lo de adentro de ()
  const markdown = raw.match(/\((https?:\/\/[^\s)]+)\)/i)
  let v = markdown ? markdown[1] : raw
  // Quita comillas envolventes y espacios/caracteres invisibles
  v = v.trim().replace(/^["'`<\[]+|["'`>\]]+$/g, "").trim()
  return v
}

const supabaseUrl = sanitize(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const supabaseAnonKey = sanitize(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

// Validación temprana con mensajes que apuntan al problema real.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. " +
      "Configúralas en Vercel (Settings → Environment Variables) o en .env.local."
  )
}
if (!/^https?:\/\//i.test(supabaseUrl)) {
  throw new Error(
    `VITE_SUPABASE_URL inválida: "${supabaseUrl}". ` +
      "Debe empezar con https:// y NO llevar corchetes, comillas ni paréntesis."
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
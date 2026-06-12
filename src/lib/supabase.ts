import { createClient } from "@supabase/supabase-js"

const url  = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. " +
    "Copia .env.example a .env y reinicia `npm run dev`."
  )
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: { persistSession: false }
})

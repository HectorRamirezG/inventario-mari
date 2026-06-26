/**
 * Logger de búsquedas SIN resultado del cliente.
 *
 * Sirve para que Mari descubra qué productos buscan sus clientes pero
 * no tiene en catálogo. "Sombra glitter rosa buscada 7 veces este
 * mes → considera traer". Pivote inteligente de inventario basado en
 * demanda real, no en suposiciones.
 *
 * NO toca BD si la tabla `search_misses` no existe — tolerante. Mari
 * crea la tabla cuando quiera empezar a aprovechar:
 *
 *   CREATE TABLE IF NOT EXISTS search_misses (
 *     id BIGSERIAL PRIMARY KEY,
 *     query TEXT NOT NULL,
 *     customer_email TEXT,
 *     category_filter TEXT,
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX search_misses_query_idx ON search_misses(query);
 *
 * Anti-spam: máximo 1 log por query por sesión (localStorage). Si la
 * usuaria escribe "x", "xa", "xan", "xanax" recibimos un solo evento.
 */

import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

const SEEN_KEY = "mari:search-misses-seen:v1"
const MAX_SEEN = 50

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x: unknown): x is string => typeof x === "string"))
  } catch {
    return new Set()
  }
}

function saveSeen(set: Set<string>) {
  if (typeof window === "undefined") return
  try {
    const arr = Array.from(set).slice(-MAX_SEEN)
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr))
  } catch {
    /* noop */
  }
}

/**
 * Registra una búsqueda con 0 resultados. La normaliza (lowercase,
 * trim, sin espacios duplicados) para agrupar similares.
 *
 * @param query   El texto exacto que buscó el cliente.
 * @param ctx     Contexto opcional: email del cliente, categoría activa.
 */
export async function logSearchMiss(
  query: string,
  ctx?: { customerEmail?: string | null; categoryFilter?: string | null },
): Promise<void> {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ")
  if (normalized.length < 3) return // demasiado corto, ruido

  const seen = loadSeen()
  if (seen.has(normalized)) return
  seen.add(normalized)
  saveSeen(seen)

  try {
    const { error } = await supabase.from("search_misses").insert({
      query: normalized,
      customer_email: ctx?.customerEmail ?? null,
      category_filter: ctx?.categoryFilter ?? null,
    })
    if (error) {
      // Tabla no existe → silenciamos (config opcional)
      const code = String((error as any)?.code ?? "")
      if (code === "42P01" || /relation .* does not exist/i.test(error.message)) {
        return
      }
      debug.warn("[search-miss] insert:", error.message)
    }
  } catch (e: any) {
    debug.warn("[search-miss] fail:", e?.message)
  }
}

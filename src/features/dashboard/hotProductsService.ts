import { supabase } from "../../lib/supabase"
import { listVisitors } from "../users/usersService"

export interface HotProduct {
  id: string
  name: string
  image: string | null
  /** Cuántas SESIONES distintas vieron este producto >= minVisits veces. */
  visitorCount: number
  /** Total de vistas acumuladas (todas las sesiones). */
  totalViews: number
}

const PATH_RE = /^\/p\/([a-zA-Z0-9-]+)$/

/**
 * Detecta productos que múltiples visitors están viendo varias veces.
 * Útil para que Mari sepa qué publicar/promover.
 *
 * Lógica: por cada visitor, cuenta cuántas veces visitó cada producto en
 * los últimos N días. Si vio >= minVisits, ese visitor "cuenta" como
 * interesado en ese producto. Devolvemos productos con >= 1 visitor
 * interesado, ordenados por número de visitors interesados.
 */
export async function getHotProducts(
  days = 7,
  minVisits = 3,
): Promise<HotProduct[]> {
  const visitors = await listVisitors(200, false).catch(() => [])
  if (visitors.length === 0) return []

  const cutoff = Date.now() - days * 86_400_000
  const interestedSessions = new Map<string, Set<string>>()
  const totalViews = new Map<string, number>()

  for (const v of visitors) {
    const perProduct = new Map<string, number>()
    for (const p of v.pages_viewed ?? []) {
      const ts = new Date(p.at).getTime()
      if (!Number.isFinite(ts) || ts < cutoff) continue
      const m = p.path?.match(PATH_RE)
      if (!m) continue
      const pid = m[1]
      perProduct.set(pid, (perProduct.get(pid) ?? 0) + 1)
    }
    for (const [pid, c] of perProduct) {
      totalViews.set(pid, (totalViews.get(pid) ?? 0) + c)
      if (c >= minVisits) {
        if (!interestedSessions.has(pid)) interestedSessions.set(pid, new Set())
        interestedSessions.get(pid)!.add(v.session_id)
      }
    }
  }

  const ids = Array.from(interestedSessions.keys())
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("products")
    .select("id, name, image_url")
    .in("id", ids)
  if (error) return []

  return (data ?? [])
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      image: (p.image_url as string | null) ?? null,
      visitorCount: interestedSessions.get(p.id as string)?.size ?? 0,
      totalViews: totalViews.get(p.id as string) ?? 0,
    }))
    .sort((a, b) =>
      b.visitorCount === a.visitorCount
        ? b.totalViews - a.totalViews
        : b.visitorCount - a.visitorCount,
    )
}

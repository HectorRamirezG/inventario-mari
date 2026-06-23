/**
 * Servicios de geocoding usando OpenStreetMap + Nominatim.
 * 100% gratis, sin API key, sin billing. Rate limit ~1 req/segundo.
 *
 * Ideal para apps pequeñas/medianas. Si en el futuro tiene volumen
 * alto (>100 búsquedas/min), considerar migrar a Mapbox (50k/mes gratis)
 * o pagar Google Places.
 *
 * Respeta los términos de uso de Nominatim:
 *  - User-Agent identificable (Vercel lo deja pasar)
 *  - Rate limit interno: debounce + cache local
 *  - Idioma español preferente
 */

import { debug } from "./debug"

export interface PlaceSuggestion {
  /** Display name completo (ej. "Av. Juárez 123, Centro, CDMX") */
  label: string
  /** Texto corto (ej. "Av. Juárez 123") */
  short: string
  /** Detalles secundarios (colonia, ciudad, estado) */
  context: string
  lat: number
  lng: number
  /** ID interno de Nominatim (para deduplicar) */
  placeId: string
}

interface NominatimResult {
  place_id: number
  lat: string
  lon: string
  display_name: string
  name?: string
  type?: string
  address?: {
    road?: string
    house_number?: string
    suburb?: string
    neighbourhood?: string
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
    postcode?: string
  }
}

const NOMINATIM = "https://nominatim.openstreetmap.org"

// Cache simple en memoria por sesión (no en localStorage para no
// crecer infinitamente). Key = query normalizada.
const searchCache = new Map<string, PlaceSuggestion[]>()
const reverseCache = new Map<string, string>()

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

function buildContext(addr?: NominatimResult["address"]): string {
  if (!addr) return ""
  const parts: string[] = []
  if (addr.suburb || addr.neighbourhood) {
    parts.push(addr.suburb ?? addr.neighbourhood!)
  }
  const city = addr.city ?? addr.town ?? addr.village
  if (city) parts.push(city)
  if (addr.state && parts[parts.length - 1] !== addr.state) parts.push(addr.state)
  return parts.join(" · ")
}

function buildShort(r: NominatimResult): string {
  const addr = r.address
  if (!addr) return r.display_name.split(",")[0]
  const street = [addr.house_number, addr.road].filter(Boolean).join(" ")
  if (street) return street
  return r.display_name.split(",")[0]
}

/**
 * Busca sugerencias de direcciones. Solo dentro de México por default.
 * Devuelve hasta 6 resultados ordenados por relevancia.
 *
 *   const opts = await searchAddress("Av Juarez 123 cdmx")
 *   if (opts.length) onSelect(opts[0])
 */
export async function searchAddress(
  query: string,
  opts: { country?: string; limit?: number } = {},
): Promise<PlaceSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []

  const key = `${normalize(q)}::${opts.country ?? "mx"}::${opts.limit ?? 6}`
  if (searchCache.has(key)) return searchCache.get(key)!

  const params = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "1",
    limit: String(opts.limit ?? 6),
    countrycodes: opts.country ?? "mx",
    "accept-language": "es",
  })

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`${NOMINATIM}/search?${params.toString()}`, {
      headers: { "Accept": "application/json" },
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      debug.warn("[geocoding] search non-ok", res.status)
      return []
    }
    const data = (await res.json()) as NominatimResult[]
    const out: PlaceSuggestion[] = data.map((r) => ({
      label: r.display_name,
      short: buildShort(r),
      context: buildContext(r.address),
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      placeId: String(r.place_id),
    }))
    searchCache.set(key, out)
    return out
  } catch (e) {
    debug.warn("[geocoding] search failed", e)
    return []
  }
}

/**
 * Convierte coordenadas a dirección textual.
 *   const addr = await reverseGeocode(19.4326, -99.1332)
 *   // → "Av. Juárez 100, Centro, Ciudad de México"
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (reverseCache.has(key)) return reverseCache.get(key)!

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
    addressdetails: "1",
    "accept-language": "es",
    zoom: "18",
  })

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`${NOMINATIM}/reverse?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as NominatimResult
    if (!data) return null
    // Construimos algo legible: "calle número, colonia, ciudad"
    const addr = data.address ?? {}
    const street = [addr.house_number, addr.road].filter(Boolean).join(" ")
    const suburb = addr.suburb ?? addr.neighbourhood
    const city = addr.city ?? addr.town ?? addr.village
    const parts = [street || data.name, suburb, city].filter(Boolean)
    const result = parts.join(", ") || data.display_name
    reverseCache.set(key, result)
    return result
  } catch (e) {
    debug.warn("[geocoding] reverse failed", e)
    return null
  }
}

/**
 * Intenta extraer lat/lng de un link de Google Maps en cualquier formato:
 *  - https://www.google.com/maps?q=19.4326,-99.1332
 *  - https://www.google.com/maps/@19.4326,-99.1332,15z
 *  - https://www.google.com/maps/place/.../@19.4326,-99.1332,...
 *  - https://maps.app.goo.gl/xxx  → NO se puede sin un HEAD/redirect server-side
 *  - https://goo.gl/maps/xxx       → tampoco
 *
 * Devuelve null si no encuentra coordenadas.
 */
export function extractLatLng(url: string): { lat: number; lng: number } | null {
  if (!url) return null
  // Patrones de coordenadas: 19.4326,-99.1332 o @19.4326,-99.1332
  const patterns = [
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?q=lat,lng
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?ll=lat,lng
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // @lat,lng
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // !3d{lat}!4d{lng}
    /^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/, // texto plano "lat,lng"
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lng = parseFloat(m[2])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng }
      }
    }
  }
  return null
}

/**
 * Construye una URL de Google Maps simple a partir de lat/lng.
 * (Misma forma que la app generaba antes, mantenemos compatibilidad.)
 */
export function buildMapsUrl(lat: number, lng: number, label?: string): string {
  if (label) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${lat},${lng} (${label})`,
    )}`
  }
  return `https://www.google.com/maps?q=${lat},${lng}`
}

/**
 * URL de imagen estática del mapa con un pin marcado.
 * Usa el static map endpoint de Wikimedia (basado en OSM) — gratis y sin
 * API key. Lo elegimos porque `staticmap.openstreetmap.de` dejó de
 * resolver DNS en producción (ERR_NAME_NOT_RESOLVED).
 *
 * Formato wikimedia:
 *   https://maps.wikimedia.org/img/osm-intl,{zoom},{lat},{lng},{w}x{h}@2x.png
 *
 *   <img src={staticMapUrl(lat, lng)} />
 */
export function staticMapUrl(
  lat: number,
  lng: number,
  opts: { zoom?: number; width?: number; height?: number } = {},
): string {
  const z = Math.max(1, Math.min(18, opts.zoom ?? 16))
  // Wikimedia espera dimensiones razonables (1-1500). Acotamos por seguridad.
  const w = Math.max(50, Math.min(1500, opts.width ?? 400))
  const h = Math.max(50, Math.min(1500, opts.height ?? 200))
  // El @2x devuelve retina (mejor para PWA en mobile con DPR>1).
  return `https://maps.wikimedia.org/img/osm-intl,${z},${lat.toFixed(5)},${lng.toFixed(5)},${w}x${h}@2x.png`
}

import { useState, type ReactNode } from "react"
import { MapPin } from "lucide-react"

/**
 * Thumbnail de mapa con pin centrado en las coordenadas reales.
 *
 * Por qué un componente en vez de un `<img src={staticMapUrl(...)} />`:
 *  - El proveedor antiguo (`maps.wikimedia.org`) devolvía PNG con pin
 *    ya quemado y dimensiones libres. Migramos a tiles slippy de OSM
 *    (`tile.openstreetmap.org`), que son SIEMPRE 256×256 y no traen pin.
 *  - Usar UN solo tile se ve borroso al escalar a contenedores de
 *    600×140 (≈2.3× upscale) y el pin centrado quedaría mentiroso
 *    porque las coords NO están en el centro del tile, están en
 *    cualquier punto interno.
 *  - Solución: cuadrícula 2×2 de tiles → 512×512 (menos upscale, más
 *    nítido) + pin posicionado por % usando la fracción exacta dentro
 *    del bloque 2×2.
 *
 * Tolerante a:
 *  - Coords no finitas (no renderiza nada).
 *  - Tiles caídos (oculta el tile fallido sin romper el card).
 */
export interface MapThumbnailProps {
  lat: number
  lng: number
  /** Zoom 1–18. Default 16 (escala calle). */
  zoom?: number
  /** Tailwind classes para el contenedor. Default `w-full h-20`. */
  className?: string
  /** Texto alternativo para a11y. */
  alt?: string
  /** Si se pasa, envuelve el thumbnail en un <a> a esa URL. */
  href?: string
  /** Contenido extra absoluto encima (badges, etiquetas). */
  children?: ReactNode
}

interface TileGrid {
  tiles: { x: number; y: number; col: 0 | 1; row: 0 | 1 }[]
  /** Posición del pin dentro del bloque 2×2 en porcentaje (0–100). */
  pinLeftPct: number
  pinTopPct: number
  zoom: number
}

/** Calcula los 4 tiles que rodean la coordenada y la posición exacta del pin. */
function computeTileGrid(lat: number, lng: number, zoom: number): TileGrid | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const z = Math.max(1, Math.min(18, Math.round(zoom)))
  const n = Math.pow(2, z)
  const xf = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yf =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n

  // Decidimos qué 2×2 elegir según en qué mitad del tile cae el punto.
  // Buscamos que el punto quede lo más cerca posible del centro del bloque
  // para que el pin se vea bien centrado visualmente.
  const xi = Math.floor(xf)
  const yi = Math.floor(yf)
  const xFrac = xf - xi // 0–1 dentro del tile
  const yFrac = yf - yi

  // Si está en la mitad izquierda del tile, el bloque 2×2 incluye el tile a la izquierda.
  const xStart = xFrac < 0.5 ? xi - 1 : xi
  const yStart = yFrac < 0.5 ? yi - 1 : yi

  // Acotamos a tiles válidos. Si nos pasamos del rango, replicamos el
  // borde — pasa solo cerca de los polos / antimeridiano.
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v))

  const tiles: TileGrid["tiles"] = [
    { x: clamp(xStart),     y: clamp(yStart),     col: 0, row: 0 },
    { x: clamp(xStart + 1), y: clamp(yStart),     col: 1, row: 0 },
    { x: clamp(xStart),     y: clamp(yStart + 1), col: 0, row: 1 },
    { x: clamp(xStart + 1), y: clamp(yStart + 1), col: 1, row: 1 },
  ]

  // Posición del pin dentro del bloque 2×2 (rango 0–2 en unidades de tile).
  // El origen del bloque es (xStart, yStart). Convertimos a %.
  const pinLeftPct = ((xf - xStart) / 2) * 100
  const pinTopPct = ((yf - yStart) / 2) * 100

  return { tiles, pinLeftPct, pinTopPct, zoom: z }
}

function tileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

export function MapThumbnail({
  lat,
  lng,
  zoom = 16,
  className = "w-full h-20",
  alt,
  href,
  children,
}: MapThumbnailProps) {
  const grid = computeTileGrid(lat, lng, zoom)
  // Estado por tile: si algún tile específico falla lo ocultamos, no toda la imagen.
  const [failed, setFailed] = useState<Set<string>>(new Set())

  if (!grid) return null

  const content = (
    <div
      className={`relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 ${className}`}
      role="img"
      aria-label={alt ?? `Mapa centrado en ${lat.toFixed(4)}, ${lng.toFixed(4)}`}
    >
      {/* Bloque 2×2 absoluto que llena el contenedor */}
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        {grid.tiles.map((t) => {
          const key = `${grid.zoom}/${t.x}/${t.y}`
          if (failed.has(key)) return <div key={key} className="bg-slate-200/40 dark:bg-slate-700/40" />
          return (
            <img
              key={key}
              src={tileUrl(grid.zoom, t.x, t.y)}
              alt=""
              loading="lazy"
              draggable={false}
              className="w-full h-full object-cover select-none"
              onError={() =>
                setFailed((prev) => {
                  const next = new Set(prev)
                  next.add(key)
                  return next
                })
              }
            />
          )
        })}
      </div>

      {/* Pin centrado en las coords reales (no en el centro del bloque). */}
      <div
        className="absolute -translate-x-1/2 -translate-y-full pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]"
        style={{ left: `${grid.pinLeftPct}%`, top: `${grid.pinTopPct}%` }}
      >
        <MapPin
          size={22}
          strokeWidth={2.5}
          className="text-primary fill-white dark:fill-slate-900"
        />
      </div>

      {/* Slot para badges/etiquetas que vienen de cada caller. */}
      {children}
    </div>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block group">
        {content}
      </a>
    )
  }

  return content
}

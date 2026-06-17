import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  MapPin,
  Locate,
  Link2,
  ExternalLink,
  Loader2,
  X,
  Check,
  Search,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  buildMapsUrl,
  extractLatLng,
  reverseGeocode,
  searchAddress,
  staticMapUrl,
  type PlaceSuggestion,
} from "../../lib/geocoding"
import { useDebouncedValue } from "../../lib/useDebouncedValue"
import { debug } from "../../lib/debug"

interface Props {
  /** Texto libre (calle + número + colonia). */
  address: string
  onAddressChange: (v: string) => void
  /** URL de Google Maps (https://maps.google.com/?q=...). */
  locationUrl: string
  onLocationUrlChange: (v: string) => void
  className?: string
}

/**
 * Input "inteligente" para ubicación del cliente. Pro look:
 *  1. Autocomplete de direcciones reales mientras escribes
 *     (OpenStreetMap + Nominatim, gratis, sin API key).
 *  2. Botón "Mi ubicación" → captura GPS, hace reverse geocode y
 *     autorellena la dirección textual.
 *  3. Pegar link de Google Maps → extrae lat/lng automáticamente.
 *  4. Preview estático del mapa con pin marcado (imagen, sin libs).
 *  5. Abrir en Google Maps en pestaña nueva.
 *
 * Mantiene compatibilidad: sigue exponiendo `address` y `locationUrl`
 * para no romper a los que ya lo usan (ClientShop, SalesPage,
 * UserProfileDrawer).
 */
export default function SmartLocationInput({
  address,
  onAddressChange,
  locationUrl,
  onLocationUrlChange,
  className = "",
}: Props) {
  const [busy, setBusy] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteValue, setPasteValue] = useState("")

  // Autocomplete
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const debouncedAddress = useDebouncedValue(address, 350)
  const skipNextSearchRef = useRef(false)

  // Lat/Lng derivado del URL para el mini preview
  const coords = useMemo(() => extractLatLng(locationUrl), [locationUrl])

  // Buscar sugerencias cuando el usuario escribe (debounced)
  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false
      return
    }
    const q = debouncedAddress.trim()
    if (q.length < 4 || !focused) {
      setSuggestions([])
      return
    }
    let alive = true
    setLoadingSuggest(true)
    searchAddress(q, { limit: 6 })
      .then((res) => {
        if (!alive) return
        setSuggestions(res)
        setActiveIdx(0)
      })
      .catch((e) => debug.warn("[SmartLocationInput] search", e))
      .finally(() => alive && setLoadingSuggest(false))
    return () => {
      alive = false
    }
  }, [debouncedAddress, focused])

  // Click fuera cierra sugerencias
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focused) return
    const onDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setFocused(false)
      }
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [focused])

  // Seleccionar una sugerencia
  function pickSuggestion(s: PlaceSuggestion) {
    skipNextSearchRef.current = true
    const niceAddress = s.short && s.context ? `${s.short}, ${s.context}` : s.label
    onAddressChange(niceAddress)
    onLocationUrlChange(buildMapsUrl(s.lat, s.lng, s.short))
    setSuggestions([])
    setFocused(false)
    toast.success("📍 Ubicación seleccionada")
  }

  const captureGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Tu navegador no soporta GPS")
      return
    }
    setBusy(true)
    const tid = toast.loading("Obteniendo ubicación...")
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const url = buildMapsUrl(lat, lng)
        onLocationUrlChange(url)
        // Reverse geocode para autorellenar dirección si está vacía
        if (!address.trim()) {
          try {
            const addr = await reverseGeocode(lat, lng)
            if (addr) {
              skipNextSearchRef.current = true
              onAddressChange(addr)
            }
          } catch {}
        }
        toast.success("📍 Pin guardado", { id: tid })
        setBusy(false)
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Permiso denegado"
            : "No se pudo obtener ubicación"
        toast.error(msg, { id: tid })
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [address, onAddressChange, onLocationUrlChange])

  /** Acepta links de Google Maps; extrae lat/lng cuando es posible. */
  const validateAndSavePaste = useCallback(() => {
    const v = pasteValue.trim()
    if (!v) return
    const isMapsUrl =
      /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
        v,
      )
    if (!isMapsUrl) {
      toast.error("Pega un link de Google Maps")
      return
    }
    onLocationUrlChange(v)
    setPasteValue("")
    setShowPaste(false)
    const ll = extractLatLng(v)
    if (ll) {
      toast.success("📍 Pin guardado con coordenadas")
    } else {
      toast.success("📍 Link guardado")
    }
  }, [pasteValue, onLocationUrlChange])

  const clearPin = useCallback(() => {
    onLocationUrlChange("")
    toast.success("Pin removido")
  }, [onLocationUrlChange])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const s = suggestions[activeIdx]
      if (s) pickSuggestion(s)
    } else if (e.key === "Escape") {
      setFocused(false)
    }
  }

  return (
    <div ref={containerRef} className={`flex flex-col gap-2 relative ${className}`}>
      {/* Input dirección manual con autocomplete */}
      <div className="relative">
        <MapPin
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder="Empieza a escribir tu dirección..."
          className="w-full h-11 pl-10 pr-10 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-[12px] font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 dark:text-slate-100 placeholder:text-slate-400"
          autoComplete="off"
          spellCheck={false}
        />
        {loadingSuggest && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-primary animate-spin"
          />
        )}
      </div>

      {/* Dropdown de sugerencias */}
      {focused && suggestions.length > 0 && (
        <div className="absolute top-12 left-0 right-0 z-30 mt-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.25)] overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => pickSuggestion(s)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                i === activeIdx
                  ? "bg-primary/10 dark:bg-primary/15"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin
                  size={12}
                  className={
                    i === activeIdx
                      ? "text-primary"
                      : "text-slate-400 dark:text-slate-500"
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 truncate">
                  {s.short}
                </p>
                {s.context && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {s.context}
                  </p>
                )}
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Search size={9} /> {suggestions.length} resultados
            </span>
            <span className="italic normal-case font-medium">
              OpenStreetMap
            </span>
          </div>
        </div>
      )}

      {/* Pin actual + botones de acción */}
      <div className="flex flex-wrap items-center gap-2">
        {locationUrl ? (
          <>
            <a
              href={locationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest press"
            >
              <Check size={11} /> Pin guardado <ExternalLink size={10} />
            </a>
            <button
              type="button"
              onClick={clearPin}
              className="w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 flex items-center justify-center press"
              title="Quitar pin"
              aria-label="Quitar pin"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={captureGps}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest disabled:opacity-50 press"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Locate size={11} />}
              Mi ubicación
            </button>
            <button
              type="button"
              onClick={() => setShowPaste((s) => !s)}
              className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest press"
            >
              <Link2 size={11} /> Pegar link
            </button>
          </>
        )}
      </div>

      {/* Preview del mapa cuando hay coordenadas */}
      {coords && (
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
          <img
            src={staticMapUrl(coords.lat, coords.lng, { width: 600, height: 200, zoom: 16 })}
            alt={`Ubicación seleccionada en ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`}
            loading="lazy"
            className="w-full h-32 object-cover"
            onError={(e) => {
              // Si el servicio público falla, ocultamos sin romper la UI
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
          <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur text-[9px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-1 shadow-sm">
            <MapPin size={10} className="text-primary" />
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </div>
        </div>
      )}

      {/* Caja para pegar link de Maps */}
      {showPaste && (
        <div className="flex gap-2">
          <input
            type="text"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && validateAndSavePaste()}
            placeholder="https://maps.app.goo.gl/..."
            className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 dark:text-slate-100"
            autoFocus
          />
          <button
            type="button"
            onClick={validateAndSavePaste}
            className="h-10 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest press-hard"
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  )
}

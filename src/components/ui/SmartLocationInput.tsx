import { useState, useCallback } from "react"
import { MapPin, Locate, Link2, ExternalLink, Loader2, X, Check } from "lucide-react"
import toast from "react-hot-toast"

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
 * Input "inteligente" para ubicación del cliente. Combina:
 *   1. Campo de dirección manual (lo que más se usa: "Av. Juárez 123, Centro")
 *   2. Botón "Pegar link de Maps"  → valida y guarda
 *   3. Botón "Mi ubicación"         → captura GPS y arma URL de Maps
 *   4. Botón "Abrir en Maps"        → opcional, abre la URL guardada
 *
 * No embebe mapa (eso requiere API key con costo); en su lugar abre
 * Google Maps en una pestaña nueva cuando el usuario quiere verificar.
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

  const captureGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Tu navegador no soporta GPS")
      return
    }
    setBusy(true)
    const tid = toast.loading("Obteniendo ubicación...")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6)
        const lng = pos.coords.longitude.toFixed(6)
        const url = `https://www.google.com/maps?q=${lat},${lng}`
        onLocationUrlChange(url)
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [onLocationUrlChange])

  /** Acepta links de Google Maps (incluye los acortados maps.app.goo.gl). */
  const validateAndSavePaste = useCallback(() => {
    const v = pasteValue.trim()
    if (!v) return
    const isMapsUrl =
      /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
        v
      )
    if (!isMapsUrl) {
      toast.error("Pega un link de Google Maps")
      return
    }
    onLocationUrlChange(v)
    setPasteValue("")
    setShowPaste(false)
    toast.success("📍 Link guardado")
  }, [pasteValue, onLocationUrlChange])

  const clearPin = useCallback(() => {
    onLocationUrlChange("")
    toast.success("Pin removido")
  }, [onLocationUrlChange])

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Input dirección manual */}
      <div className="relative">
        <MapPin
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Dirección (calle, número, colonia)"
          className="w-full h-11 pl-10 pr-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-[12px] font-bold outline-none focus:ring-2 focus:ring-primary/20 dark:text-slate-100"
        />
      </div>

      {/* Pin actual + botones de acción */}
      <div className="flex flex-wrap items-center gap-2">
        {locationUrl ? (
          <>
            <a
              href={locationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest"
            >
              <Check size={11} /> Pin guardado <ExternalLink size={10} />
            </a>
            <button
              type="button"
              onClick={clearPin}
              className="w-9 h-9 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-600 flex items-center justify-center"
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
              className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Locate size={11} />}
              Mi ubicación
            </button>
            <button
              type="button"
              onClick={() => setShowPaste((s) => !s)}
              className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest"
            >
              <Link2 size={11} /> Pegar link
            </button>
            {address.trim() && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  address.trim()
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest"
                title="Buscar la dirección escrita en Google Maps"
              >
                <ExternalLink size={11} /> Buscar
              </a>
            )}
          </>
        )}
      </div>

      {/* Caja para pegar link de Maps */}
      {showPaste && (
        <div className="flex gap-2">
          <input
            type="text"
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && validateAndSavePaste()}
            placeholder="https://maps.app.goo.gl/..."
            className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20 dark:text-slate-100"
            autoFocus
          />
          <button
            type="button"
            onClick={validateAndSavePaste}
            className="h-10 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest"
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  )
}

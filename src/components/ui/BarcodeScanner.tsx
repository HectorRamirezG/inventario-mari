import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  ScanLine,
  CameraOff,
  Loader2,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Check,
} from "lucide-react"
import { createPortal } from "react-dom"

/**
 * Dynamic import del SDK pesado (~120kb gz). Sólo se descarga la
 * primera vez que el admin/cliente abre el scanner. No bloquea el
 * bundle inicial.
 */
type Html5QrcodeType = import("html5-qrcode").Html5Qrcode
async function loadHtml5Qrcode(): Promise<{
  new (id: string, cfg?: any): Html5QrcodeType
}> {
  const mod = await import("html5-qrcode")
  return mod.Html5Qrcode as any
}

interface Props {
  open: boolean
  onClose: () => void
  /** Llamado cada vez que se lee un código. Devuelve `true` para cerrar el scanner. */
  onScan: (text: string) => boolean | void
  /** Título en el header. Default: "Escanear código". */
  title?: string
  /** Texto pequeño abajo del marco. Default: "Apunta al código de barras o QR del producto". */
  hint?: string
  /** Permitir input manual del código (botón "Teclado"). Default: true. */
  allowManualInput?: boolean
  /** Placeholder del input manual. */
  manualPlaceholder?: string
}

/**
 * Escáner de códigos de barras / QR usando la cámara del dispositivo.
 * Cubre toda la pantalla mientras está abierto y se autodetiene al cerrar.
 *
 * - En móviles abre la cámara trasera por default.
 * - Si el navegador no soporta MediaDevices, muestra mensaje claro.
 * - El callback `onScan` puede devolver `true` para auto-cerrar tras leer.
 */
export default function BarcodeScanner({
  open,
  onClose,
  onScan,
  title = "Escanear código",
  hint = "Apunta al código de barras o QR del producto",
  allowManualInput = true,
  manualPlaceholder = "Pega o escribe el código…",
}: Props) {
  const containerId = "barcode-scanner-region"
  const scannerRef = useRef<Html5QrcodeType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [manualValue, setManualValue] = useState("")

  useEffect(() => {
    if (!open) return
    setError(null)
    setLastScan(null)
    setInitializing(true)
    setTorchOn(false)
    setTorchSupported(false)
    setManualMode(false)
    setManualValue("")

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Tu navegador no soporta acceso a la cámara")
      setInitializing(false)
      return
    }

    let cancelled = false
    let scanner: Html5QrcodeType | null = null

    // Pequeño delay para asegurar que el DOM ya tiene el contenedor
    const t = setTimeout(async () => {
      try {
        const Html5Qrcode = await loadHtml5Qrcode()
        if (cancelled) return
        scanner = new Html5Qrcode(containerId, { verbose: false })
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: "environment" },
          {
            // qrbox cuadrado funciona para QR y barcodes (la cámara
            // lee ambos). Antes era 250×160 para barcodes pero los QR
            // no llenaban el cuadro y a veces no decodificaban.
            fps: 12,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1,
          },
          (decoded) => {
            if (cancelled) return
            setLastScan(decoded)
            // Haptic + tono al escanear OK
            try {
              if ("vibrate" in navigator) navigator.vibrate(35)
            } catch {}
            const shouldClose = onScan(decoded)
            if (shouldClose) {
              // Pequeño delay para que el usuario vea el "leído" antes del cierre
              setTimeout(() => onClose(), 250)
            }
          },
          () => { /* no-op: errores de lectura por frame son normales */ }
        )
        if (cancelled) return
        setInitializing(false)
        // Detectar soporte de torch del MediaStreamTrack actual.
        // Algunos chips lo soportan vía constraints `torch: true`.
        try {
          const videoEl = document.querySelector<HTMLVideoElement>(
            `#${containerId} video`,
          )
          const stream = videoEl?.srcObject as MediaStream | null
          const track = stream?.getVideoTracks?.()[0]
          const caps = track?.getCapabilities?.() as
            | { torch?: boolean }
            | undefined
          if (caps?.torch) setTorchSupported(true)
        } catch {
          /* ignorar */
        }
      } catch (e: any) {
        if (cancelled) return
        const msg =
          e?.name === "NotAllowedError"
            ? "Permiso de cámara denegado"
            : e?.name === "NotFoundError"
            ? "No encontramos ninguna cámara"
            : e?.message ?? "No se pudo iniciar la cámara"
        setError(msg)
        setInitializing(false)
      }
    }, 100)

    return () => {
      cancelled = true
      clearTimeout(t)
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch(() => {/* ignorar */})
          .finally(() => { scannerRef.current = null })
      }
    }
  }, [open, onClose, onScan])

  if (typeof document === "undefined" || !open) return null

  /** Activa/desactiva el flash de la cámara si el track lo soporta. */
  async function toggleTorch() {
    try {
      const videoEl = document.querySelector<HTMLVideoElement>(
        `#${containerId} video`,
      )
      const stream = videoEl?.srcObject as MediaStream | null
      const track = stream?.getVideoTracks?.()[0]
      if (!track) return
      const next = !torchOn
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch {
      /* no soporta torch en este device, ignorar */
    }
  }

  /** Submit del input manual: lo procesamos como si fuera un escaneo real. */
  function submitManual(e: React.FormEvent) {
    e.preventDefault()
    const v = manualValue.trim()
    if (!v) return
    const shouldClose = onScan(v)
    if (shouldClose !== false) {
      setManualValue("")
      onClose()
    }
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black flex flex-col"
      >
        {/* Cámara */}
        <div className="relative flex-1 overflow-hidden">
          <div id={containerId} className="absolute inset-0" />

          {/* Marco visual de escaneo — solo cuando NO está en modo manual */}
          {!manualMode && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-[240px] h-[240px]">
                {/* Esquinas */}
                <span className="absolute -top-1 -left-1 w-9 h-9 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                <span className="absolute -top-1 -right-1 w-9 h-9 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                <span className="absolute -bottom-1 -left-1 w-9 h-9 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                <span className="absolute -bottom-1 -right-1 w-9 h-9 border-b-4 border-r-4 border-primary rounded-br-2xl" />

                {/* Línea barriendo */}
                <motion.div
                  animate={{ y: [0, 240, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute left-2 right-2 h-0.5 bg-primary shadow-[0_0_12px_#e6007e]"
                />
              </div>
            </div>
          )}

          {/* Loading state mientras se inicializa la cámara */}
          {initializing && !error && !manualMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/40">
              <Loader2 size={32} className="animate-spin text-primary mb-3" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                Iniciando cámara…
              </p>
            </div>
          )}

          {/* Estado de error */}
          {error && !manualMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-6">
              <CameraOff size={48} className="mb-3 text-rose-400" />
              <p className="text-sm font-black uppercase tracking-widest mb-2">
                {error}
              </p>
              <p className="text-[10px] text-slate-400 mb-4">
                Verifica los permisos de cámara o usa entrada manual.
              </p>
              {allowManualInput && (
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="h-10 px-4 rounded-xl bg-white/10 backdrop-blur-md text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2"
                >
                  <Keyboard size={13} /> Ingresar código manualmente
                </button>
              )}
            </div>
          )}

          {/* Modo manual: input grande centrado */}
          {manualMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-6 bg-slate-950/90 backdrop-blur-sm">
              <Keyboard size={32} className="mb-3 text-primary" />
              <p className="text-sm font-black uppercase tracking-widest mb-4">
                Ingresar manualmente
              </p>
              <form
                onSubmit={submitManual}
                className="w-full max-w-xs space-y-2"
              >
                <input
                  type="text"
                  autoFocus
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder={manualPlaceholder}
                  className="w-full h-12 px-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder:text-slate-500 text-sm font-bold tabular-nums focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!manualValue.trim()}
                  className="w-full h-12 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check size={14} /> Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="w-full h-9 rounded-2xl text-slate-400 text-[10px] font-bold flex items-center justify-center gap-1.5"
                >
                  ← Volver a la cámara
                </button>
              </form>
            </div>
          )}

          {/* Confirmación visual del último escaneo */}
          {lastScan && !manualMode && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest shadow-2xl flex items-center gap-1.5 max-w-[80%]"
            >
              <Check size={14} className="shrink-0" />
              <span className="truncate">{lastScan}</span>
            </motion.div>
          )}
        </div>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pt-safe bg-gradient-to-b from-black/70 to-transparent z-10">
          <div className="flex items-center gap-2 text-white">
            <ScanLine size={18} className="text-primary" />
            <span className="text-[11px] font-black uppercase tracking-widest">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Torch toggle (solo si el device lo soporta) */}
            {torchSupported && !manualMode && !error && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? "Apagar linterna" : "Encender linterna"}
                title={torchOn ? "Apagar linterna" : "Encender linterna"}
                className={`w-10 h-10 rounded-xl backdrop-blur-md flex items-center justify-center active:scale-90 transition-all ${
                  torchOn
                    ? "bg-amber-400 text-amber-900"
                    : "bg-white/10 text-white"
                }`}
              >
                {torchOn ? (
                  <Flashlight size={16} />
                ) : (
                  <FlashlightOff size={16} />
                )}
              </button>
            )}
            {/* Manual input toggle */}
            {allowManualInput && !manualMode && !error && (
              <button
                type="button"
                onClick={() => setManualMode(true)}
                aria-label="Ingresar manualmente"
                title="Ingresar manualmente"
                className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center active:scale-90 transition-transform"
              >
                <Keyboard size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Footer / tip */}
        <div className="bg-black/80 backdrop-blur-md text-center py-4 pb-safe z-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-4">
            {manualMode
              ? "Pega el código del ticket o comanda"
              : initializing
              ? "Esperando cámara…"
              : hint}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

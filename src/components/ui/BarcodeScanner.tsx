import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ScanLine, CameraOff } from "lucide-react"
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
}

/**
 * Escáner de códigos de barras / QR usando la cámara del dispositivo.
 * Cubre toda la pantalla mientras está abierto y se autodetiene al cerrar.
 *
 * - En móviles abre la cámara trasera por default.
 * - Si el navegador no soporta MediaDevices, muestra mensaje claro.
 * - El callback `onScan` puede devolver `true` para auto-cerrar tras leer.
 */
export default function BarcodeScanner({ open, onClose, onScan }: Props) {
  const containerId = "barcode-scanner-region"
  const scannerRef = useRef<Html5QrcodeType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setLastScan(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Tu navegador no soporta acceso a la cámara")
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
            fps: 12,
            qrbox: { width: 250, height: 160 },
            aspectRatio: 1.333,
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
      } catch (e: any) {
        if (cancelled) return
        const msg =
          e?.name === "NotAllowedError"
            ? "Permiso de cámara denegado"
            : e?.message ?? "No se pudo iniciar la cámara"
        setError(msg)
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

          {/* Marco visual de escaneo */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative w-[250px] h-[160px]">
              {/* Esquinas */}
              <span className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
              <span className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
              <span className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
              <span className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-2xl" />

              {/* Línea barriendo */}
              <motion.div
                animate={{ y: [0, 160, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute left-2 right-2 h-0.5 bg-primary shadow-[0_0_12px_#e6007e]"
              />
            </div>
          </div>

          {/* Estados */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-6">
              <CameraOff size={48} className="mb-3 text-rose-400" />
              <p className="text-sm font-black uppercase tracking-widest mb-2">
                {error}
              </p>
              <p className="text-[10px] text-slate-400">
                Permite el acceso a la cámara y vuelve a intentar.
              </p>
            </div>
          )}

          {lastScan && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest shadow-2xl"
            >
              ✓ {lastScan}
            </motion.div>
          )}
        </div>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pt-safe bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-2 text-white">
            <ScanLine size={18} className="text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Escanear código
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md text-white flex items-center justify-center active:scale-90 transition-transform"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Footer / tip */}
        <div className="bg-black/80 backdrop-blur-md text-center py-4 pb-safe">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Apunta al código de barras o QR del producto
          </p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

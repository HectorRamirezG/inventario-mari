import { useEffect, useRef } from "react"

/** Mantiene la pantalla encendida mientras el componente esté montado.
 *  Usa Screen Wake Lock API (Chromium/Safari 16+). Failsafe silencioso. */
export function useWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<any>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function request() {
      try {
        const wl = (navigator as any).wakeLock
        if (!wl?.request) return
        sentinelRef.current = await wl.request("screen")
      } catch {
        /* noop */
      }
    }
    request()
    const onVis = () => {
      if (document.visibilityState === "visible" && !sentinelRef.current && !cancelled) {
        request()
      }
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVis)
      sentinelRef.current?.release?.().catch(() => {})
      sentinelRef.current = null
    }
  }, [enabled])
}

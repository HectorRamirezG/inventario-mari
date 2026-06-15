/**
 * Mini librería de feedback sonoro/háptico para acciones críticas
 * (venta cerrada, error, scan exitoso). Usa Web Audio + Vibration API,
 * sin assets externos. Respeta el "silent mode" del sistema.
 */

let audioCtx: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (audioCtx) return audioCtx
  try {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext
    audioCtx = new AC()
    return audioCtx
  } catch {
    return null
  }
}

function beep(frequency: number, durationMs = 80, volume = 0.04) {
  const c = ctx()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = "sine"
    osc.frequency.value = frequency
    gain.gain.value = volume
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start()
    // Fade-out suave para evitar "click"
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000)
    osc.stop(c.currentTime + durationMs / 1000)
  } catch {
    /* silencio: feedback es best-effort */
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* ignorar */
    }
  }
}

export const sound = {
  /** Tap suave para botones. */
  tap: () => {
    beep(220, 35)
    vibrate(8)
  },
  /** Lectura exitosa de código de barras. */
  scan: () => {
    beep(880, 60)
    vibrate(20)
  },
  /** Venta cerrada con éxito. */
  success: () => {
    beep(523.25, 90) // Do
    setTimeout(() => beep(659.25, 90), 80) // Mi
    setTimeout(() => beep(783.99, 120), 160) // Sol
    vibrate([20, 30, 20])
  },
  /** Error o validación fallida. */
  error: () => {
    beep(196, 120, 0.06)
    setTimeout(() => beep(146.83, 160, 0.06), 90)
    vibrate([40, 50, 40])
  },
  /** Notificación entrante (nuevo apartado, mensaje, etc.). */
  notify: () => {
    beep(880, 60, 0.05)
    setTimeout(() => beep(1108.73, 80, 0.05), 70)
    vibrate([15, 25, 15])
  },
  /**
   * Atajo genérico: `sound.play("notify")`. Permite que código externo
   * pase un string sin importar el método concreto. Si el nombre no
   * existe, hace fallback a `tap`.
   */
  play: (name: "tap" | "scan" | "success" | "error" | "notify") => {
    const fn = (sound as any)[name]
    if (typeof fn === "function") fn()
    else (sound as any).tap()
  },
}

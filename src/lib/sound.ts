/**
 * Mini librería de feedback sonoro/háptico para acciones críticas
 * (venta cerrada, error, scan exitoso). Usa Web Audio + Vibration API,
 * sin assets externos. Respeta el "silent mode" del sistema.
 *
 * Respeta las preferencias del usuario (userPrefs):
 *  - prefs.sounds = false → no reproduce nada
 *  - prefs.haptics = false → no vibra
 */

import { getPrefs } from "./userPrefs"

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

function beep(frequency: number, durationMs = 80, volume = 0.04, type: OscillatorType = "sine") {
  if (!getPrefs().sounds) return
  const c = ctx()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
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

/** Campana premium con armónico — ideal para venta cerrada / abono cobrado. */
function bell(baseHz: number, durationMs = 600, volume = 0.06) {
  if (!getPrefs().sounds) return
  const c = ctx()
  if (!c) return
  try {
    // Fundamental + armónico (2.76x) = sonido de campana tibetana
    const fundamental = c.createOscillator()
    const harmonic = c.createOscillator()
    const gain = c.createGain()
    fundamental.type = "sine"
    harmonic.type = "sine"
    fundamental.frequency.value = baseHz
    harmonic.frequency.value = baseHz * 2.76
    gain.gain.value = volume
    fundamental.connect(gain)
    harmonic.connect(gain)
    gain.connect(c.destination)
    fundamental.start()
    harmonic.start()
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000)
    fundamental.stop(c.currentTime + durationMs / 1000)
    harmonic.stop(c.currentTime + durationMs / 1000)
  } catch {
    /* silencio */
  }
}

function vibrate(pattern: number | number[]) {
  if (!getPrefs().haptics) return
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
  /** Venta cerrada con éxito — campana premium tipo "cha-ching". */
  success: () => {
    // Dos campanas en rápida sucesión = registradora moderna
    bell(987.77, 350, 0.05) // B5
    setTimeout(() => bell(1318.51, 500, 0.05), 90) // E6
    vibrate([15, 30, 15])
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
  /** Variante: cobro/comprobante → campana corta y dulce. */
  notifyMoney: () => {
    bell(1318.51, 280, 0.05)
    vibrate([15, 20, 15])
  },
  /** Variante: soporte / alerta → tono más serio (descendente). */
  notifyAlert: () => {
    beep(660, 90, 0.05)
    setTimeout(() => beep(523.25, 110, 0.05), 80)
    vibrate([20, 30, 20])
  },
  /** Variante: deseo/reseña → toque corto agradable. */
  notifySoft: () => {
    beep(1046.5, 50, 0.04)
    setTimeout(() => beep(1318.51, 60, 0.04), 60)
    vibrate(12)
  },
  /** Variante: entrega/repartidor → dos pulsos rítmicos. */
  notifyDelivery: () => {
    beep(740, 70, 0.05)
    setTimeout(() => beep(880, 90, 0.05), 90)
    vibrate([10, 20, 10, 20, 10])
  },
  /** Variante: stock crítico → urgente, dos tonos bajos. */
  notifyStock: () => {
    beep(440, 100, 0.06)
    setTimeout(() => beep(370, 130, 0.06), 110)
    vibrate([30, 30, 30])
  },
  /** Variante: meta alcanzada → fanfare corto, ascendente. */
  notifyMilestone: () => {
    bell(659.25, 260, 0.05) // E5
    setTimeout(() => bell(987.77, 280, 0.05), 80) // B5
    setTimeout(() => bell(1318.51, 320, 0.05), 170) // E6
    vibrate([20, 30, 20, 30, 20])
  },
  /**
   * Atajo genérico: `sound.play("notify")`. Permite que código externo
   * pase un string sin importar el método concreto. Si el nombre no
   * existe, hace fallback a `tap`.
   */
  play: (name: "tap" | "scan" | "success" | "error" | "notify" | "notifyMoney" | "notifyAlert" | "notifySoft" | "notifyDelivery" | "notifyStock" | "notifyMilestone") => {
    const fn = (sound as any)[name]
    if (typeof fn === "function") fn()
    else (sound as any).tap()
  },
}

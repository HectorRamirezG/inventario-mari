/**
 * Mini librería de feedback sonoro/háptico para acciones críticas
 * (venta cerrada, error, scan exitoso). Usa Web Audio + Vibration API,
 * sin assets externos. Respeta el "silent mode" del sistema.
 *
 * Respeta las preferencias del usuario (userPrefs):
 *  - prefs.sounds = false → no reproduce nada
 *  - prefs.haptics = false → no vibra
 *  - prefs.volume = 0..100 escala el volumen base
 *  - prefs.soundPack cambia la "personalidad" de los tonos
 *  - prefs.quietHoursEnabled + rango → silencia sonido y vibración
 *    durante el horario configurado (las notifs siguen llegando, solo
 *    no molestan al usuario).
 */

import { getPrefs, isQuietNow, type SoundPack } from "./userPrefs"

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

/* ─────────── Modificadores por pack ───────────
 * Cada pack ajusta:
 *  - waveType: forma de la onda (sine suave, square retro, triangle dulce)
 *  - pitchShift: semitonos arriba/abajo del default
 *  - volumeBoost: multiplicador del volumen base (vintage es más fuerte)
 *  - vibratoExtra: añade swing en notas largas
 */
interface PackProfile {
  wave: OscillatorType
  pitch: number
  boost: number
}

const PACK_PROFILES: Record<SoundPack, PackProfile> = {
  default: { wave: "sine", pitch: 1.0, boost: 1.0 },
  vintage: { wave: "triangle", pitch: 0.84, boost: 1.3 }, // cha-ching grave de caja vieja
  arcade: { wave: "square", pitch: 1.12, boost: 1.0 }, // 8-bit más alto
  premium: { wave: "sine", pitch: 1.06, boost: 0.85 }, // chimes finos
}

/**
 * Calcula el volumen final aplicando:
 *   - escala 0-1 del slider del usuario (prefs.volume / 100)
 *   - boost del pack activo
 * Si el resultado es 0 (slider en 0%), short-circuit a 0 (no reproduce).
 */
function effectiveVolume(base: number): number {
  const p = getPrefs()
  const slider = (p.volume ?? 70) / 100
  const pack = PACK_PROFILES[p.soundPack] ?? PACK_PROFILES.default
  return base * slider * pack.boost
}

/**
 * Aplica pitch shift del pack a una frecuencia base (en Hz).
 * pitchShift se multiplica directamente: 1.0 = sin cambio.
 */
function effectiveFreq(baseHz: number): number {
  const p = getPrefs()
  const pack = PACK_PROFILES[p.soundPack] ?? PACK_PROFILES.default
  return baseHz * pack.pitch
}

/**
 * ¿Podemos sonar ahora? Compone:
 *   - prefs.sounds OFF → no
 *   - quietHoursNow → no (no molesta de madrugada)
 *   - volumen 0 → no
 */
function canPlay(): boolean {
  const p = getPrefs()
  if (!p.sounds) return false
  if (p.volume <= 0) return false
  if (isQuietNow(p)) return false
  return true
}

/**
 * ¿Podemos vibrar ahora? Compone:
 *   - prefs.haptics OFF → no
 *   - quietHoursNow → no
 */
function canVibrate(): boolean {
  const p = getPrefs()
  if (!p.haptics) return false
  if (isQuietNow(p)) return false
  return true
}

function beep(
  frequency: number,
  durationMs = 80,
  volume = 0.04,
  type?: OscillatorType,
) {
  if (!canPlay()) return
  const c = ctx()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const gain = c.createGain()
    const p = getPrefs()
    const pack = PACK_PROFILES[p.soundPack] ?? PACK_PROFILES.default
    osc.type = type ?? pack.wave
    osc.frequency.value = effectiveFreq(frequency)
    gain.gain.value = effectiveVolume(volume)
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
  if (!canPlay()) return
  const c = ctx()
  if (!c) return
  try {
    // Fundamental + armónico (2.76x) = sonido de campana tibetana
    const fundamental = c.createOscillator()
    const harmonic = c.createOscillator()
    const gain = c.createGain()
    fundamental.type = "sine"
    harmonic.type = "sine"
    fundamental.frequency.value = effectiveFreq(baseHz)
    harmonic.frequency.value = effectiveFreq(baseHz) * 2.76
    gain.gain.value = effectiveVolume(volume)
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
  if (!canVibrate()) return
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

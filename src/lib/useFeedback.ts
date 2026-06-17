/**
 * Sistema de feedback háptico + audio.
 * Patrones inspirados en iOS:
 *  - tap       : tono corto + vibración leve (clicks)
 *  - success   : 2 tonos ascendentes + doble vibración (cobros / OK)
 *  - error     : tono descendente + vibración larga (fallos)
 *  - strong    : vibración fuerte (escaneo OK, swipe destructivo)
 *  - feedback  : alias retrocompatible de tap()
 *
 * Respeta las preferencias del usuario en `userPrefs`:
 *  - prefs.sounds = false → no reproduce tonos
 *  - prefs.haptics = false → no vibra
 */

import { getPrefs } from "./userPrefs"

let sharedCtx: AudioContext | null = null
function getCtx(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null
    if (!sharedCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return null
      sharedCtx = new Ctor()
    }
    return sharedCtx
  } catch {
    return null
  }
}

function beep(freq: number, durMs: number, vol = 0.04, type: OscillatorType = "sine", delayMs = 0) {
  // Respeta preferencia del usuario
  if (!getPrefs().sounds) return
  const ctx = getCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.value = vol
    osc.connect(gain)
    gain.connect(ctx.destination)
    const start = ctx.currentTime + delayMs / 1000
    osc.start(start)
    // fade out para evitar click
    gain.gain.setValueAtTime(vol, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durMs / 1000)
    osc.stop(start + durMs / 1000)
  } catch {}
}

function buzz(pattern: number | number[]) {
  // Respeta preferencia del usuario
  if (!getPrefs().haptics) return
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(pattern) } catch {}
  }
}

export function useFeedback() {
  const tap = () => {
    beep(180, 50, 0.03)
    buzz(10)
  }

  const success = () => {
    beep(660, 70, 0.05, "sine", 0)
    beep(880, 90, 0.05, "sine", 80)
    buzz([15, 30, 15])
  }

  const error = () => {
    beep(220, 120, 0.06, "square", 0)
    beep(160, 160, 0.05, "square", 130)
    buzz([30, 40, 30])
  }

  const strong = () => {
    beep(420, 50, 0.05, "triangle")
    buzz(40)
  }

  const vibrate = (ms = 10) => buzz(ms)

  return { feedback: tap, tap, success, error, strong, vibrate }
}
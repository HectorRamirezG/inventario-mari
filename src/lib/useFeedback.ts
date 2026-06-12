export function useFeedback() {
  const tap = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = "sine"
      osc.frequency.value = 180
      gain.gain.value = 0.03

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.05)
    } catch {}
  }

  const vibrate = () => {
    if ("vibrate" in navigator) {
      navigator.vibrate(10)
    }
  }

  const feedback = () => {
    tap()
    vibrate()
  }

  return { feedback }
}
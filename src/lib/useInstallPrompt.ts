import { useEffect, useState } from "react"

/** Captura el evento `beforeinstallprompt` (Chrome/Edge). Devuelve una
 *  función para disparar el prompt cuando el usuario lo decida. */
export function useInstallPrompt() {
  const [event, setEvent] = useState<any>(null)
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    )
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const handler = (e: Event) => {
      e.preventDefault()
      setEvent(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const canPrompt = !!event && !installed
  const prompt = async () => {
    if (!event) return "unavailable"
    try {
      event.prompt()
      const choice = await event.userChoice
      setEvent(null)
      return choice.outcome as "accepted" | "dismissed"
    } catch {
      return "failed"
    }
  }

  return { canPrompt, installed, prompt }
}

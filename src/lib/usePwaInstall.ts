import { useCallback, useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
  prompt(): Promise<void>
}

const DISMISSED_KEY = "mari_install_dismissed_v1"
const DISMISS_FOR_DAYS = 14

function wasDismissedRecently(): boolean {
  try {
    const v = localStorage.getItem(DISMISSED_KEY)
    if (!v) return false
    const ts = Number(v) || 0
    return Date.now() - ts < DISMISS_FOR_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) {
      setInstalled(true)
      return
    }
    if (wasDismissedRecently()) return

    const onBefore = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener("beforeinstallprompt", onBefore as any)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore as any)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const prompt = useCallback(async () => {
    if (!deferred) return "unavailable" as const
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    return choice.outcome
  }, [deferred])

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      /* noop */
    }
    setDeferred(null)
  }, [])

  return { canInstall: !!deferred, installed, prompt, dismiss }
}

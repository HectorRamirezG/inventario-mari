type ImportFn = () => Promise<unknown>

const scheduled = new WeakSet<ImportFn>()

// Pre-carga un dynamic import en idle time (o tras 1.5s en navegadores
// sin requestIdleCallback). El loader se invoca a lo sumo una vez.
export function preloadOnIdle(loader: ImportFn) {
  if (typeof window === "undefined") return
  if (scheduled.has(loader)) return
  scheduled.add(loader)
  const run = () => {
    loader().catch(() => {
      scheduled.delete(loader)
    })
  }
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined
  if (ric) {
    ric(run, { timeout: 2500 })
  } else {
    window.setTimeout(run, 1500)
  }
}

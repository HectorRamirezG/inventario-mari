import { useEffect, useState } from "react"
import { getPerfMonitor, type PerfSnapshot } from "./perfMonitor"

export function usePerfSnapshot(): PerfSnapshot {
  const [snap, setSnap] = useState<PerfSnapshot>(() => getPerfMonitor().current)
  useEffect(() => {
    return getPerfMonitor().subscribe(setSnap)
  }, [])
  return snap
}

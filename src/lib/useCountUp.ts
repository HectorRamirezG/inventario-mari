import { useEffect, useRef, useState } from "react"

export function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    fromRef.current = value
    startRef.current = null
    const from = fromRef.current
    const to = target
    if (from === to) return

    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t
      const elapsed = t - startRef.current
      const p = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(from + (to - from) * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}

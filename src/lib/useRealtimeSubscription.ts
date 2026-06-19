import { useEffect, useRef } from "react"
import {
  subscribeRealtime,
  type RealtimeEvent,
  type RealtimeTable,
} from "./realtimeHub"

export interface UseRealtimeSubscriptionOptions {
  event?: RealtimeEvent
  match?: (row: any) => boolean
  enabled?: boolean
}

// Hook reactivo sobre el hub realtime multiplex. Mantiene callback y
// match en refs para que la suscripción NO se re-cree en cada render.
export function useRealtimeSubscription(
  table: RealtimeTable,
  cb: (payload: any) => void,
  opts: UseRealtimeSubscriptionOptions = {},
) {
  const cbRef = useRef(cb)
  const matchRef = useRef(opts.match)
  const event = opts.event ?? "*"
  const enabled = opts.enabled !== false

  useEffect(() => {
    cbRef.current = cb
  })
  useEffect(() => {
    matchRef.current = opts.match
  })

  useEffect(() => {
    if (!enabled) return
    const off = subscribeRealtime({
      table,
      event,
      match: (row) => (matchRef.current ? matchRef.current(row) : true),
      cb: (payload) => cbRef.current(payload),
    })
    return off
  }, [table, event, enabled])
}

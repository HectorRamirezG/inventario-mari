import { useEffect, useRef } from "react"

import {
  REALTIME_EVENT,
  startSupabaseMultiplex,
  type RealtimeTable,
} from "./supabaseMultiplex"

export type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE" | "*"

export interface UseRealtimeSubscriptionOptions {
  event?: RealtimeEvent
  match?: (row: any) => boolean
  enabled?: boolean
}

// Consume el bus CustomEvent que emite supabaseMultiplex. Mantiene
// cb/match en refs para que la suscripción nunca se re-cree por render.
export function useRealtimeSubscription(
  table: RealtimeTable,
  cb: (payload: any) => void,
  opts: UseRealtimeSubscriptionOptions = {},
) {
  const cbRef = useRef(cb)
  const matchRef = useRef(opts.match)
  const eventTypeRef = useRef<RealtimeEvent>(opts.event ?? "*")
  const enabled = opts.enabled !== false

  useEffect(() => {
    cbRef.current = cb
  })
  useEffect(() => {
    matchRef.current = opts.match
  })
  useEffect(() => {
    eventTypeRef.current = opts.event ?? "*"
  })

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    startSupabaseMultiplex()
    const handler = (e: Event) => {
      const payload = (e as CustomEvent).detail
      const evType = (payload?.eventType ?? "*") as RealtimeEvent
      const wantedEv = eventTypeRef.current
      if (wantedEv !== "*" && evType !== "*" && wantedEv !== evType) return
      const row = payload?.new ?? payload?.old
      if (matchRef.current && !matchRef.current(row)) return
      cbRef.current(payload)
    }
    const name = REALTIME_EVENT(table)
    window.addEventListener(name, handler)
    return () => window.removeEventListener(name, handler)
  }, [table, enabled])
}

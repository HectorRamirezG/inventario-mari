/**
 * Métricas de performance en vivo para mostrar al admin en Ajustes.
 *
 * Mide:
 *   - Heap JS y memoria del documento (Performance.memory)
 *   - FPS actual (requestAnimationFrame)
 *   - Latencia a Supabase (HEAD ping cada 10s)
 *   - Bytes descargados desde la apertura (PerformanceObserver - resource)
 *   - Tipo de conexión + downlink (Network Information API)
 *   - Estado del canal Realtime (subscription state)
 *   - Service Worker: hits del cache vs fetch
 *
 * Todas las métricas son best-effort. Si una API no está disponible
 * (Safari iOS no expose Memory, Firefox no Network Info), retorna null.
 */

import { supabase } from "../../lib/supabase"
import {
  onRealtimeEvent,
  onRealtimeStatus,
} from "../../lib/supabaseMultiplex"

export interface PerfSnapshot {
  /** Heap JS usado en MB. null si Memory API no disponible. */
  heapMB: number | null
  /** Total del heap permitido en MB. */
  heapLimitMB: number | null
  /** FPS de los últimos 1.5 segundos. */
  fps: number
  /** Latencia ms hacia Supabase (último ping). null si nunca midió. */
  supabaseLatencyMs: number | null
  /** Total de bytes (KB) transferidos desde la apertura del tab. */
  totalKB: number
  /** Tipo de conexión (4g, wifi, 3g, slow-2g…) o null si no disponible. */
  connectionType: string | null
  /** Velocidad estimada Mbps. */
  downlinkMbps: number | null
  /** True si la conexión está marcada como "save-data" por el SO. */
  saveData: boolean
  /** Estado del canal Realtime de Supabase. */
  realtimeStatus: "joined" | "joining" | "closed" | "error" | "unknown"
  /** Tiempo del último evento realtime recibido (ms desde la apertura). */
  lastRealtimeEventAt: number | null
  /** Hits del cache del Service Worker desde la apertura. */
  swCacheHits: number
  /** Misses del cache (peticiones que sí fueron a red). */
  swCacheMisses: number
  /** Score 0-100 derivado heurísticamente de los demás campos. */
  healthScore: number
}

const DEFAULT_SNAPSHOT: PerfSnapshot = {
  heapMB: null,
  heapLimitMB: null,
  fps: 60,
  supabaseLatencyMs: null,
  totalKB: 0,
  connectionType: null,
  downlinkMbps: null,
  saveData: false,
  realtimeStatus: "unknown",
  lastRealtimeEventAt: null,
  swCacheHits: 0,
  swCacheMisses: 0,
  healthScore: 100,
}

class PerfMonitor {
  private snapshot: PerfSnapshot = { ...DEFAULT_SNAPSHOT }
  private listeners = new Set<(s: PerfSnapshot) => void>()
  private rafId: number | null = null
  private fpsFrames = 0
  private fpsStart = 0
  private resourceObserver: PerformanceObserver | null = null
  private latencyTimer: number | null = null
  private fpsTimer: number | null = null
  private bootTime = Date.now()
  private realtimeChannel: any = null
  private unsubStatus: (() => void) | null = null
  private unsubEvent: (() => void) | null = null

  start() {
    if (typeof window === "undefined") return
    this.measureFps()
    this.observeResources()
    this.startLatencyPing()
    this.observeNetwork()
    this.observeRealtime()
    this.observeServiceWorker()
  }

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.latencyTimer) window.clearInterval(this.latencyTimer)
    if (this.fpsTimer) window.clearInterval(this.fpsTimer)
    this.resourceObserver?.disconnect()
    if (this.realtimeChannel) {
      try {
        supabase.removeChannel(this.realtimeChannel)
      } catch {}
    }
    this.unsubStatus?.()
    this.unsubEvent?.()
    this.unsubStatus = null
    this.unsubEvent = null
  }

  subscribe(fn: (s: PerfSnapshot) => void) {
    this.listeners.add(fn)
    fn(this.snapshot)
    return () => {
      this.listeners.delete(fn)
    }
  }

  get current(): PerfSnapshot {
    return { ...this.snapshot }
  }

  private update(patch: Partial<PerfSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, healthScore: 0 }
    this.snapshot.healthScore = this.computeHealth()
    this.listeners.forEach((l) => l(this.snapshot))
  }

  private computeHealth(): number {
    let score = 100
    const s = this.snapshot
    if (s.fps < 50) score -= 15
    if (s.fps < 30) score -= 25
    if (s.supabaseLatencyMs != null) {
      if (s.supabaseLatencyMs > 800) score -= 25
      else if (s.supabaseLatencyMs > 400) score -= 12
    }
    if (s.heapMB != null && s.heapLimitMB != null) {
      const ratio = s.heapMB / s.heapLimitMB
      if (ratio > 0.85) score -= 25
      else if (ratio > 0.7) score -= 12
    }
    if (s.connectionType === "slow-2g" || s.connectionType === "2g") score -= 10
    if (s.realtimeStatus === "error" || s.realtimeStatus === "closed") score -= 10
    return Math.max(0, Math.min(100, Math.round(score)))
  }

  private measureFps() {
    this.fpsStart = performance.now()
    this.fpsFrames = 0
    const tick = () => {
      this.fpsFrames++
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
    this.fpsTimer = window.setInterval(() => {
      const elapsed = performance.now() - this.fpsStart
      if (elapsed <= 0) return
      const fps = (this.fpsFrames * 1000) / elapsed
      this.fpsFrames = 0
      this.fpsStart = performance.now()
      // Lee memoria al mismo tiempo (Chromium)
      const mem = (performance as any).memory
      const heapMB = mem ? mem.usedJSHeapSize / 1048576 : null
      const heapLimitMB = mem ? mem.jsHeapSizeLimit / 1048576 : null
      this.update({ fps: Math.round(fps), heapMB, heapLimitMB })
    }, 1500)
  }

  private observeResources() {
    if (typeof PerformanceObserver === "undefined") return
    try {
      const obs = new PerformanceObserver((list) => {
        let bytes = 0
        for (const entry of list.getEntries() as any[]) {
          if (entry.transferSize) bytes += entry.transferSize
        }
        if (bytes > 0) {
          this.update({
            totalKB: this.snapshot.totalKB + Math.round(bytes / 1024),
          })
        }
      })
      obs.observe({ type: "resource", buffered: true })
      this.resourceObserver = obs
    } catch {
      /* noop */
    }
  }

  private async pingSupabase() {
    const start = performance.now()
    try {
      // Usamos un HEAD count contra una tabla liviana
      await supabase
        .from("app_settings")
        .select("key", { count: "exact", head: true })
        .limit(1)
      const latency = Math.round(performance.now() - start)
      this.update({ supabaseLatencyMs: latency })
    } catch {
      this.update({ supabaseLatencyMs: null })
    }
  }

  private startLatencyPing() {
    this.pingSupabase()
    this.latencyTimer = window.setInterval(() => this.pingSupabase(), 10_000)
  }

  private observeNetwork() {
    const conn: any = (navigator as any).connection
    if (!conn) return
    const read = () => {
      this.update({
        connectionType: conn.effectiveType ?? null,
        downlinkMbps: typeof conn.downlink === "number" ? conn.downlink : null,
        saveData: !!conn.saveData,
      })
    }
    read()
    conn.addEventListener?.("change", read)
  }

  private observeRealtime() {
    try {
      this.unsubStatus = onRealtimeStatus((status) => {
        this.update({ realtimeStatus: status })
      })
      this.unsubEvent = onRealtimeEvent((ts) => {
        this.update({ lastRealtimeEventAt: ts - this.bootTime })
      })
    } catch {
      this.update({ realtimeStatus: "error" })
    }
  }

  private observeServiceWorker() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
      const msg = e.data as { type?: string; from?: string }
      if (!msg) return
      if (msg.type === "cache-hit") {
        this.update({ swCacheHits: this.snapshot.swCacheHits + 1 })
      } else if (msg.type === "cache-miss") {
        this.update({ swCacheMisses: this.snapshot.swCacheMisses + 1 })
      }
    })
  }
}

let monitor: PerfMonitor | null = null

export function getPerfMonitor(): PerfMonitor {
  if (!monitor) {
    monitor = new PerfMonitor()
    monitor.start()
  }
  return monitor
}

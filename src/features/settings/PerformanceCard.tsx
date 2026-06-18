import { motion } from "framer-motion"
import {
  Activity,
  Gauge,
  Wifi,
  Cpu,
  Radio,
  ArrowDownToLine,
  ShieldCheck,
  WifiOff,
} from "lucide-react"

import { usePerfSnapshot } from "./usePerfSnapshot"

const CONN_LABEL: Record<string, string> = {
  "slow-2g": "2G lenta",
  "2g": "2G",
  "3g": "3G",
  "4g": "4G / WiFi",
}

function StatRow({
  icon: Icon,
  label,
  value,
  hint,
  tone = "slate",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: React.ReactNode
  hint?: string
  tone?: "emerald" | "amber" | "rose" | "sky" | "slate"
}) {
  const TONE_BG = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    sky: "bg-sky-500",
    slate: "bg-slate-500",
  }[tone]
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <div className={`w-7 h-7 rounded-lg ${TONE_BG} text-white flex items-center justify-center shrink-0`}>
        <Icon size={12} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 leading-none">
          {label}
        </p>
        {hint && (
          <p className="text-[9px] text-slate-400 leading-snug mt-0.5">{hint}</p>
        )}
      </div>
      <span className="text-[11px] font-black tabular-nums text-slate-800 dark:text-slate-200 shrink-0">
        {value}
      </span>
    </li>
  )
}

export default function PerformanceCard() {
  const s = usePerfSnapshot()

  const healthTone =
    s.healthScore >= 85 ? "emerald" :
    s.healthScore >= 65 ? "sky" :
    s.healthScore >= 40 ? "amber" : "rose"
  const HEALTH_BG = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }[healthTone]
  const HEALTH_TEXT = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    sky: "text-sky-600 dark:text-sky-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  }[healthTone]

  const fpsTone = s.fps >= 50 ? "emerald" : s.fps >= 30 ? "amber" : "rose"
  const latencyTone =
    s.supabaseLatencyMs == null
      ? "slate"
      : s.supabaseLatencyMs < 250
      ? "emerald"
      : s.supabaseLatencyMs < 600
      ? "amber"
      : "rose"
  const heapPct =
    s.heapMB != null && s.heapLimitMB ? (s.heapMB / s.heapLimitMB) * 100 : null
  const heapTone =
    heapPct == null ? "slate" : heapPct < 60 ? "emerald" : heapPct < 80 ? "amber" : "rose"

  const cacheTotal = s.swCacheHits + s.swCacheMisses
  const cacheRate = cacheTotal > 0 ? Math.round((s.swCacheHits / cacheTotal) * 100) : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-4 sm:p-5 mb-4 space-y-3"
    >
      <header className="flex items-center gap-2">
        <div className="bg-brand w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-bloom">
          <Activity size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 leading-none">
            Performance
          </h3>
          <p className="text-[9px] font-bold text-slate-400 leading-none mt-0.5">
            Cómo va la app y la red en este dispositivo
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-2xl font-black tabular-nums leading-none ${HEALTH_TEXT}`}>
            {s.healthScore}
          </span>
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Score
          </span>
        </div>
      </header>

      {/* Barra de salud */}
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${s.healthScore}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${HEALTH_BG}`}
        />
      </div>

      <ul className="space-y-0 divide-y divide-slate-100 dark:divide-slate-700/60">
        <StatRow
          icon={Gauge}
          label="FPS"
          value={`${s.fps}`}
          hint="Cuadros por segundo · 60 es óptimo"
          tone={fpsTone}
        />
        <StatRow
          icon={Radio}
          label="Latencia Supabase"
          value={s.supabaseLatencyMs == null ? "—" : `${s.supabaseLatencyMs}ms`}
          hint="Tiempo de respuesta al servidor"
          tone={latencyTone}
        />
        <StatRow
          icon={Cpu}
          label="Memoria JS"
          value={
            s.heapMB == null
              ? "n/d"
              : `${s.heapMB.toFixed(0)} / ${s.heapLimitMB?.toFixed(0) ?? "?"} MB`
          }
          hint={
            heapPct == null
              ? "Tu navegador no expone esta métrica"
              : `${heapPct.toFixed(0)}% del límite del navegador`
          }
          tone={heapTone}
        />
        <StatRow
          icon={ArrowDownToLine}
          label="Datos descargados"
          value={
            s.totalKB < 1024
              ? `${s.totalKB} KB`
              : `${(s.totalKB / 1024).toFixed(1)} MB`
          }
          hint="Desde que abriste la app"
        />
        <StatRow
          icon={s.connectionType === "slow-2g" || s.connectionType === "2g" ? WifiOff : Wifi}
          label="Conexión"
          value={
            <>
              {s.connectionType ? (CONN_LABEL[s.connectionType] ?? s.connectionType) : "n/d"}
              {s.downlinkMbps != null && (
                <span className="text-slate-400 font-normal text-[10px] ml-1">
                  {s.downlinkMbps} Mbps
                </span>
              )}
            </>
          }
          hint={s.saveData ? "Modo ahorro de datos activo" : undefined}
          tone={
            s.connectionType === "slow-2g" || s.connectionType === "2g"
              ? "amber"
              : "sky"
          }
        />
        <StatRow
          icon={Radio}
          label="Realtime"
          value={
            s.realtimeStatus === "joined"
              ? "Conectado"
              : s.realtimeStatus === "joining"
              ? "Conectando…"
              : s.realtimeStatus === "closed"
              ? "Desconectado"
              : s.realtimeStatus === "error"
              ? "Error"
              : "—"
          }
          hint={
            s.lastRealtimeEventAt != null
              ? `Último evento hace ${Math.round((Date.now() - (s.lastRealtimeEventAt + (Date.now() - s.lastRealtimeEventAt))) / 1000) || 0}s`
              : "Canal de sincronización en vivo"
          }
          tone={
            s.realtimeStatus === "joined"
              ? "emerald"
              : s.realtimeStatus === "joining"
              ? "amber"
              : "rose"
          }
        />
        {cacheRate != null && (
          <StatRow
            icon={ShieldCheck}
            label="Cache offline"
            value={`${cacheRate}%`}
            hint={`${s.swCacheHits} hits · ${s.swCacheMisses} red`}
            tone={cacheRate >= 70 ? "emerald" : "sky"}
          />
        )}
      </ul>

      <p className="text-[9px] text-slate-400 italic text-center pt-1">
        Métricas en vivo · se actualizan solas, sin refrescar
      </p>
    </motion.section>
  )
}

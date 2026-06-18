import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  Database,
  Image as ImageIcon,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { confirmAction } from "../../lib/confirm"

/**
 * Tarjeta de uso de Storage. Pinta:
 *   - Barra de progreso sobre la cuota del plan Free (1 GB)
 *   - Desglose por carpeta del bucket (productos, comprobantes, etc)
 *   - Botón "Limpiar ahora" que ejecuta el RPC mari_cleanup()
 *   - CTA visible cuando el uso pasa del 70%
 *
 * Datos vienen del RPC `mari_storage_usage()` definido en
 * `supabase/maintenance_jobs.sql`. Si el RPC no existe (admin no
 * corrió el SQL) muestra un mensaje guiando a correrlo.
 */
interface FolderUsage {
  folder: string
  files: number
  bytes: number
  mb: number
}

interface UsageReport {
  ok: boolean
  bucket: string
  folders: FolderUsage[]
  total_files: number
  total_bytes: number
  total_mb: number
}

interface CleanupReport {
  ok: boolean
  ran_at: string
  counts: Record<string, number>
}

const FREE_PLAN_LIMIT_MB = 1024 // 1 GB
const FOLDER_LABEL: Record<string, string> = {
  products: "Catálogo",
  proofs: "Comprobantes",
  reviews: "Reseñas",
  stories: "Stories",
  support: "Soporte",
  wishes: "Sugerencias",
  avatars: "Avatares",
}

export default function StorageUsageCard() {
  const [data, setData] = useState<UsageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: r, error: e } = await supabase.rpc("mari_storage_usage")
      if (e) {
        if (
          /function .* does not exist|404|not found/i.test(e.message) ||
          e.code === "PGRST202" ||
          e.code === "42883"
        ) {
          setError("RPC `mari_storage_usage` no existe. Corre `supabase/maintenance_jobs.sql` en el SQL Editor.")
          setData(null)
        } else {
          setError(e.message)
        }
        return
      }
      setData(r as UsageReport)
    } catch (e: any) {
      setError(e?.message ?? "Error desconocido")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const runCleanup = async () => {
    const ok = await confirmAction({
      title: "¿Correr limpieza ahora?",
      description:
        "Esto borra stories caducas, notificaciones viejas, y libera imágenes de comprobantes/soporte resueltos hace tiempo. La metadata (monto, fecha, motivo) se conserva. Operación segura: no toca productos, ventas, ni datos vivos.",
      confirmLabel: "Sí, limpiar",
      tone: "primary",
    })
    if (!ok) return
    setCleaning(true)
    const tid = toast.loading("Ejecutando limpieza...")
    try {
      const { data: r, error: e } = await supabase.rpc("mari_cleanup")
      if (e) {
        if (
          /function .* does not exist|404|not found/i.test(e.message) ||
          e.code === "PGRST202" ||
          e.code === "42883"
        ) {
          toast.error(
            "El RPC mari_cleanup no existe. Corre `supabase/maintenance_jobs.sql` primero.",
            { id: tid, duration: 6000 },
          )
        } else {
          toast.error(e.message, { id: tid, duration: 5000 })
        }
        return
      }
      const report = r as CleanupReport
      const total = Object.values(report?.counts ?? {}).reduce(
        (a, b) => a + (typeof b === "number" ? b : 0),
        0,
      )
      toast.success(
        `✓ Limpieza terminada · ${total} registros procesados.`,
        { id: tid, duration: 4500 },
      )
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló la limpieza", { id: tid })
    } finally {
      setCleaning(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Database size={14} className="text-primary" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
            Uso de almacenamiento
          </p>
        </div>
        <p className="text-[10px] text-slate-400">Cargando…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 mb-1">
              Reporte no disponible
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-200/90 leading-snug">
              {error ?? "Sin datos"}
            </p>
            <button
              onClick={refresh}
              className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  const pct = Math.min(100, (data.total_mb / FREE_PLAN_LIMIT_MB) * 100)
  const tone =
    pct >= 85 ? "rose" : pct >= 70 ? "amber" : pct >= 50 ? "sky" : "emerald"
  const TONE_BG = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }[tone]
  const TONE_TEXT = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    sky: "text-sky-600 dark:text-sky-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  }[tone]

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
      {/* Header con título + refresh */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
            <Database size={13} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 leading-none">
              Almacenamiento
            </p>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
              Plan Free · {FREE_PLAN_LIMIT_MB} MB
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          aria-label="Refrescar"
          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-500 hover:text-primary flex items-center justify-center press disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Barra + cifra */}
      <div className="px-4 pb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className={`text-2xl font-black tabular-nums ${TONE_TEXT} leading-none`}>
            {data.total_mb.toFixed(1)} MB
          </span>
          <span className="text-[10px] font-bold text-slate-400 tabular-nums">
            {pct.toFixed(1)}% usado
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full rounded-full ${TONE_BG}`}
          />
        </div>
        <p className="text-[9px] font-bold text-slate-400 mt-1">
          {data.total_files.toLocaleString()} archivos
        </p>
      </div>

      {/* Desglose por carpeta */}
      {data.folders.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-700/70 px-4 py-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Desglose
          </p>
          <ul className="space-y-1.5">
            {data.folders.map((f) => (
              <li key={f.folder} className="flex items-center gap-2.5">
                <ImageIcon size={11} className="text-slate-300 shrink-0" />
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex-1 truncate">
                  {FOLDER_LABEL[f.folder] ?? f.folder}
                </span>
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {f.files}
                </span>
                <span className="text-[11px] font-black tabular-nums text-slate-700 dark:text-slate-200 min-w-[60px] text-right">
                  {f.mb < 1 ? `${(f.bytes / 1024).toFixed(0)} KB` : `${f.mb} MB`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA limpiar */}
      <div className="border-t border-slate-100 dark:border-slate-700/70 px-4 py-3 bg-slate-50/60 dark:bg-slate-800/40">
        {pct >= 70 && (
          <div className="flex items-start gap-2 mb-2.5">
            <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-snug">
              Estás cerca del límite del plan Free. Corre la limpieza para liberar espacio o considera migrar a Pro.
            </p>
          </div>
        )}
        <button
          onClick={runCleanup}
          disabled={cleaning}
          className="w-full h-10 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom press-hard disabled:opacity-50"
        >
          {cleaning ? (
            <RefreshCw size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {cleaning ? "Limpiando..." : "Limpiar ahora"}
        </button>
        <p className="text-[9px] text-slate-400 text-center mt-2 leading-snug">
          Borra stories caducas, notifs viejas y libera imágenes de
          comprobantes/soporte resueltos hace tiempo. La metadata se conserva.
        </p>
        {pct < 50 && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <CheckCircle2 size={10} className="text-emerald-500" />
            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
              Tu app está saludable
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

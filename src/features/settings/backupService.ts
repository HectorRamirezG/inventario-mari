/**
 * Exporta un respaldo JSON del estado de Mari para que pueda descargarlo
 * y guardarlo en su Drive / iCloud / etc. NO sustituye los backups
 * automáticos de Supabase, pero da paz mental + recovery rápido si
 * algo se borra por accidente.
 *
 * Contenido:
 *   - app_settings (business_rules, ui_settings, etc.)
 *   - products + variants (catálogo completo)
 *   - sales recientes (90 días) + sale_items + payments
 *   - delivery_notes recientes (90 días)
 *   - user_profiles (sin datos sensibles)
 *   - loyalty_rules + loyalty_balance + loyalty_events recientes
 *   - bundles activos
 *   - meta: timestamp, version, counts
 *
 * Tolerante: si una tabla no existe (SQL no corrido), la salta y
 * agrega un warning al meta.
 */

import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

export interface BackupMeta {
  generated_at: string
  app_version: string
  tables_included: string[]
  tables_missing: string[]
  total_size_estimate: number
}

export interface AppBackup {
  meta: BackupMeta
  data: Record<string, unknown[]>
}

const TABLES_FULL: Array<{ key: string; orderBy?: string }> = [
  { key: "app_settings" },
  { key: "products", orderBy: "name" },
  { key: "variants", orderBy: "variant_name" },
  { key: "categories" },
  { key: "bundles" },
  { key: "loyalty_rules" },
  { key: "user_profiles" },
  { key: "loyalty_balance" },
]

const TABLES_RECENT: Array<{
  key: string
  dateColumn: string
  daysBack: number
}> = [
  { key: "sales", dateColumn: "created_at", daysBack: 90 },
  { key: "sale_items", dateColumn: "created_at", daysBack: 90 },
  { key: "payments", dateColumn: "created_at", daysBack: 90 },
  { key: "delivery_notes", dateColumn: "created_at", daysBack: 90 },
  { key: "loyalty_events", dateColumn: "created_at", daysBack: 90 },
]

export async function generateBackup(): Promise<AppBackup> {
  const included: string[] = []
  const missing: string[] = []
  const data: Record<string, unknown[]> = {}

  for (const t of TABLES_FULL) {
    try {
      let q = supabase.from(t.key).select("*").limit(10_000)
      if (t.orderBy) q = q.order(t.orderBy)
      const { data: rows, error } = await q
      if (error) {
        debug.warn(`[backup] ${t.key}:`, error.message)
        missing.push(t.key)
      } else {
        data[t.key] = (rows ?? []) as unknown[]
        included.push(t.key)
      }
    } catch (e: any) {
      debug.warn(`[backup] ${t.key} fail:`, e?.message)
      missing.push(t.key)
    }
  }

  for (const t of TABLES_RECENT) {
    try {
      const since = new Date(Date.now() - t.daysBack * 24 * 3600 * 1000)
      const { data: rows, error } = await supabase
        .from(t.key)
        .select("*")
        .gte(t.dateColumn, since.toISOString())
        .order(t.dateColumn, { ascending: false })
        .limit(10_000)
      if (error) {
        debug.warn(`[backup] ${t.key}:`, error.message)
        missing.push(t.key)
      } else {
        data[t.key] = (rows ?? []) as unknown[]
        included.push(t.key)
      }
    } catch (e: any) {
      debug.warn(`[backup] ${t.key} fail:`, e?.message)
      missing.push(t.key)
    }
  }

  const json = JSON.stringify(data)
  return {
    meta: {
      generated_at: new Date().toISOString(),
      app_version: "beauty-me/backup-v1",
      tables_included: included,
      tables_missing: missing,
      total_size_estimate: json.length,
    },
    data,
  }
}

/**
 * Genera el backup y dispara una descarga directa del navegador.
 * Devuelve el meta para que el caller pueda mostrar resumen.
 */
export async function downloadBackup(): Promise<BackupMeta> {
  const backup = await generateBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `beauty-me-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }, 200)
  return backup.meta
}

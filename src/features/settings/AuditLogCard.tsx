import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { History, RefreshCw, User } from "lucide-react"

import { listAuditLog, type AuditEntry } from "./auditLogService"
import { formatDateTime } from "../../lib/format"

const ACTION_LABEL: Record<string, string> = {
  stock_change: "Cambió stock",
  price_change: "Cambió precio",
  status_change: "Cambió estatus",
}

function diffShort(before: any, after: any): string {
  if (!before || !after) return ""
  const keys = Object.keys(after)
  return keys
    .map((k) => `${k}: ${before[k] ?? "—"} → ${after[k] ?? "—"}`)
    .join(" · ")
}

export default function AuditLogCard() {
  const [items, setItems] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setItems(await listAuditLog({ limit: 50 }))
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-5 mb-4 space-y-3"
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0">
            <History size={14} />
          </div>
          <div>
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
              Auditoría
            </h3>
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
              Cambios sensibles a precios, stock y estatus
            </p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refrescar"
          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-500 hover:text-primary flex items-center justify-center press disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {items.length === 0 ? (
        <p className="text-[10px] text-slate-400 italic text-center py-4">
          {loading ? "Cargando…" : "Sin eventos registrados todavía"}
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
          {items.map((e) => (
            <li
              key={e.id}
              className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
                  {ACTION_LABEL[e.action] ?? e.action} · {e.entity_type}
                </span>
                <span className="text-[9px] text-slate-400 tabular-nums shrink-0">
                  {formatDateTime(e.created_at)}
                </span>
              </div>
              {(e.before_data || e.after_data) && (
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  {diffShort(e.before_data, e.after_data)}
                </p>
              )}
              {e.actor_email && (
                <p className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <User size={9} /> {e.actor_email}
                  {e.actor_role && (
                    <span className="px-1.5 py-0 rounded-full bg-slate-200 dark:bg-slate-700 text-[8px] uppercase tracking-widest">
                      {e.actor_role}
                    </span>
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  )
}

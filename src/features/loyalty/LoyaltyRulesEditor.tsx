import { useState } from "react"
import { Trophy, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

import {
  useLoyaltyRules,
  updateLoyaltyRule,
  type LoyaltyRule,
} from "./loyaltyService"

/**
 * Editor inline para que el admin ajuste cuántos puntos otorga cada
 * acción del programa de premios. Se monta dentro de BusinessRulesPage
 * cuando `loyalty_enabled = true`.
 */
export default function LoyaltyRulesEditor() {
  const { rules, loading } = useLoyaltyRules()
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function handleUpdate(
    rule: LoyaltyRule,
    patch: Partial<Pick<LoyaltyRule, "points" | "enabled">>,
  ) {
    setSavingKey(rule.action_key)
    try {
      await updateLoyaltyRule(rule.action_key, patch)
      toast.success("Regla actualizada", { duration: 1500 })
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar")
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-400 py-3">
        <Loader2 size={12} className="animate-spin" />
        Cargando reglas…
      </div>
    )
  }

  if (rules.length === 0) {
    return (
      <p className="text-[11px] text-slate-400 italic py-2">
        Aún no hay reglas configuradas en la base de datos. Corre el SQL{" "}
        <code>fix_loyalty_system.sql</code>.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {rules.map((r) => {
        const isSaving = savingKey === r.action_key
        return (
          <div
            key={r.action_key}
            className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
              r.enabled
                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                : "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 opacity-60"
            }`}
          >
            <span className="text-xl shrink-0" aria-hidden>
              {r.emoji ?? "✨"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 truncate">
                {r.label}
              </p>
              {r.description && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug truncate">
                  {r.description}
                  {r.one_time && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400 font-black">
                      · 1 sola vez
                    </span>
                  )}
                </p>
              )}
            </div>
            <input
              type="number"
              min={0}
              max={9999}
              value={r.points}
              disabled={isSaving}
              onChange={(e) => {
                const next = Math.max(0, Math.min(9999, Number(e.target.value) || 0))
                if (next === r.points) return
                handleUpdate(r, { points: next })
              }}
              className="w-16 text-center text-[12px] font-black tabular-nums rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={`Puntos para ${r.label}`}
            />
            <button
              type="button"
              onClick={() => handleUpdate(r, { enabled: !r.enabled })}
              disabled={isSaving}
              className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${
                r.enabled ? "bg-primary" : "bg-slate-300 dark:bg-slate-700"
              }`}
              aria-label={r.enabled ? "Desactivar" : "Activar"}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  r.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        )
      })}
      <p className="text-[10px] text-slate-400 italic mt-2 flex items-center gap-1.5">
        <Trophy size={10} />
        Cambia los puntos directo en el campo. Activa/desactiva con el
        switch. Los triggers automáticos respetan estos valores en vivo.
      </p>
    </div>
  )
}

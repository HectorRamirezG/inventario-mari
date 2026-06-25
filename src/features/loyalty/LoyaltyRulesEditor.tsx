import { useEffect, useState } from "react"
import { Trophy, Loader2, Plus, Trash2, Gift, Sparkles, Search } from "lucide-react"
import toast from "react-hot-toast"

import {
  useLoyaltyRules,
  updateLoyaltyRule,
  createLoyaltyRule,
  deleteLoyaltyRule,
  awardManualPoints,
  searchCustomers,
  type LoyaltyRule,
  type CustomerSuggestion,
} from "./loyaltyService"
import Modal from "../../components/ui/Modal"
import Toggle from "../../components/ui/Toggle"
import { confirmAction } from "../../lib/confirm"
import { useDebouncedValue } from "../../lib/useDebouncedValue"

/**
 * Editor inline para que el admin ajuste cuántos puntos otorga cada
 * acción del programa de premios. Se monta dentro de BusinessRulesPage
 * cuando `loyalty_enabled = true`.
 *
 * Funcionalidades:
 *  - Editar puntos / toggle enabled de reglas existentes.
 *  - Crear reglas custom (action_key se prefija con `custom_`).
 *  - Borrar reglas custom (las del seed están protegidas).
 *  - Otorgar puntos manualmente a un cliente por email.
 */
export default function LoyaltyRulesEditor() {
  const { rules, loading, refresh } = useLoyaltyRules()
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [grantOpen, setGrantOpen] = useState(false)

  async function handleUpdate(
    rule: LoyaltyRule,
    patch: Partial<Pick<LoyaltyRule, "points" | "enabled">>,
  ) {
    setSavingKey(rule.action_key)
    try {
      await updateLoyaltyRule(rule.action_key, patch)
      // Forzamos refresh local: el realtime de loyalty_rules puede tardar
      // o no estar habilitado en la publication. Sin esto el toggle se
      // sentía "muerto" para Mari.
      await refresh()
      toast.success("Regla actualizada", { duration: 1500 })
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar")
    } finally {
      setSavingKey(null)
    }
  }

  async function handleDelete(rule: LoyaltyRule) {
    const ok = await confirmAction({
      title: "Borrar regla",
      description: `¿Eliminar "${rule.label}"? Sus eventos históricos se conservan.`,
      confirmLabel: "Borrar",
      tone: "danger",
    })
    if (!ok) return
    setSavingKey(rule.action_key)
    try {
      await deleteLoyaltyRule(rule.action_key)
      await refresh()
      toast.success("Regla eliminada")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo borrar")
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

  return (
    <div className="space-y-2">
      {/* Acciones rápidas — siempre visibles aunque no haya reglas. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="h-10 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press shadow-bloom"
        >
          <Plus size={12} /> Nueva regla
        </button>
        <button
          type="button"
          onClick={() => setGrantOpen(true)}
          className="h-10 rounded-xl bg-amber-500 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press shadow-bloom"
        >
          <Gift size={12} /> Regalar puntos
        </button>
      </div>

      {rules.length === 0 && (
        <p className="text-[11px] text-slate-400 italic py-2">
          Aún no hay reglas configuradas. Crea la primera con el botón
          azul, o corre el SQL <code>fix_loyalty_more_rules.sql</code>.
        </p>
      )}

      {rules.map((r) => {
        const isSaving = savingKey === r.action_key
        const isCustom = r.action_key.startsWith("custom_")
        return (
          <div
            key={r.action_key}
            className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 hover:border-primary/30 dark:hover:border-primary/40 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Icono chip (emoji centrado) — espeja el icono de RuleRow. */}
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-base">
                <span aria-hidden>{r.emoji ?? "✨"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
                    {r.label}
                  </p>
                  {/* Chip Activo/Pausado igual al de RuleRow. */}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none ${
                      r.enabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-slate-200 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
                    }`}
                  >
                    {r.enabled ? "Activo" : "Pausado"}
                  </span>
                  {isCustom && (
                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none bg-primary/15 text-primary">
                      Custom
                    </span>
                  )}
                  {r.one_time && (
                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      1 sola vez
                    </span>
                  )}
                </div>
                {r.description && (
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-1">
                    {r.description}
                  </p>
                )}
              </div>
              {/* Toggle unificado (mismo componente que el resto de la página). */}
              <Toggle
                checked={r.enabled}
                onChange={(v) => handleUpdate(r, { enabled: v })}
                disabled={isSaving}
                label={r.enabled ? "Desactivar" : "Activar"}
              />
            </div>

            {/* Controles de puntos y borrar — solo cuando la regla está activa,
                igual que RuleRow expande sus hijos solo al estar prendida. */}
            {r.enabled && (
              <div className="pt-3 pl-12 flex items-center gap-2 flex-wrap">
                <label className="inline-flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Puntos
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={9999}
                    value={r.points}
                    disabled={isSaving}
                    onChange={(e) => {
                      const next = Math.max(0, Math.min(9999, Number(e.target.value) || 0))
                      if (next === r.points) return
                      handleUpdate(r, { points: next })
                    }}
                    className="h-9 w-24 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-slate-900 dark:text-slate-100 px-2"
                    aria-label={`Puntos para ${r.label}`}
                  />
                </label>
                {isSaving && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400">
                    <Loader2 size={10} className="animate-spin" /> guardando
                  </span>
                )}
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => handleDelete(r)}
                    disabled={isSaving}
                    aria-label="Borrar regla"
                    title="Borrar esta regla custom"
                    className="ml-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest press disabled:opacity-50"
                  >
                    <Trash2 size={11} /> Borrar
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      <p className="text-[10px] text-slate-400 italic mt-2 flex items-center gap-1.5">
        <Trophy size={10} />
        Cambia los puntos directo en el campo. Los triggers automáticos
        respetan estos valores en vivo. Las reglas custom no disparan
        triggers — debes regalar puntos manualmente cuando aplique.
      </p>

      <CreateRuleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <GrantPointsModal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * Modal: crear una nueva regla custom.
 * El action_key se genera del label (slug + prefix `custom_`).
 * ───────────────────────────────────────────────────────────── */

function CreateRuleModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [label, setLabel] = useState("")
  const [description, setDescription] = useState("")
  const [points, setPoints] = useState(10)
  const [emoji, setEmoji] = useState("✨")
  const [oneTime, setOneTime] = useState(false)
  const [saving, setSaving] = useState(false)

  function reset() {
    setLabel("")
    setDescription("")
    setPoints(10)
    setEmoji("✨")
    setOneTime(false)
  }

  async function handleCreate() {
    if (!label.trim()) {
      toast.error("Ponle un nombre a la regla")
      return
    }
    setSaving(true)
    try {
      await createLoyaltyRule({
        label: label.trim(),
        description: description.trim() || null,
        points,
        emoji: emoji.trim() || "✨",
        one_time: oneTime,
      })
      toast.success("Regla creada ✨")
      reset()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Nueva regla de puntos" onClose={onClose} size="sm">
      <div className="space-y-3">
        <Field label="Nombre visible para el cliente">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ej. Trae a un amigo"
            maxLength={80}
            className="settings-input"
          />
        </Field>
        <Field label="Descripción corta (opcional)">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Cuando tu amigo se registra y compra"
            maxLength={200}
            className="settings-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Puntos">
            <input
              type="number"
              min={1}
              max={9999}
              value={points}
              onChange={(e) =>
                setPoints(
                  Math.max(0, Math.min(9999, Number(e.target.value) || 0)),
                )
              }
              className="settings-input text-center font-black tabular-nums"
            />
          </Field>
          <Field label="Emoji">
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="✨"
              maxLength={6}
              className="settings-input text-center text-xl"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <input
            type="checkbox"
            checked={oneTime}
            onChange={(e) => setOneTime(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            Una sola vez por cliente
          </span>
        </label>
        <p className="text-[10px] text-slate-400 italic leading-snug">
          Estas reglas no disparan triggers automáticos. Usa el botón
          "Regalar puntos" cuando un cliente cumpla la condición.
        </p>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !label.trim()}
          className="w-full h-11 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom press-hard disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Crear regla
        </button>
      </div>
    </Modal>
  )
}

/* ─────────────────────────────────────────────────────────────
 * Modal: regalar puntos manualmente a un cliente.
 * Acepta email + cantidad (puede ser negativa para descontar)
 * + nota opcional. Inserta directo en `loyalty_events`.
 *
 * UX:
 *  - Autocomplete por email/nombre desde `user_profiles` +
 *    `loyalty_balance` (muestra saldo actual del cliente).
 *  - Pills rápidas de cantidad común (+10, +25, +50, +100, -10, -25).
 *  - Botón final cambia color según signo (emerald = regalar,
 *    rose = descontar).
 * ───────────────────────────────────────────────────────────── */

const QUICK_AMOUNTS_POSITIVE = [10, 25, 50, 100, 200]
const QUICK_AMOUNTS_NEGATIVE = [-10, -25, -50]

function GrantPointsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [email, setEmail] = useState("")
  const [points, setPoints] = useState(50)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [showList, setShowList] = useState(false)

  // Debounce 250ms para evitar query por cada tecla
  const debouncedQuery = useDebouncedValue(email, 250)

  useEffect(() => {
    if (!open) return
    const q = debouncedQuery.trim()
    // No buscamos si parece email completo válido — el admin ya escogió.
    if (q.length < 2 || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q)) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setSearching(true)
    searchCustomers(q, 8)
      .then((rows) => {
        if (!cancelled) setSuggestions(rows)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, debouncedQuery])

  function reset() {
    setEmail("")
    setPoints(50)
    setNote("")
    setSuggestions([])
    setShowList(false)
  }

  function pickSuggestion(s: CustomerSuggestion) {
    setEmail(s.email)
    setSuggestions([])
    setShowList(false)
  }

  async function handleGrant() {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes("@")) {
      toast.error("Pon un email válido")
      return
    }
    if (!points) {
      toast.error("Pon una cantidad distinta de 0")
      return
    }
    setSaving(true)
    try {
      const newBalance = await awardManualPoints({
        email: cleanEmail,
        points,
        note: note.trim() || undefined,
      })
      if (newBalance === null) {
        toast.error("No se pudo otorgar")
      } else {
        toast.success(
          points > 0
            ? `+${points} pts a ${cleanEmail.split("@")[0]} (saldo: ${newBalance})`
            : `${points} pts a ${cleanEmail.split("@")[0]} (saldo: ${newBalance})`,
        )
        reset()
        onClose()
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error al otorgar")
    } finally {
      setSaving(false)
    }
  }

  const isPositive = points >= 0

  return (
    <Modal open={open} title="Regalar puntos a un cliente" onClose={onClose} size="sm">
      <div className="space-y-3">
        {/* Email con autocomplete dropdown */}
        <Field label="Cliente (email o nombre)">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setShowList(true)
              }}
              onFocus={() => setShowList(true)}
              placeholder="cliente@... o nombre"
              className="settings-input pl-9"
              autoComplete="off"
            />
            {searching && (
              <Loader2
                size={12}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"
              />
            )}
          </div>
          {showList && suggestions.length > 0 && (
            <ul className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
              {suggestions.map((s) => (
                <li key={s.email}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
                      {(s.full_name || s.email)
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 truncate">
                        {s.full_name ?? s.email.split("@")[0]}
                      </p>
                      <p className="text-[9px] text-slate-500 truncate">
                        {s.email}
                      </p>
                    </div>
                    {s.points > 0 && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] font-black tabular-nums">
                        {s.points} pts
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>

        {/* Pills rápidos arriba del campo numérico */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
            Cantidad rápida
          </p>
          <div className="flex flex-wrap gap-1">
            {QUICK_AMOUNTS_POSITIVE.map((n) => (
              <button
                key={`pos-${n}`}
                type="button"
                onClick={() => setPoints(n)}
                className={`px-2.5 h-7 rounded-full text-[10px] font-black tabular-nums transition-colors ${
                  points === n
                    ? "bg-emerald-500 text-white shadow-bloom"
                    : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                }`}
              >
                +{n}
              </button>
            ))}
            {QUICK_AMOUNTS_NEGATIVE.map((n) => (
              <button
                key={`neg-${n}`}
                type="button"
                onClick={() => setPoints(n)}
                className={`px-2.5 h-7 rounded-full text-[10px] font-black tabular-nums transition-colors ${
                  points === n
                    ? "bg-rose-500 text-white shadow-bloom"
                    : "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={-999}
            max={9999}
            value={points}
            onChange={(e) =>
              setPoints(
                Math.max(-999, Math.min(9999, Number(e.target.value) || 0)),
              )
            }
            className="settings-input text-center font-black tabular-nums mt-2"
            placeholder="O escribe libre…"
          />
        </div>

        <Field label="Nota (sale en el historial del cliente)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. Premio por traer a una amiga"
            maxLength={120}
            className="settings-input"
          />
        </Field>
        <p className="text-[10px] text-slate-400 italic leading-snug flex items-start gap-1.5">
          <Sparkles size={10} className="text-amber-500 mt-0.5 shrink-0" />
          El cliente lo ve al instante en "Mis premios". Si pones puntos
          negativos, le descuentas del saldo (mínimo queda en 0).
        </p>
        <button
          type="button"
          onClick={handleGrant}
          disabled={saving || !email.trim() || !points}
          className={`w-full h-11 rounded-xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom press-hard disabled:opacity-50 ${
            isPositive ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Gift size={12} />}
          {isPositive
            ? `Regalar ${points || 0} pts`
            : `Descontar ${Math.abs(points)} pts`}
        </button>
      </div>
    </Modal>
  )
}

/** Field genérico para los modales (label + slot). */
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  )
}

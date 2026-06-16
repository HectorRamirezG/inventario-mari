import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ScrollText,
  Save,
  Loader2,
  Clock,
  Truck,
  ShieldAlert,
  XCircle,
  Ban,
  Wallet,
  RotateCcw,
  Bookmark,
  Package,
  Layers,
  Lock,
} from "lucide-react"
import toast from "react-hot-toast"

import PageHeader from "../../components/ui/PageHeader"
import Toggle from "../../components/ui/Toggle"
import {
  useBusinessRules,
  saveBusinessRules,
  DEFAULT_RULES,
  type BusinessRules,
} from "./businessRulesService"

export default function BusinessRulesPage() {
  const live = useBusinessRules()
  const [form, setForm] = useState<BusinessRules>(live)
  const [saving, setSaving] = useState(false)

  useEffect(() => setForm(live), [live])

  function patch(p: Partial<BusinessRules>) {
    setForm((prev) => ({ ...prev, ...p }))
  }

  async function handleSave() {
    setSaving(true)
    const tid = toast.loading("Guardando políticas...")
    try {
      await saveBusinessRules(form)
      toast.success("Políticas actualizadas", { id: tid })
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar", { id: tid })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    if (!window.confirm("¿Restaurar valores por defecto?")) return
    setForm(DEFAULT_RULES)
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(live)

  return (
    <div className="max-w-3xl mx-auto pb-32">
      <PageHeader
        icon={ScrollText}
        title="Políticas del negocio"
        subtitle="Reglas que aplican a todos los pedidos y al cliente"
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="h-9 px-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest shadow-sm hover:shadow-md flex items-center gap-1.5 transition-all"
            >
              <RotateCcw size={11} /> Restaurar
            </button>
          </div>
        }
      />

      <div className="space-y-3">
        {/* LOGÍSTICA Y RECLAMACIONES */}
        <Block title="Logística y reclamaciones" icon={Truck}>
          <RuleRow
            icon={Clock}
            title="Ventana de reclamación"
            description="Bloquea el botón de reportar daño N horas después del pago/entrega."
            enabled={form.claim_window_enabled}
            onToggle={(v) => patch({ claim_window_enabled: v })}
          >
            <NumberField
              label="Horas"
              value={form.claim_window_hours}
              onChange={(v) => patch({ claim_window_hours: v })}
              suffix="h"
              min={1}
              max={720}
            />
          </RuleRow>

          <RuleRow
            icon={Truck}
            title="Tracking obligatorio en foráneo"
            description="No deja cambiar el estatus a 'Enviado' / 'Entregado' sin guía de paquetería."
            enabled={form.force_tracking_foraneo}
            onToggle={(v) => patch({ force_tracking_foraneo: v })}
          />
        </Block>

        {/* SEGURIDAD FINANCIERA */}
        <Block title="Seguridad financiera" icon={ShieldAlert}>
          <RuleRow
            icon={Wallet}
            title="Ventas de alto valor"
            description="Pide confirmación extra del admin para ventas que superen el monto."
            enabled={form.high_value_enabled}
            onToggle={(v) => patch({ high_value_enabled: v })}
          >
            <NumberField
              label="Monto"
              value={form.high_value_threshold}
              onChange={(v) => patch({ high_value_threshold: v })}
              prefix="$"
              min={0}
              step={100}
            />
          </RuleRow>

          <RuleRow
            icon={Wallet}
            title="Apartado con anticipo mínimo"
            description="Exige que el anticipo sea al menos un % del total del apartado."
            enabled={form.min_layaway_enabled}
            onToggle={(v) => patch({ min_layaway_enabled: v })}
          >
            <NumberField
              label="Anticipo"
              value={form.min_layaway_percent}
              onChange={(v) => patch({ min_layaway_percent: v })}
              suffix="%"
              min={0}
              max={100}
            />
          </RuleRow>
        </Block>

        {/* CANCELACIONES Y DEVOLUCIONES */}
        <Block title="Cancelaciones y devoluciones" icon={Ban}>
          <RuleRow
            icon={Clock}
            title="Período de gracia para cancelar"
            description="Pasados estos días desde el apartado, ya no se puede cancelar."
            enabled={form.cancellation_grace_enabled}
            onToggle={(v) => patch({ cancellation_grace_enabled: v })}
          >
            <NumberField
              label="Días"
              value={form.cancellation_grace_days}
              onChange={(v) => patch({ cancellation_grace_days: v })}
              suffix="d"
              min={0}
              max={90}
            />
          </RuleRow>

          <RuleRow
            icon={XCircle}
            title="Bloquear cancelación con pagos"
            description="Una vez recibido el primer pago, congela la posibilidad de cancelar pasadas N horas."
            enabled={form.no_cancel_after_payment_enabled}
            onToggle={(v) => patch({ no_cancel_after_payment_enabled: v })}
          >
            <NumberField
              label="Horas"
              value={form.no_cancel_after_payment_hours}
              onChange={(v) => patch({ no_cancel_after_payment_hours: v })}
              suffix="h"
              min={0}
              max={720}
            />
          </RuleRow>

          <RuleRow
            icon={Ban}
            title="Sin devoluciones en efectivo"
            description="Las cancelaciones se reconvierten en nota de crédito interna, nunca dinero en efectivo."
            enabled={form.no_refund}
            onToggle={(v) => patch({ no_refund: v })}
          />
        </Block>

        {/* INVENTARIO Y CONTROL DE APARTADOS */}
        <Block title="Inventario y control de apartados" icon={Package}>
          <RuleRow
            icon={Bookmark}
            title="Tope de apartados por cliente"
            description="Si un cliente ya tiene N apartados pendientes, no podrá crear otro hasta liquidar."
            enabled={form.max_layaways_enabled}
            onToggle={(v) => patch({ max_layaways_enabled: v })}
          >
            <NumberField
              label="Máximo"
              value={form.max_layaways_per_client}
              onChange={(v) => patch({ max_layaways_per_client: v })}
              min={1}
              max={20}
            />
          </RuleRow>

          <RuleRow
            icon={Layers}
            title="Alerta automática de stock bajo"
            description="Notifica al admin cuando una variante baja del umbral configurado."
            enabled={form.stock_alert_enabled}
            onToggle={(v) => patch({ stock_alert_enabled: v })}
          >
            <NumberField
              label="Piezas"
              value={form.stock_alert_threshold}
              onChange={(v) => patch({ stock_alert_threshold: v })}
              suffix="pz"
              min={0}
              max={100}
            />
          </RuleRow>

          <RuleRow
            icon={Lock}
            title="Bloquear edición tras cerrar ciclo"
            description="Después de cerrar el ciclo de inventario del mes, los pedidos viejos no se pueden modificar."
            enabled={form.lock_edit_when_cycle_closed}
            onToggle={(v) => patch({ lock_edit_when_cycle_closed: v })}
          />
        </Block>
      </div>

      {/* SAVE STICKY */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="sticky bottom-3 mt-6 z-20"
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full h-12 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Aplicar políticas
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ════════════════════════ Sub-componentes ════════════════════════ */

function Block({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof ScrollText
  children: React.ReactNode
}) {
  return (
    <section className="surface-card p-4">
      <header className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icon size={14} />
        </div>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
          {title}
        </h3>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function RuleRow({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: typeof ScrollText
  title: string
  description: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="surface-soft p-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 shrink-0">
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight">
            {title}
          </p>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
            {description}
          </p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      <AnimatePresence initial={false}>
        {enabled && children && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 pl-12">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="relative inline-flex items-center">
        {prefix && (
          <span className="absolute left-2 text-[10px] font-black text-slate-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`h-9 w-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${
            prefix ? "pl-5" : "pl-2"
          } ${suffix ? "pr-7" : "pr-2"}`}
        />
        {suffix && (
          <span className="absolute right-2 text-[10px] font-black text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

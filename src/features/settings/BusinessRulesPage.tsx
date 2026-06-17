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
  Crown,
  PartyPopper,
  PackageX,
  AlertCircle,
  CalendarClock,
  Sun,
  MessageSquare,
  Heart,
  Camera,
  Star,
  ToggleRight,
} from "lucide-react"
import toast from "react-hot-toast"

import PageHeader from "../../components/ui/PageHeader"
import Toggle from "../../components/ui/Toggle"
import { confirmAction } from "../../lib/confirm"
import { formatMoney } from "../../lib/format"
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

  async function handleReset() {
    if (
      !(await confirmAction({
        title: "¿Restaurar valores por defecto?",
        description:
          "Se restaurarán todas las reglas de negocio a sus valores originales.",
        confirmLabel: "Sí, restaurar",
        tone: "primary",
      }))
    )
      return
    setForm(DEFAULT_RULES)
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(live)

  return (
    <div className="relative max-w-3xl mx-auto pb-32">
      {/* Orbs decorativos consistentes con otros modulos */}
      <span className="deco-orb deco-orb-violet top-10 -left-16 w-64 h-64" />
      <span className="deco-orb deco-orb-pink top-32 -right-16 w-72 h-72" />

      <PageHeader
        icon={ScrollText}
        iconTone="primary"
        title="Políticas del negocio"
        subtitle="Reglas que aplican a todos los pedidos y al cliente"
        right={
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="h-9 px-3 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest shadow-sm hover:shadow-md flex items-center gap-1.5 press"
          >
            <RotateCcw size={11} /> Restaurar
          </button>
        }
      />

      {/* LOGÍSTICA Y RECLAMACIONES */}
      <Section icon={<Truck size={14} />} title="Logística y reclamaciones" subtitle="Tracking obligatorio, ventana de quejas">
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
      </Section>

      {/* SEGURIDAD FINANCIERA */}
      <Section icon={<ShieldAlert size={14} />} title="Seguridad financiera" subtitle="Confirmaciones, anticipos">
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
          <Hint>Actual: {formatMoney(form.high_value_threshold)}</Hint>
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

        <RuleRow
          icon={AlertCircle}
          title="Alerta diaria de saldo pendiente"
          description="Avisa al admin en Dashboard cuando 'por cobrar' del día supere el umbral."
          enabled={form.daily_pending_alert_enabled}
          onToggle={(v) => patch({ daily_pending_alert_enabled: v })}
        >
          <NumberField
            label="Umbral"
            value={form.daily_pending_alert_threshold}
            onChange={(v) => patch({ daily_pending_alert_threshold: v })}
            prefix="$"
            min={0}
            step={100}
          />
          <Hint>Te alerta si el pendiente del día rebasa este monto</Hint>
        </RuleRow>
      </Section>

      {/* CANCELACIONES Y DEVOLUCIONES */}
      <Section icon={<Ban size={14} />} title="Cancelaciones y devoluciones" subtitle="Reglas para cerrar ventas">
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
          icon={Crown}
          title="Gracia extra para clientes VIP"
          description="Suma días al período de gracia para clientes con tier RFM = VIP."
          enabled={form.vip_extra_grace_enabled}
          onToggle={(v) => patch({ vip_extra_grace_enabled: v })}
        >
          <NumberField
            label="Días extra"
            value={form.vip_extra_grace_days}
            onChange={(v) => patch({ vip_extra_grace_days: v })}
            suffix="d"
            min={0}
            max={30}
          />
          <Hint>
            VIP tendrá {form.cancellation_grace_days + form.vip_extra_grace_days} días totales para cancelar
          </Hint>
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

        <RuleRow
          icon={CalendarClock}
          title="Auto-cancelar apartados sin abono"
          description="Cancela automáticamente los apartados sin un solo pago después de N días."
          enabled={form.auto_cancel_idle_enabled}
          onToggle={(v) => patch({ auto_cancel_idle_enabled: v })}
        >
          <NumberField
            label="Días"
            value={form.auto_cancel_idle_days}
            onChange={(v) => patch({ auto_cancel_idle_days: v })}
            suffix="d"
            min={1}
            max={90}
          />
          <Hint>Libera stock atorado por apartados fantasma</Hint>
        </RuleRow>
      </Section>

      {/* PROMOS Y EXPERIENCIA DEL CLIENTE */}
      <Section icon={<PartyPopper size={14} />} title="Promos y experiencia" subtitle="Descuentos automáticos, mensajes en tickets">
        <RuleRow
          icon={PartyPopper}
          title="Descuento automático por volumen"
          description="Sugiere descuento al admin cuando el carrito alcanza X piezas."
          enabled={form.auto_discount_enabled}
          onToggle={(v) => patch({ auto_discount_enabled: v })}
        >
          <div className="flex flex-wrap items-center gap-2">
            <NumberField
              label="Mínimo piezas"
              value={form.auto_discount_min_items}
              onChange={(v) => patch({ auto_discount_min_items: v })}
              suffix="pz"
              min={2}
              max={100}
            />
            <NumberField
              label="Descuento"
              value={form.auto_discount_percent}
              onChange={(v) => patch({ auto_discount_percent: v })}
              suffix="%"
              min={1}
              max={50}
            />
          </div>
          <Hint>
            Carritos de {form.auto_discount_min_items}+ piezas → {form.auto_discount_percent}% de descuento sugerido
          </Hint>
        </RuleRow>

        <RuleRow
          icon={MessageSquare}
          title="Mensaje personalizado en ticket"
          description="Aparece debajo de los productos en el ticket del cliente (promo, agradecimiento, redes sociales)."
          enabled={form.custom_ticket_message_enabled}
          onToggle={(v) => patch({ custom_ticket_message_enabled: v })}
        >
          <textarea
            value={form.custom_ticket_message}
            onChange={(e) => patch({ custom_ticket_message: e.target.value })}
            rows={2}
            maxLength={200}
            placeholder="Ej. ¡Gracias por tu compra! Síguenos @beautysme"
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-[12px] font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none transition-all"
          />
          <p className="text-[9px] font-bold text-slate-400 text-right mt-1">
            {form.custom_ticket_message.length}/200
          </p>
        </RuleRow>

        <RuleRow
          icon={Sun}
          title="Horario de la tienda online"
          description="Bloquea el carrito del cliente fuera del horario. El admin sigue trabajando siempre."
          enabled={form.business_hours_enabled}
          onToggle={(v) => patch({ business_hours_enabled: v })}
        >
          <div className="flex flex-wrap items-center gap-2">
            <TimeField
              label="Abre"
              value={form.business_hours_open}
              onChange={(v) => patch({ business_hours_open: v })}
            />
            <TimeField
              label="Cierra"
              value={form.business_hours_close}
              onChange={(v) => patch({ business_hours_close: v })}
            />
          </div>
          <Hint>Los clientes verán un mensaje "vuelve mañana" fuera de horario</Hint>
        </RuleRow>
      </Section>

      {/* INVENTARIO Y CONTROL DE APARTADOS */}
      <Section icon={<Package size={14} />} title="Inventario y control" subtitle="Stock, apartados, ciclos">
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
          icon={PackageX}
          title="Bloquear venta sin stock"
          description="Cuando el stock = 0, NO permite agregar al carrito. Apagado = permite pre-orden."
          enabled={form.block_oversell}
          onToggle={(v) => patch({ block_oversell: v })}
        />

        <RuleRow
          icon={Lock}
          title="Bloquear edición tras cerrar ciclo"
          description="Después de cerrar el ciclo de inventario del mes, los pedidos viejos no se pueden modificar."
          enabled={form.lock_edit_when_cycle_closed}
          onToggle={(v) => patch({ lock_edit_when_cycle_closed: v })}
        />
      </Section>

      {/* MÓDULOS DEL CLIENTE */}
      <Section
        icon={<ToggleRight size={14} />}
        title="Módulos del cliente"
        subtitle="Activa o desactiva secciones completas de la tienda"
      >
        <RuleRow
          icon={Heart}
          title="Mis deseos / Sugerencias"
          description="El cliente puede pedir productos (con foto, talla, modelo) que quiere que tengas. Aparece como FAB en la tienda y pestaña en el dock."
          enabled={form.wishes_enabled}
          onToggle={(v) => patch({ wishes_enabled: v })}
        />

        <RuleRow
          icon={Camera}
          title="Stories del día"
          description="Mari sube 3-5 fotos diarias estilo Instagram dentro de la tienda. El cliente las ve al abrir. (Pendiente de implementar)"
          enabled={form.stories_enabled}
          onToggle={(v) => patch({ stories_enabled: v })}
        />

        <RuleRow
          icon={Star}
          title="Reseñas con foto"
          description="Los clientes suben reseñas con foto del producto. Mari aprueba antes de publicar. Vista compacta dentro de cada producto. (Pendiente de implementar)"
          enabled={form.reviews_enabled}
          onToggle={(v) => patch({ reviews_enabled: v })}
        />
      </Section>

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
              className="w-full h-12 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-60 press-hard"
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

/* ════════════════════════ Sub-componentes ════════════════════════
 * Homogéneos con SettingsPage.Section (icono chip + título + subtítulo)
 * ═════════════════════════════════════════════════════════════════ */

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-5 mb-4 space-y-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </motion.section>
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
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 hover:border-primary/30 dark:hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
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
        <Toggle checked={enabled} onChange={onToggle} label={title} />
      </div>
      <AnimatePresence initial={false}>
        {enabled && children && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 pl-12 space-y-1.5">{children}</div>
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
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="relative inline-flex items-center">
        {prefix && (
          <span className="absolute left-2 text-[10px] font-black text-slate-400 dark:text-slate-500">
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
          className={`h-9 w-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-slate-900 dark:text-slate-100 ${
            prefix ? "pl-5" : "pl-2"
          } ${suffix ? "pr-7" : "pr-2"}`}
        />
        {suffix && (
          <span className="absolute right-2 text-[10px] font-black text-slate-400 dark:text-slate-500">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-slate-900 dark:text-slate-100"
      />
    </label>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold text-primary/80 italic">{children}</p>
  )
}

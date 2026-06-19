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
  Zap,
  CheckCircle2,
  ThumbsUp,
  UserMinus,
  Palette,
  Moon,
  Sparkles,
  Eye,
  EyeOff,
  Users,
  Phone,
  ImagePlus,
  Megaphone,
  Tag,
  Trash2,
  Plus,
  GripVertical,
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
  type WelcomeSlide,
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

      {/* Mini-guía para que Mari sepa cómo leer la página:
          - Chip verde "Activo" / gris "Pausado" indica si la regla está
            funcionando ahora mismo.
          - Chip de color indica a quién le afecta (cliente, admin, etc.).
          - Cuando hay valores extra (días, monto, %), se despliegan al
            prender el toggle. */}
      <div className="mb-4 rounded-2xl bg-gradient-to-br from-primary/8 to-violet-500/8 dark:from-primary/15 dark:to-violet-500/15 border border-primary/15 dark:border-primary/25 p-3 flex items-start gap-2.5">
        <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 text-[10px] font-black">
          ?
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-tight">
            ¿Cómo leer esta página?
          </p>
          <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-snug mt-0.5">
            Cada regla tiene un chip{" "}
            <span className="px-1 py-0 rounded bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase">
              Activo
            </span>{" "}
            o{" "}
            <span className="px-1 py-0 rounded bg-slate-200 text-slate-500 text-[9px] font-black uppercase">
              Pausado
            </span>{" "}
            según el switch. El chip de color de al lado indica a quién afecta
            (cliente, admin, tienda online). Toca el switch para prender/apagar
            y, si la regla tiene parámetros (días, monto, %), aparecerán
            debajo.
          </p>
        </div>
      </div>

      {/* LOGÍSTICA Y RECLAMACIONES */}
      <Section icon={<Truck size={14} />} title="Logística y reclamaciones" subtitle="Tracking obligatorio, ventana de quejas">
        <RuleRow
          icon={Clock}
          title="Ventana de reclamación"
          description="El cliente puede reportar un producto dañado solo durante las primeras N horas después de recibirlo. Pasado ese tiempo, el botón se bloquea."
          affects="cliente"
          example="Ej: con 48h, después de 2 días ya no puede reclamar."
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
          description="Para pedidos foráneos, debes capturar la guía de paquetería antes de marcar como ‘Enviado’ o ‘Entregado’. Evita que cierres pedidos sin tener el rastreo."
          affects="admin"
          todo
          enabled={form.force_tracking_foraneo}
          onToggle={(v) => patch({ force_tracking_foraneo: v })}
        />
      </Section>

      {/* SEGURIDAD FINANCIERA */}
      <Section icon={<ShieldAlert size={14} />} title="Seguridad financiera" subtitle="Confirmaciones, anticipos">
        <RuleRow
          icon={Wallet}
          title="Ventas de alto valor"
          description="Cuando una venta pasa del monto que pongas, te pide doble confirmación antes de cerrarla. Útil para evitar cobros erróneos enormes."
          affects="admin"
          example="Ej: con $5,000, una venta de $6,200 te pedirá ‘¿Seguro?’."
          todo
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
          description="No se puede crear un apartado si el primer abono es menor al porcentaje que defines del total. Así evitas apartados ‘fantasma’."
          affects="admin"
          example="Ej: con 20%, un apartado de $1,000 necesita al menos $200 de anticipo."
          todo
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
          description="Aparece un aviso en el Dashboard cuando lo que te deben hoy supera el umbral. Así no se te van apartados sin cobrar."
          affects="admin"
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
          description="El admin puede cancelar un apartado dentro de los primeros N días. Pasado ese plazo, el botón se bloquea (no se borra dinero ya cobrado)."
          affects="admin"
          example="Ej: con 7 días, un apartado del 1° ya no se cancela el día 9."
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
          description="A los clientes con badge VIP (los que más te compran) les das días adicionales para cancelar respecto al período normal."
          affects="cliente"
          todo
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
          icon={Crown}
          title="Auto-tag VIP por gasto mensual"
          description="Si un cliente gasta más del umbral en los últimos 30 días, se le marca como VIP automáticamente y le aparecen precios de mayoreo."
          affects="cliente"
          example="Ej: con $3,000/mes, un cliente que gastó $3,500 ya ve precios VIP."
          todo
          enabled={form.auto_vip_enabled}
          onToggle={(v) => patch({ auto_vip_enabled: v })}
        >
          <NumberField
            label="Umbral mensual"
            value={form.auto_vip_monthly_threshold}
            onChange={(v) => patch({ auto_vip_monthly_threshold: v })}
            prefix="$"
            min={500}
            step={500}
          />
        </RuleRow>

        <RuleRow
          icon={XCircle}
          title="Bloquear cancelación con pagos"
          description="Una vez que el cliente abonó algo, no puedes cancelar pasadas N horas desde ese primer pago. Te obliga a contactarlo en lugar de borrar el apartado."
          affects="admin"
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
          description="Si necesitas regresar dinero, lo conviertes en nota de crédito (saldo a favor para una compra futura) en vez de regresar efectivo. Protege tu caja."
          affects="todos"
          todo
          enabled={form.no_refund}
          onToggle={(v) => patch({ no_refund: v })}
        />

        <RuleRow
          icon={CalendarClock}
          title="Auto-cancelar apartados sin abono"
          description="Si un apartado se queda sin un solo pago durante más de N días, se cancela solo y libera el stock para que otros clientes puedan comprarlo."
          affects="admin"
          todo
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
          description="Cuando un cliente arma un carrito grande, la app te sugiere un descuento. Tú decides aplicarlo o no en el momento de cerrar la venta."
          affects="admin"
          todo
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
          description="Aparece debajo de los productos en el ticket que recibe el cliente. Útil para agradecer, anunciar promos o pedir que te sigan en redes."
          affects="cliente"
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
          description="Fuera de este horario, el cliente no puede agregar al carrito (ve un mensaje ‘vuelve mañana’). Tú sigues trabajando normal desde Admin."
          affects="tienda"
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
          description="Si un cliente ya tiene varios apartados sin liquidar, no podrá hacer más hasta que pague o cierre alguno. Evita que se acumulen apartados de un mismo comprador."
          affects="cliente"
          example="Ej: con tope 3, su 4° apartado queda bloqueado."
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
          description="Cuando una variante baja del umbral, te llega una notificación para que reabastezcas antes de quedarte sin existencias."
          affects="admin"
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
          description="Si una variante está en 0, el cliente no puede agregarla al carrito. Si lo apagas, permite pre-orden (vende sin tener físicamente la pieza)."
          affects="cliente"
          todo
          enabled={form.block_oversell}
          onToggle={(v) => patch({ block_oversell: v })}
        />

        <RuleRow
          icon={Lock}
          title="Bloquear edición tras cerrar ciclo"
          description="Cuando cierras el ciclo del mes (en Módulo Ciclos), los pedidos de ese mes quedan congelados: no se pueden editar precios, cantidades ni borrar. Garantiza que las cifras del corte no se alteren después."
          affects="admin"
          todo
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
          description="El cliente puede mandarte una lista de cosas que quisiera ver en la tienda (con foto, talla, link, etc.). Aparece como pestaña en su nav y un botón flotante."
          affects="cliente"
          enabled={form.wishes_enabled}
          onToggle={(v) => patch({ wishes_enabled: v })}
        />

        <RuleRow
          icon={Camera}
          title="Stories del día"
          description="Subes fotos cortas (estilo Instagram) que el cliente ve al abrir la tienda. Se borran solas en 24h. Bueno para mostrar recién llegados o promos del día."
          affects="tienda"
          enabled={form.stories_enabled}
          onToggle={(v) => patch({ stories_enabled: v })}
        />

        <RuleRow
          icon={Star}
          title="Reseñas con foto"
          description="Los clientes dejan reseñas con foto del producto recibido. Tú las apruebas antes de que aparezcan públicas (a menos que actives auto-aprobar abajo)."
          affects="todos"
          enabled={form.reviews_enabled}
          onToggle={(v) => patch({ reviews_enabled: v })}
        />
      </Section>

      {/* ════════════ MODO DIRECTO (sin moderación) ════════════ */}
      <Section
        icon={<Zap size={14} />}
        title="Modo directo"
        subtitle="Operar sin moderar nada — todo entra automático"
      >
        <RuleRow
          icon={Zap}
          title="Activar modo directo (macro)"
          description="Atajo: prende los 3 auto-aprueba de un golpe (comprobantes + reseñas + sugerencias). Lo apagas y vuelves a moderar todo manual."
          affects="todos"
          enabled={form.direct_mode_enabled}
          onToggle={(v) =>
            patch({
              direct_mode_enabled: v,
              auto_approve_proofs: v,
              auto_approve_reviews: v,
              auto_accept_wishes: v,
            })
          }
        />

        <RuleRow
          icon={CheckCircle2}
          title="Auto-aprobar comprobantes de pago"
          description="Cuando el cliente sube su captura de transferencia, queda APROBADO al instante y el pago se aplica al balance. ⚠️ Riesgo de fraude — úsalo solo con clientes verificados."
          enabled={form.auto_approve_proofs}
          onToggle={(v) => patch({ auto_approve_proofs: v })}
        />

        <RuleRow
          icon={ThumbsUp}
          title="Auto-aprobar reseñas con foto"
          description="Las reseñas que dejan los clientes se publican directo sin que las revises. Si tienes ‘Reseñas con foto’ apagada arriba, esto no aplica."
          affects="tienda"
          enabled={form.auto_approve_reviews}
          onToggle={(v) => patch({ auto_approve_reviews: v })}
        />

        <RuleRow
          icon={Heart}
          title="Auto-aceptar sugerencias / wishes"
          description="Las cosas que el cliente te pide entran como aceptadas en lugar de pendientes. Sirve cuando quieres mostrarles rápido que tomas en cuenta su sugerencia."
          affects="cliente"
          enabled={form.auto_accept_wishes}
          onToggle={(v) => patch({ auto_accept_wishes: v })}
        />

        <RuleRow
          icon={UserMinus}
          title="Cliente puede cancelar su apartado"
          description="Desde su ticket público, el cliente puede cancelar su apartado sin pedirte permiso. Igual respeta el período de gracia que configuraste arriba."
          affects="cliente"
          enabled={form.client_can_self_cancel}
          onToggle={(v) => patch({ client_can_self_cancel: v })}
        />
      </Section>

      {/* ════════════ APARIENCIA Y TEMA ════════════ */}
      <Section
        icon={<Palette size={14} />}
        title="Apariencia"
        subtitle="Cambia el color, modo claro/oscuro y modos festivos"
      >
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
              <Palette size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight">
                Color principal de la marca
              </p>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                Cambia el tono de botones, badges activos y elementos
                destacados de toda la app.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {(["pink", "violet", "rose", "amber", "emerald", "sky", "indigo"] as const).map(
              (color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => patch({ theme_accent: color })}
                  aria-label={ACCENT_LABELS[color]}
                  title={ACCENT_LABELS[color]}
                  className={`relative h-12 rounded-xl ring-2 transition-all ${
                    form.theme_accent === color
                      ? "ring-slate-900 dark:ring-white scale-105"
                      : "ring-transparent hover:ring-slate-300"
                  }`}
                  style={{
                    background: ACCENT_PREVIEW[color],
                  }}
                >
                  {form.theme_accent === color && (
                    <CheckCircle2
                      size={14}
                      className="absolute inset-0 m-auto text-white drop-shadow"
                    />
                  )}
                </button>
              ),
            )}
          </div>
          <p className="text-[9px] font-bold text-slate-400 text-center mt-2 italic">
            Actual: {ACCENT_LABELS[form.theme_accent]}
          </p>
        </div>

        <RuleRow
          icon={Moon}
          title="Forzar modo oscuro"
          description="La app aparece en oscuro para todos sin importar lo que cada uno tenga elegido. Ideal para fechas como Halloween, Black Friday o lanzamientos nocturnos."
          affects="todos"
          enabled={form.force_dark_mode}
          onToggle={(v) => patch({ force_dark_mode: v })}
        />

        <RuleRow
          icon={Sparkles}
          title="Modo festivo"
          description="Aparecen confettis en el header de la tienda + el nombre del evento al lado del logo. Para Navidad, Buen Fin, San Valentín, etc."
          affects="tienda"
          enabled={form.holiday_mode_enabled}
          onToggle={(v) => patch({ holiday_mode_enabled: v })}
        >
          <TextField
            label="Nombre del evento"
            value={form.holiday_mode_name}
            onChange={(v) => patch({ holiday_mode_name: v })}
            placeholder="Ej. Navidad 2026 · Buen Fin"
            maxLength={40}
          />
          <TextField
            label="Emoji"
            value={form.holiday_mode_emoji}
            onChange={(v) => patch({ holiday_mode_emoji: v })}
            placeholder="🎄"
            maxLength={4}
          />
        </RuleRow>
      </Section>

      {/* ════════════ EXPERIENCIA DEL CLIENTE ════════════ */}
      <Section
        icon={<Sparkles size={14} />}
        title="Experiencia del cliente"
        subtitle="Detalles que cambian cómo se ve y se siente la tienda"
      >
        <RuleRow
          icon={Eye}
          title="Mostrar stock al cliente"
          description="El cliente ve ‘Solo quedan 3’ en cada producto y crea urgencia para comprar ya. Si lo apagas, sólo verá ‘Agotado’ cuando llegue a cero."
          affects="cliente"
          enabled={form.show_stock_to_client}
          onToggle={(v) => patch({ show_stock_to_client: v })}
        >
          <TextField
            label="Etiqueta de urgencia"
            value={form.low_stock_label}
            onChange={(v) => patch({ low_stock_label: v })}
            placeholder="Apúrate, solo quedan"
            maxLength={40}
          />
        </RuleRow>

        <RuleRow
          icon={Users}
          title="Mostrar 'X personas viendo esto'"
          description="En cada producto aparece un contador pequeño de ‘gente viéndolo’. Es psicológico (no es tracking real, son números estables entre 2 y 8). Sirve para generar prueba social."
          affects="cliente"
          todo
          enabled={form.fake_viewers_enabled}
          onToggle={(v) => patch({ fake_viewers_enabled: v })}
        />

        <RuleRow
          icon={PartyPopper}
          title="Confetti al comprar"
          description="Animación de celebración al cerrar una venta o aprobar un comprobante. Apágalo si prefieres una experiencia más seria."
          affects="todos"
          enabled={form.confetti_on_purchase}
          onToggle={(v) => patch({ confetti_on_purchase: v })}
        />

        <RuleRow
          icon={EyeOff}
          title="Ocultar precios sin sesión"
          description="Los visitantes no ven precios hasta que inician sesión. Sirve para B2B o mayoreo. ⚠️ Reduce el ‘browsing casual’ pero captura emails."
          affects="tienda"
          todo
          enabled={form.hide_prices_until_login}
          onToggle={(v) => patch({ hide_prices_until_login: v })}
        />

        <RuleRow
          icon={Phone}
          title="Pedir teléfono antes de comprar"
          description="Si el cliente no tiene teléfono en su perfil, se lo pide en el carrito justo antes de cerrar la venta. Así siempre tienes cómo contactarlo para la entrega."
          affects="cliente"
          todo
          enabled={form.require_phone_to_buy}
          onToggle={(v) => patch({ require_phone_to_buy: v })}
        />

        {/* Configuración de etiquetas automáticas (NUEVO, OFERTA).
            Antes estaban hardcoded en el código (7 días para Nuevo,
            5% mínimo para Oferta). Ahora Mari puede ajustarlas desde
            aquí sin que un dev tenga que tocar nada. */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
              <Sparkles size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight">
                Etiquetas automáticas en cards
              </p>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                Cuánto tiempo se muestra el chip rosa “NUEVO” en un
                producto y qué tan grande tiene que ser el descuento para
                que aparezca el chip “OFERTA”.
              </p>
            </div>
          </div>
          <div className="pl-12 space-y-2">
            <NumberField
              label="Días que un producto es ‘Nuevo’"
              value={form.new_badge_days}
              onChange={(v) => patch({ new_badge_days: v })}
              suffix="d"
              min={1}
              max={90}
            />
            <Hint>
              Después de {form.new_badge_days} día{form.new_badge_days === 1 ? "" : "s"} desde que lo creas, el chip desaparece solo.
            </Hint>
            <NumberField
              label="Descuento mínimo para etiqueta ‘OFERTA’"
              value={form.offer_min_discount_pct}
              onChange={(v) => patch({ offer_min_discount_pct: v })}
              suffix="%"
              min={0}
              max={50}
            />
            <Hint>
              Si un producto tiene menos de {form.offer_min_discount_pct}% de descuento, no se etiqueta como oferta (evita ruido de descuentos diminutos).
            </Hint>
          </div>
        </div>
      </Section>

      {/* ════════════ MENSAJES PERSONALIZADOS ════════════ */}
      <Section
        icon={<Megaphone size={14} />}
        title="Mensajes en la tienda"
        subtitle="Edita textos visibles para el cliente: slides, banners, ticket"
      >
        <RuleRow
          icon={MessageSquare}
          title="Mensaje personalizado en ticket"
          description="Aparece debajo de los productos en el ticket que recibe el cliente. Ideal para agradecimientos, instrucciones o promos."
          affects="cliente"
          enabled={form.custom_ticket_message_enabled}
          onToggle={(v) => patch({ custom_ticket_message_enabled: v })}
        >
          <TextField
            label="Mensaje"
            value={form.custom_ticket_message}
            onChange={(v) => patch({ custom_ticket_message: v })}
            placeholder="¡Gracias por tu compra! Síguenos en Instagram"
            maxLength={200}
          />
        </RuleRow>

        <RuleRow
          icon={ImagePlus}
          title="Banner anclado en la tienda"
          description="Aparece una franja arriba de la tienda visible para todos. Útil para avisos rápidos: ‘Cerrado por inventario el 25’, ‘Hoy envío gratis’, etc."
          affects="tienda"
          enabled={form.pinned_banner_enabled}
          onToggle={(v) => patch({ pinned_banner_enabled: v })}
        >
          <TextField
            label="Texto del banner"
            value={form.pinned_banner_message}
            onChange={(v) => patch({ pinned_banner_message: v })}
            placeholder="🚚 Envío GRATIS hoy en compras desde $500"
            maxLength={140}
          />
          <div className="flex items-center gap-1.5 pt-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">
              Tono:
            </span>
            {(
              [
                ["info", "Info", "bg-sky-500"],
                ["warn", "Aviso", "bg-amber-500"],
                ["success", "Éxito", "bg-emerald-500"],
                ["promo", "Promo", "bg-fuchsia-500"],
              ] as const
            ).map(([id, label, bg]) => (
              <button
                key={id}
                type="button"
                onClick={() => patch({ pinned_banner_tone: id })}
                className={`h-6 px-2.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white ${bg} ${
                  form.pinned_banner_tone === id
                    ? "ring-2 ring-offset-1 ring-slate-700 dark:ring-white"
                    : "opacity-60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </RuleRow>

        <RuleRow
          icon={Tag}
          title="Personalizar slides de bienvenida"
          description="Los mensajes rotantes que el cliente ve al abrir la tienda. Si lo apagas, se usan los slides predeterminados de Beauty’s Me."
          affects="tienda"
          enabled={form.welcome_slides_enabled}
          onToggle={(v) => patch({ welcome_slides_enabled: v })}
        >
          <WelcomeSlidesEditor
            slides={form.welcome_slides}
            onChange={(slides) => patch({ welcome_slides: slides })}
          />
        </RuleRow>
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
  affects,
  example,
  todo,
}: {
  icon: typeof ScrollText
  title: string
  description: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children?: React.ReactNode
  /** Quién ve / sufre el cambio: cliente, admin, tienda online, etc. */
  affects?: "cliente" | "admin" | "tienda" | "todos"
  /** Mini-frase opcional con un ejemplo concreto del resultado. */
  example?: string
  /**
   * Si la regla aún no tiene comportamiento real en el código (solo guarda
   * la preferencia, pero no afecta nada). Mostramos chip "En desarrollo"
   * para no engañar a Mari sobre lo que ya funciona vs lo que es promesa.
   */
  todo?: boolean
}) {
  // Mapeo de "afecta a" → color + label visual
  const AFFECTS_META: Record<
    NonNullable<typeof affects>,
    { label: string; cls: string }
  > = {
    cliente: {
      label: "Cliente",
      cls:
        "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    },
    admin: {
      label: "Admin",
      cls:
        "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    },
    tienda: {
      label: "Tienda online",
      cls:
        "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
    },
    todos: {
      label: "Todos",
      cls:
        "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
    },
  }
  const affectsMeta = affects ? AFFECTS_META[affects] : null

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 hover:border-primary/30 dark:hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight">
              {title}
            </p>
            {/* Chip de estado vivo: el admin sabe de un vistazo si está
                actuando o no, sin tener que leer todo el toggle. */}
            <span
              className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none ${
                enabled
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400"
              }`}
            >
              {enabled ? "Activo" : "Pausado"}
            </span>
            {affectsMeta && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none ${affectsMeta.cls}`}
                title={`Afecta a: ${affectsMeta.label}`}
              >
                {affectsMeta.label}
              </span>
            )}
            {todo && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest leading-none bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                title="La preferencia se guarda, pero el comportamiento aún no está implementado en la app. Pronto."
              >
                🚧 En desarrollo
              </span>
            )}
          </div>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-1">
            {description}
          </p>
          {example && (
            <p className="text-[10px] font-bold text-primary/80 dark:text-primary/90 leading-snug mt-1 italic">
              {example}
            </p>
          )}
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

/* ════════════════════ Componentes nuevos ════════════════════ */

/**
 * Mapa de preview visual de cada accent. Se usa solo en el page de
 * reglas — la aplicación real del tema vive en `applyAccent()` (lib/applyTheme.ts)
 * que actualiza --brand-from / --brand-to en runtime.
 *
 * Cada accent es un BI-COLOR: el preview muestra los dos tonos del
 * gradient real para que Mari elija con confianza.
 */
const ACCENT_PREVIEW: Record<BusinessRules["theme_accent"], string> = {
  pink: "linear-gradient(135deg,#e6007e,#a855f7)",
  violet: "linear-gradient(135deg,#7c3aed,#ec4899)",
  rose: "linear-gradient(135deg,#e11d48,#f97316)",
  amber: "linear-gradient(135deg,#f59e0b,#dc2626)",
  emerald: "linear-gradient(135deg,#10b981,#0ea5e9)",
  sky: "linear-gradient(135deg,#0ea5e9,#6366f1)",
  indigo: "linear-gradient(135deg,#4f46e5,#06b6d4)",
}

const ACCENT_LABELS: Record<BusinessRules["theme_accent"], string> = {
  pink: "Rosa · Violeta",
  violet: "Violeta · Rosa",
  rose: "Rojo · Naranja",
  amber: "Ámbar · Rojo",
  emerald: "Verde · Azul",
  sky: "Azul · Índigo",
  indigo: "Índigo · Cian",
}

/**
 * Campo de texto genérico para reglas (mensaje, etiqueta, banner).
 * Mantiene look-and-feel con NumberField/TimeField.
 */
function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  multiline?: boolean
}) {
  const remaining = maxLength != null ? maxLength - (value?.length ?? 0) : null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {label}
        </span>
        {remaining != null && (
          <span
            className={`text-[8px] font-bold tabular-nums ${
              remaining < 10 ? "text-amber-500" : "text-slate-400"
            }`}
          >
            {remaining}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-slate-900 dark:text-slate-100 resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-slate-900 dark:text-slate-100"
        />
      )}
    </div>
  )
}

/**
 * Editor de slides de bienvenida. Lista los slides activos y permite
 * agregar/editar/eliminar cada uno. Soporta hasta 6 slides para que
 * el carrusel siga sintiéndose ligero.
 */
const SLIDE_THEMES: { id: WelcomeSlide["theme"]; label: string; gradient: string }[] = [
  { id: "promo", label: "Promo", gradient: "from-fuchsia-500 to-pink-500" },
  { id: "mayoreo", label: "Mayoreo", gradient: "from-amber-500 to-orange-500" },
  { id: "ticket", label: "Ticket", gradient: "from-emerald-500 to-teal-500" },
  { id: "wishes", label: "Wishes", gradient: "from-pink-500 to-purple-500" },
  { id: "stories", label: "Stories", gradient: "from-orange-500 to-rose-500" },
  { id: "reviews", label: "Reseñas", gradient: "from-amber-500 to-pink-500" },
  { id: "bienvenida", label: "Bienvenida", gradient: "from-violet-500 to-fuchsia-500" },
]

const MAX_SLIDES = 6

function WelcomeSlidesEditor({
  slides,
  onChange,
}: {
  slides: WelcomeSlide[]
  onChange: (s: WelcomeSlide[]) => void
}) {
  const updateAt = (i: number, patch: Partial<WelcomeSlide>) => {
    onChange(slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  const removeAt = (i: number) => {
    onChange(slides.filter((_, idx) => idx !== i))
  }
  const add = () => {
    if (slides.length >= MAX_SLIDES) return
    onChange([
      ...slides,
      {
        title: "Nuevo mensaje",
        subtitle: "Subtítulo descriptivo",
        theme: "promo",
      },
    ])
  }
  const moveUp = (i: number) => {
    if (i === 0) return
    const copy = [...slides]
    const [item] = copy.splice(i, 1)
    copy.splice(i - 1, 0, item)
    onChange(copy)
  }
  const moveDown = (i: number) => {
    if (i === slides.length - 1) return
    const copy = [...slides]
    const [item] = copy.splice(i, 1)
    copy.splice(i + 1, 0, item)
    onChange(copy)
  }

  return (
    <div className="flex flex-col gap-2">
      {slides.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-4 text-center">
          <p className="text-[10px] font-bold text-slate-400 leading-snug">
            Aún no has agregado slides personalizados.
            <br />
            Por ahora se ven los slides predeterminados.
          </p>
        </div>
      )}

      {slides.map((s, i) => {
        const theme = SLIDE_THEMES.find((t) => t.id === s.theme) ?? SLIDE_THEMES[0]
        return (
          <div
            key={i}
            className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 space-y-2"
          >
            {/* Preview mini del slide tal como lo verá el cliente */}
            <div
              className={`rounded-lg bg-gradient-to-br ${theme.gradient} text-white p-2 flex items-center gap-2`}
            >
              <Sparkles size={14} className="opacity-80 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black leading-tight truncate">
                  {s.title || "(sin título)"}
                </p>
                <p className="text-[9px] opacity-90 leading-tight truncate">
                  {s.subtitle || "(sin subtítulo)"}
                </p>
              </div>
            </div>

            <TextField
              label="Título"
              value={s.title}
              onChange={(v) => updateAt(i, { title: v })}
              maxLength={80}
            />
            <TextField
              label="Subtítulo"
              value={s.subtitle}
              onChange={(v) => updateAt(i, { subtitle: v })}
              maxLength={140}
            />

            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                Tema
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SLIDE_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateAt(i, { theme: t.id })}
                    className={`h-7 px-2.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white bg-gradient-to-br ${t.gradient} ${
                      s.theme === t.id
                        ? "ring-2 ring-offset-1 ring-slate-700 dark:ring-white"
                        : "opacity-60"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 disabled:opacity-30 flex items-center justify-center press"
                  title="Subir"
                >
                  <GripVertical size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(i)}
                  disabled={i === slides.length - 1}
                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 disabled:opacity-30 flex items-center justify-center press rotate-180"
                  title="Bajar"
                >
                  <GripVertical size={12} />
                </button>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
                  #{i + 1}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="h-7 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest flex items-center gap-1 press"
              >
                <Trash2 size={11} /> Quitar
              </button>
            </div>
          </div>
        )
      })}

      {slides.length < MAX_SLIDES && (
        <button
          type="button"
          onClick={add}
          className="h-10 rounded-xl border-2 border-dashed border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 press"
        >
          <Plus size={12} /> Agregar slide ({slides.length}/{MAX_SLIDES})
        </button>
      )}
    </div>
  )
}

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Settings as SettingsIcon,
  Store,
  UserCircle,
  Save,
  RotateCcw,
  LogOut,
  Mail,
  Shield,
  Tag,
  Loader2,
  Truck,
  Building2,
  AlertTriangle,
  Trash2,
  Volume2,
  Smartphone,
  PartyPopper,
  Sparkles,
  Calculator,
  Percent,
  Bell,
  BellOff,
  Moon as MoonIcon,
  CheckCircle2,
  ChevronRight,
  Database,
  ShoppingBag,
  Sliders,
} from "lucide-react"
import { toast } from "react-hot-toast"

import { useStoreInfo } from "../../lib/useStoreInfo"
import { useAuth } from "../../lib/useAuth"
import {
  useTierThresholds,
  saveTierThresholds,
  DEFAULT_THRESHOLDS,
} from "../pricing/tierPricingService"
import {
  useShippingConfig,
  saveShippingConfig,
  DEFAULT_SHIPPING,
} from "../pricing/shippingService"
import {
  useBankAccount,
  saveBankAccount,
  DEFAULT_BANK,
} from "./bankAccountService"
import {
  getPricingConfig,
  savePricingConfig,
} from "../pricing/pricingConfigService"
import type { PricingConfig } from "../pricing/pricingTypes"
import {
  resetAppData,
  type ResetReport,
  type ResetCategory,
  CATEGORY_INFO,
  TABLE_LABEL,
} from "./resetAppService"
import StorageUsageCard from "./StorageUsageCard"
import AuditLogCard from "./AuditLogCard"
import PerformanceCard from "./PerformanceCard"
import { confirmAction } from "../../lib/confirm"
import { useUserPrefs } from "../../lib/userPrefs"
import Toggle from "../../components/ui/Toggle"
import PageHeader from "../../components/ui/PageHeader"
import {
  useNotifPrefs,
  NOTIF_CATEGORY_META,
  ALL_CATEGORIES,
  type NotifCategory,
} from "../../lib/notifPrefs"
import { ensurePushPermission, isPushSupported } from "../../lib/pushNative"

export default function SettingsPage() {
  const { info, update, reset } = useStoreInfo()
  const { email, role, fullName, signOut } = useAuth()
  const thresholds = useTierThresholds()

  const [form, setForm] = useState(info)
  const [savingStore, setSavingStore] = useState(false)

  const [tierForm, setTierForm] = useState(thresholds)
  const [savingTier, setSavingTier] = useState(false)
  useEffect(() => setTierForm(thresholds), [thresholds])

  const shipping = useShippingConfig()
  const [shipForm, setShipForm] = useState(shipping)
  const [savingShip, setSavingShip] = useState(false)
  useEffect(() => setShipForm(shipping), [shipping])

  const bank = useBankAccount()
  const [bankForm, setBankForm] = useState(bank)
  const [savingBank, setSavingBank] = useState(false)
  useEffect(() => setBankForm(bank), [bank])

  const isAdmin = role === "admin"

  const handleStoreSave = () => {
    setSavingStore(true)
    update(form)
    setTimeout(() => {
      setSavingStore(false)
      toast.success("Información actualizada")
    }, 200)
  }

  const handleStoreReset = async () => {
    if (!(await confirmAction({
      title: "¿Restaurar valores por defecto?",
      description: "Se restaurarán los umbrales de tier (menudeo / medio / mayoreo) a sus valores originales.",
      confirmLabel: "Sí, restaurar",
      tone: "primary",
    }))) return
    reset()
    toast.success("Restaurado")
  }

  const handleTierSave = async () => {
    if (tierForm.medio_min_qty < 2 || tierForm.mayoreo_min_qty <= tierForm.medio_min_qty) {
      toast.error("Mayoreo debe ser mayor que medio (y medio ≥ 2)")
      return
    }
    setSavingTier(true)
    try {
      await saveTierThresholds(tierForm)
      toast.success("Precios guardados ✓")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar")
    } finally {
      setSavingTier(false)
    }
  }

  const handleShipSave = async () => {
    setSavingShip(true)
    try {
      await saveShippingConfig({
        foreign_cost: Number(shipForm.foreign_cost) || DEFAULT_SHIPPING.foreign_cost,
        free_from:    Number(shipForm.free_from)    || DEFAULT_SHIPPING.free_from,
        local_cost:   Number(shipForm.local_cost)   || 0,
      })
      toast.success("Envíos guardados ✓")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar")
    } finally {
      setSavingShip(false)
    }
  }

  const handleBankSave = async () => {
    setSavingBank(true)
    try {
      await saveBankAccount({ ...DEFAULT_BANK, ...bankForm })
      toast.success("Datos bancarios guardados ✓")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar")
    } finally {
      setSavingBank(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-3 pt-1 pb-28">
      {/* HEADER */}
      <PageHeader
        icon={SettingsIcon}
        title="Configuración"
        subtitle="Información de la tienda y seguridad"
      />

      {/* INFO DE TIENDA */}
      <Section icon={<Store size={14} />} title="Información de la tienda">
        <Field label="Nombre">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="settings-input"
          />
        </Field>
        <Field label="Eslogan">
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            className="settings-input"
          />
        </Field>
        <Field label="Teléfono">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="settings-input"
            placeholder="55 1234 5678"
          />
        </Field>
        <Field label="Dirección">
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="settings-input"
            placeholder="Calle, Col., CDMX"
          />
        </Field>
        <Field label="Mensaje de agradecimiento">
          <input
            type="text"
            value={form.thanks_message}
            onChange={(e) =>
              setForm({ ...form, thanks_message: e.target.value })
            }
            className="settings-input"
          />
        </Field>
        <Field label="Pie del ticket">
          <input
            type="text"
            value={form.footer_note}
            onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
            className="settings-input"
          />
        </Field>

        <div className="flex gap-2 pt-3">
          <button
            onClick={handleStoreSave}
            disabled={savingStore}
            className="flex-1 h-11 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-95 transition-all disabled:opacity-50"
          >
            <Save size={14} /> Guardar
          </button>
          <button
            onClick={handleStoreReset}
            className="h-11 px-4 rounded-xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-200"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </Section>

      {/* PRECIOS POR VOLUMEN — solo admin */}
      {isAdmin && (
        <Section
          icon={<Tag size={14} />}
          title="Precios por volumen"
          subtitle="Cantidad mínima de piezas para desbloquear cada nivel"
        >
          <Field label="Mínimo para precio medio (piezas)">
            <input
              type="number"
              min={2}
              value={tierForm.medio_min_qty}
              onChange={(e) =>
                setTierForm({
                  ...tierForm,
                  medio_min_qty: Number(e.target.value) || DEFAULT_THRESHOLDS.medio_min_qty,
                })
              }
              className="settings-input"
            />
          </Field>
          <Field label="Mínimo para precio mayoreo (piezas)">
            <input
              type="number"
              min={tierForm.medio_min_qty + 1}
              value={tierForm.mayoreo_min_qty}
              onChange={(e) =>
                setTierForm({
                  ...tierForm,
                  mayoreo_min_qty:
                    Number(e.target.value) || DEFAULT_THRESHOLDS.mayoreo_min_qty,
                })
              }
              className="settings-input"
            />
          </Field>
          <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
            Por ej: medio = <b>{tierForm.medio_min_qty}</b>, mayoreo ={" "}
            <b>{tierForm.mayoreo_min_qty}</b>. El cliente verá un aviso en su
            carrito de cuántas piezas le faltan para bajar el precio.
          </p>
          <button
            onClick={handleTierSave}
            disabled={savingTier}
            className="w-full h-11 mt-1 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-95 transition-all disabled:opacity-50"
          >
            {savingTier ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}{" "}
            Guardar precios
          </button>
        </Section>
      )}

      {/* ENVÍOS — solo admin */}
      {isAdmin && (
        <Section
          icon={<Truck size={14} />}
          title="Costos de envío"
          subtitle="Foráneo, local y umbral para envío gratis"
        >
          <Field label="Costo envío foráneo ($)">
            <input
              type="number" min={0} step="0.01"
              value={shipForm.foreign_cost}
              onChange={(e) => setShipForm({ ...shipForm, foreign_cost: Number(e.target.value) })}
              className="settings-input"
            />
          </Field>
          <Field label="Envío foráneo GRATIS desde ($)">
            <input
              type="number" min={0} step="0.01"
              value={shipForm.free_from}
              onChange={(e) => setShipForm({ ...shipForm, free_from: Number(e.target.value) })}
              className="settings-input"
            />
          </Field>
          <Field label="Costo envío local ($) — 0 = gratis">
            <input
              type="number" min={0} step="0.01"
              value={shipForm.local_cost}
              onChange={(e) => setShipForm({ ...shipForm, local_cost: Number(e.target.value) })}
              className="settings-input"
            />
          </Field>
          <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
            Ejemplo: foráneo <b>${shipForm.foreign_cost}</b>; si el carrito ≥{" "}
            <b>${shipForm.free_from}</b>, el envío foráneo es <b>GRATIS</b>.
          </p>
          <button
            onClick={handleShipSave}
            disabled={savingShip}
            className="w-full h-11 mt-1 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-95 disabled:opacity-50"
          >
            {savingShip ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar envíos
          </button>
        </Section>
      )}

      {/* CUENTA BANCARIA — solo admin */}
      {isAdmin && (
        <Section
          icon={<Building2 size={14} />}
          title="Datos para transferencia"
          subtitle="Lo que el cliente verá al subir un comprobante"
        >
          <Field label="Banco">
            <input
              type="text" value={bankForm.bank}
              onChange={(e) => setBankForm({ ...bankForm, bank: e.target.value })}
              className="settings-input" placeholder="Ej. BBVA"
            />
          </Field>
          <Field label="Titular">
            <input
              type="text" value={bankForm.holder}
              onChange={(e) => setBankForm({ ...bankForm, holder: e.target.value })}
              className="settings-input" placeholder="Nombre completo"
            />
          </Field>
          <Field label="CLABE">
            <input
              type="text" inputMode="numeric" value={bankForm.clabe}
              onChange={(e) => setBankForm({ ...bankForm, clabe: e.target.value.replace(/\s/g, "") })}
              className="settings-input" placeholder="18 dígitos"
              maxLength={18}
            />
          </Field>
          <Field label="Tarjeta (opcional)">
            <input
              type="text" inputMode="numeric" value={bankForm.card}
              onChange={(e) => setBankForm({ ...bankForm, card: e.target.value })}
              className="settings-input" placeholder="16 dígitos"
              maxLength={19}
            />
          </Field>
          <Field label="Notas para el cliente (opcional)">
            <input
              type="text" value={bankForm.notes}
              onChange={(e) => setBankForm({ ...bankForm, notes: e.target.value })}
              className="settings-input"
              placeholder="Ej: Anota el folio en el concepto"
            />
          </Field>
          <button
            onClick={handleBankSave}
            disabled={savingBank}
            className="w-full h-11 mt-1 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-95 disabled:opacity-50"
          >
            {savingBank ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar cuenta
          </button>
        </Section>
      )}

      {/* CALCULADORA DE PRECIOS — solo admin */}
      {isAdmin && <PricingPrefsSection />}

      {/* PREFERENCIAS DEL USUARIO */}
      <UserPrefsSection />

      {/* NOTIFICACIONES */}
      <NotifPrefsSection />

      {/* USO DE STORAGE — solo admin (ahorra tropezar con cuotas) */}
      {isAdmin && (
        <div className="mb-4">
          <StorageUsageCard />
        </div>
      )}

      {/* PERFORMANCE EN VIVO — solo admin (ve cómo va la app y la red) */}
      {isAdmin && <PerformanceCard />}

      {/* AUDITORÍA — solo admin */}
      {isAdmin && <AuditLogCard />}

      {/* ZONA PELIGROSA — solo admin */}
      {isAdmin && <DangerZoneSection />}

      {/* CUENTA */}
      <Section
        icon={<UserCircle size={14} />}
        title="Mi cuenta"
        subtitle="Sesión activa de Supabase"
      >
        <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-bloom"
            style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
          >
            <UserCircle size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black truncate">{fullName ?? email}</p>
            <p className="text-[10px] text-slate-500 flex items-center gap-1">
              <Mail size={10} />
              <span className="truncate">{email}</span>
            </p>
            <p className="text-[9px] font-black uppercase tracking-widest text-primary mt-0.5 flex items-center gap-1">
              <Shield size={9} />
              Rol: {role}
            </p>
          </div>
        </div>

        <button
          onClick={async () => {
            const ok = await confirmAction({
              title: "¿Cerrar sesión?",
              description:
                "Tendrás que volver a iniciar sesión para entrar de nuevo.",
              confirmLabel: "Sí, salir",
              cancelLabel: "Cancelar",
              tone: "danger",
            })
            if (ok) await signOut()
          }}
          className="w-full h-11 mt-3 rounded-xl bg-rose-50 text-rose-600 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-100"
        >
          <LogOut size={14} /> Cerrar sesión
        </button>

        <p className="text-[9px] font-bold text-slate-400 leading-relaxed pt-2">
          Los roles (<code className="text-primary">admin / staff / client</code>) se
          asignan automáticamente por correo. Para promover una cajera a{" "}
          <code className="text-primary">staff</code>, edita su fila en{" "}
          <code>user_profiles</code> desde Supabase.
        </p>
      </Section>
    </div>
  )
}

/* ────────── Sub-componentes ────────── */

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
          <h3 className="text-[11px] font-black uppercase tracking-widest">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[9px] font-bold text-slate-400">{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </motion.section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  )
}

/* ════════════════════════════════════════════════════════════════════
   PREFERENCIAS DE LA CALCULADORA — márgenes y costos fijos.
   Persistido en `pricing_config` (fila id=1). Se usa al sugerir
   precios en la calculadora y como costo extra al analizar producto.
   ════════════════════════════════════════════════════════════════════ */
function PricingPrefsSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState<PricingConfig>({
    id: 1,
    margen_menudeo: 30,
    margen_medio: 25,
    margen_mayoreo: 20,
    umbral_medio: 6,
    umbral_mayoreo: 12,
    costo_extra: 0,
  })

  useEffect(() => {
    let alive = true
    getPricingConfig()
      .then((d) => alive && setCfg(d))
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await savePricingConfig(cfg)
      toast.success("Calculadora actualizada ✓")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="surface-card p-5 mb-4 flex items-center justify-center h-32">
        <Loader2 size={18} className="animate-spin text-primary" />
      </section>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-5 mb-4 space-y-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Calculator size={14} />
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
            Calculadora de precios
          </h3>
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
            Márgenes sugeridos y costo extra por análisis
          </p>
        </div>
      </div>

      {/* Márgenes */}
      <div className="space-y-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Percent size={11} /> Márgenes de utilidad sugeridos
        </p>
        {[
          {
            key: "margen_menudeo" as const,
            label: "Menudeo",
            hint: "1 a 5 pz",
          },
          {
            key: "margen_medio" as const,
            label: "Medio mayoreo",
            hint: `desde ${cfg.umbral_medio} pz`,
          },
          {
            key: "margen_mayoreo" as const,
            label: "Mayoreo total",
            hint: `desde ${cfg.umbral_mayoreo} pz`,
          },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60"
          >
            <div className="min-w-0">
              <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight">
                {item.label}
              </p>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-tight">
                {item.hint}
              </p>
            </div>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={200}
                value={cfg[item.key]}
                onChange={(e) =>
                  setCfg({ ...cfg, [item.key]: Number(e.target.value) || 0 })
                }
                className="h-9 w-24 pr-7 pl-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 text-slate-900 dark:text-slate-100"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 dark:text-slate-500">
                %
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Costo extra fijo */}
      <Field label="Gasto fijo por análisis ($)">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={cfg.costo_extra}
          onChange={(e) =>
            setCfg({ ...cfg, costo_extra: Number(e.target.value) || 0 })
          }
          className="settings-input"
          placeholder="0.00"
        />
      </Field>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
        El <b>gasto fijo</b> se suma al costo del producto en cada análisis de la
        calculadora (ej: comisión de pasarela, empaque). Los <b>umbrales de piezas</b> para
        cambiar de tier se configuran arriba en <b>Precios por volumen</b>.
      </p>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 mt-1 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-95 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Save size={14} />
        )}
        Guardar calculadora
      </button>
    </motion.section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   PREFERENCIAS DEL USUARIO — experiencia personalizable
   Persistidas en localStorage. No requieren backend.
   ════════════════════════════════════════════════════════════════════ */
function UserPrefsSection() {
  const { prefs, toggle, set } = useUserPrefs()

  const toggles: Array<{
    key: "sounds" | "haptics" | "confetti"
    icon: React.ReactNode
    title: string
    description: string
    iconBg: string
  }> = [
    {
      key: "sounds",
      icon: <Volume2 size={14} />,
      title: "Sonidos",
      description:
        "Tonos suaves al cobrar, escanear códigos y confirmar acciones.",
      iconBg: "bg-sky-500",
    },
    {
      key: "haptics",
      icon: <Smartphone size={14} />,
      title: "Vibración (haptics)",
      description:
        "Pequeñas vibraciones del celular al tocar botones y al cobrar.",
      iconBg: "bg-violet-500",
    },
    {
      key: "confetti",
      icon: <PartyPopper size={14} />,
      title: "Confetti en logros",
      description:
        "Celebración al cerrar el día, primera venta y reportes resueltos.",
      iconBg: "bg-amber-500",
    },
  ]

  const SOUND_PACKS: { id: typeof prefs.soundPack; label: string; hint: string }[] = [
    { id: "default", label: "Default", hint: "Suave y moderno" },
    { id: "vintage", label: "Vintage", hint: "Caja registradora retro" },
    { id: "arcade", label: "Arcade", hint: "8-bit divertido" },
    { id: "premium", label: "Premium", hint: "Chimes finos" },
  ]

  const MOTION_LEVELS: { id: typeof prefs.motion; label: string; hint: string }[] = [
    { id: "off", label: "Apagar", hint: "Sin animaciones" },
    { id: "low", label: "Baja", hint: "Animaciones más rápidas" },
    { id: "normal", label: "Normal", hint: "Default" },
    { id: "high", label: "Alta", hint: "Animaciones más expresivas" },
  ]

  const previewSound = async (packId: typeof prefs.soundPack) => {
    // Cambia el pack temporalmente para que el sonido refleje la elección
    const prevPack = prefs.soundPack
    set("soundPack", packId)
    const { sound } = await import("../../lib/sound")
    sound.success()
    // Restaurar después de un toque (solo si NO era ya el activo)
    if (prevPack !== packId) {
      setTimeout(() => set("soundPack", packId), 0)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-5 mb-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-bloom"
          style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
        >
          <Sparkles size={14} />
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
            Experiencia
          </h3>
          <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
            Sonidos, vibración, animaciones, modo oscuro y horarios
          </p>
        </div>
      </div>

      {/* Toggles base */}
      <div className="space-y-1.5">
        {toggles.map((r) => (
          <label
            key={r.key}
            className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 hover:border-primary/30 dark:hover:border-primary/40 cursor-pointer transition-colors"
          >
            <div
              className={`w-9 h-9 rounded-xl ${r.iconBg} text-white flex items-center justify-center shrink-0 shadow-sm`}
            >
              {r.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight">
                {r.title}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                {r.description}
              </p>
            </div>
            <Toggle
              checked={prefs[r.key]}
              onChange={() => toggle(r.key)}
              label={r.title}
            />
          </label>
        ))}
      </div>

      {/* Volumen: slider 0..100 */}
      {prefs.sounds && (
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Volumen
            </span>
            <span className="text-[11px] font-black text-primary tabular-nums">
              {prefs.volume}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={prefs.volume}
            onChange={(e) => set("volume", Number(e.target.value))}
            className="w-full h-2 accent-primary"
            aria-label="Volumen"
          />
        </div>
      )}

      {/* Sound packs */}
      {prefs.sounds && (
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Pack de sonidos
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SOUND_PACKS.map((p) => {
              const active = prefs.soundPack === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => previewSound(p.id)}
                  className={`text-left rounded-xl border-2 px-3 py-2 transition-colors ${
                    active
                      ? "border-primary bg-primary/5 text-slate-900 dark:text-slate-100"
                      : "border-slate-200 dark:border-slate-700 hover:border-primary/40 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <p className="text-[11px] font-black leading-tight">
                    {p.label}
                  </p>
                  <p className="text-[9px] text-slate-400 leading-snug mt-0.5">
                    {p.hint}
                  </p>
                </button>
              )
            })}
          </div>
          <p className="text-[9px] text-slate-400 text-center italic">
            Toca un pack para escuchar
          </p>
        </div>
      )}

      {/* Intensidad de animación */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Intensidad de animación
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {MOTION_LEVELS.map((m) => {
            const active = prefs.motion === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => set("motion", m.id)}
                className={`rounded-xl border-2 px-2 py-1.5 transition-colors ${
                  active
                    ? "border-primary bg-primary/5 text-slate-900 dark:text-slate-100"
                    : "border-slate-200 dark:border-slate-700 hover:border-primary/40 text-slate-700 dark:text-slate-300"
                }`}
              >
                <p className="text-[10px] font-black leading-tight">{m.label}</p>
              </button>
            )
          })}
        </div>
        <p className="text-[9px] text-slate-400 text-center italic">
          {MOTION_LEVELS.find((m) => m.id === prefs.motion)?.hint}
        </p>
      </div>

      {/* Mood emoji */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Tu mood del día <span className="text-slate-400 normal-case">(aparece junto al logo)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {["✨", "😎", "🔥", "💪", "🌸", "🌙", "🎀", "💖", "☀️", "🚀", "🌷", "🦋"].map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => set("moodEmoji", emoji)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                prefs.moodEmoji === emoji
                  ? "bg-primary/15 ring-2 ring-primary scale-110"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:scale-105"
              }`}
              aria-label={`Mood ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Modo oscuro automático por horario */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0">
            <MoonIcon size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight">
              Modo oscuro automático por horario
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Cambia a oscuro entre las horas que elijas. Útil para
              descansar la vista de noche.
            </p>
          </div>
          <Toggle
            checked={prefs.darkSchedule}
            onChange={() => toggle("darkSchedule")}
            label="Dark schedule"
          />
        </label>
        {prefs.darkSchedule && (
          <div className="flex items-center gap-3 pl-12">
            <label className="inline-flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                De
              </span>
              <input
                type="time"
                value={prefs.darkStart}
                onChange={(e) => set("darkStart", e.target.value)}
                className="h-9 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                A
              </span>
              <input
                type="time"
                value={prefs.darkEnd}
                onChange={(e) => set("darkEnd", e.target.value)}
                className="h-9 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
        )}
      </div>

      {/* Quiet hours */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <div className="w-9 h-9 rounded-xl bg-slate-500 text-white flex items-center justify-center shrink-0">
            <Volume2 size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight">
              Horario silencioso
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Las notificaciones llegan pero NO suenan ni vibran entre estas
              horas. Ideal para la madrugada.
            </p>
          </div>
          <Toggle
            checked={prefs.quietHoursEnabled}
            onChange={() => toggle("quietHoursEnabled")}
            label="Quiet hours"
          />
        </label>
        {prefs.quietHoursEnabled && (
          <div className="flex items-center gap-3 pl-12">
            <label className="inline-flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                De
              </span>
              <input
                type="time"
                value={prefs.quietStart}
                onChange={(e) => set("quietStart", e.target.value)}
                className="h-9 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="inline-flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                A
              </span>
              <input
                type="time"
                value={prefs.quietEnd}
                onChange={(e) => set("quietEnd", e.target.value)}
                className="h-9 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[12px] font-black tabular-nums text-center text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
        )}
      </div>

      <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center italic pt-1">
        Estas preferencias se guardan en este dispositivo
      </p>
    </motion.section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   PREFERENCIAS DE NOTIFICACIONES
   - Sonido al recibir
   - Vibración al recibir
   - Quiet hours
   - Push nativas (opt-in con permiso del navegador)
   - Categorías silenciadas
   ════════════════════════════════════════════════════════════════════ */
function NotifPrefsSection() {
  const { prefs, setPref, toggleCategory } = useNotifPrefs()
  const [busyPush, setBusyPush] = useState(false)
  const [permState, setPermState] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  )

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return
    const i = setInterval(() => setPermState(Notification.permission), 1500)
    return () => clearInterval(i)
  }, [])

  const handlePushToggle = async (next: boolean) => {
    if (!next) {
      setPref("pushNativeEnabled", false)
      toast.success("Push nativas desactivadas")
      return
    }
    if (!isPushSupported()) {
      toast.error("Tu navegador no soporta push nativas")
      return
    }
    setBusyPush(true)
    try {
      const ok = await ensurePushPermission()
      if (ok) {
        setPref("pushNativeEnabled", true)
        toast.success("Push nativas activadas")
      } else {
        toast.error("No otorgaste permiso de notificación")
      }
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo activar push")
    } finally {
      setBusyPush(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-card p-5 mb-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-bloom"
          style={{ background: "linear-gradient(135deg,#0ea5e9,#a855f7)" }}
        >
          <Bell size={14} />
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
            Notificaciones
          </h3>
          <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
            Sonidos, push, horario silencioso y categorías
          </p>
        </div>
      </div>

      {/* Switches globales */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
            {prefs.enabled ? <Bell size={14} /> : <BellOff size={14} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight">
              Recibir notificaciones
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Apaga esto para silenciar absolutamente todo. La campana sigue visible.
            </p>
          </div>
          <Toggle
            checked={prefs.enabled}
            onChange={(v) => setPref("enabled", v)}
            label="Recibir notificaciones"
          />
        </label>

        <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <div className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0">
            <Volume2 size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight">
              Sonido al recibir
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Tono diferente por tipo: dinero, alertas, deseos, entregas.
            </p>
          </div>
          <Toggle
            checked={prefs.soundOnIncoming}
            onChange={(v) => setPref("soundOnIncoming", v)}
            label="Sonido al recibir"
          />
        </label>

        <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <div className="w-9 h-9 rounded-xl bg-violet-500 text-white flex items-center justify-center shrink-0">
            <Smartphone size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight">
              Vibración al recibir
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Vibración corta y discreta (no aplica en desktop).
            </p>
          </div>
          <Toggle
            checked={prefs.hapticOnIncoming}
            onChange={(v) => setPref("hapticOnIncoming", v)}
            label="Vibración al recibir"
          />
        </label>

        {/* Push nativas */}
        <label className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <div
            className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#0ea5e9,#a855f7)" }}
          >
            <Bell size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight flex items-center gap-1.5">
              Notificaciones del sistema
              {permState === "granted" && (
                <CheckCircle2 size={11} className="text-emerald-500" />
              )}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {permState === "unsupported"
                ? "Tu navegador no las soporta."
                : permState === "denied"
                ? "Bloqueadas en el navegador. Habilítalas desde el candado de la URL."
                : permState === "granted"
                ? "Permiso concedido. Verás las notificaciones aunque tengas otro tab abierto."
                : "Recibe avisos del sistema operativo aunque tengas otro tab abierto."}
            </p>
          </div>
          {busyPush ? (
            <Loader2 size={14} className="animate-spin text-slate-400 mt-2" />
          ) : (
            <Toggle
              checked={prefs.pushNativeEnabled && permState === "granted"}
              onChange={handlePushToggle}
              disabled={permState === "unsupported" || permState === "denied"}
              label="Push del sistema"
            />
          )}
        </label>

        {/* Quiet hours */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-700 dark:bg-slate-600 text-white flex items-center justify-center shrink-0">
              <MoonIcon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-slate-800 dark:text-slate-100 leading-tight">
                Horario silencioso
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                Las notificaciones llegan pero no suenan ni vibran en este rango.
              </p>
            </div>
            <Toggle
              checked={prefs.quietHours.enabled}
              onChange={(v) =>
                setPref("quietHours", { ...prefs.quietHours, enabled: v })
              }
              label="Activar horario silencioso"
            />
          </div>
          {prefs.quietHours.enabled && (
            <div className="grid grid-cols-2 gap-2 mt-3 pl-12">
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Desde
                </span>
                <input
                  type="time"
                  value={prefs.quietHours.from}
                  onChange={(e) =>
                    setPref("quietHours", { ...prefs.quietHours, from: e.target.value })
                  }
                  className="settings-input mt-1"
                />
              </label>
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Hasta
                </span>
                <input
                  type="time"
                  value={prefs.quietHours.to}
                  onChange={(e) =>
                    setPref("quietHours", { ...prefs.quietHours, to: e.target.value })
                  }
                  className="settings-input mt-1"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Categorías */}
      <div className="space-y-1.5 pt-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 pl-1">
          Silenciar categorías
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_CATEGORIES.map((cat: NotifCategory) => {
            const meta = NOTIF_CATEGORY_META[cat]
            const muted = prefs.mutedCategories.includes(cat)
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-left ${
                  muted
                    ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60"
                    : "bg-white dark:bg-slate-800/40 border-emerald-200 dark:border-emerald-500/30 shadow-sm"
                }`}
              >
                <span className="text-base">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-slate-800 dark:text-slate-100 leading-tight">
                    {meta.label}
                  </p>
                  <p className="text-[8px] text-slate-500 dark:text-slate-400 leading-snug">
                    {muted ? "Silenciada" : meta.hint}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center italic pt-1">
        Estas preferencias se guardan en este dispositivo
      </p>
    </motion.section>
  )
}

/* ════════════════════════════════════════════════════════════════════
   DANGER ZONE — reset SELECTIVO por categorías
   Mari elige qué borrar (ventas, soporte, deseos, etc.) sin tocar
   usuarios ni configuración. Si selecciona todo, equivalente a reset
   total. Doble confirmación: checklist + escribir RESETEAR.
   ════════════════════════════════════════════════════════════════════ */

/** Categorías que NO borran toda la tabla, solo aplican un filtro
 *  (status=resolved, read_at not null, created_at antiguo). Las
 *  mostramos con badge "Selectiva" para que Mari sepa distinguirlas
 *  visualmente de las que borran TODO. */
const SELECTIVE_CATEGORIES: ResetCategory[] = [
  "tickets_resueltos",
  "notifs_leidas",
  "ventas_canceladas",
  "visitas_viejas",
  "audit_viejo",
]

/** Agrupación visual del checklist por severidad/dominio.
 *  Antes era una lista plana de 15 cards que abrumaba a Mari y
 *  hacía difícil ver "qué afecta qué". Ahora 3 secciones colapsables:
 *  - Operativo: lo de día a día (ventas, soporte, etc.)
 *  - Catálogo: lo más destructivo, aislado
 *  - Selectivas: limpiezas finas opt-in */
const GROUPS: Array<{
  id: string
  label: string
  hint: string
  icon: typeof Database
  iconBgCls: string
  borderCls: string
  cats: ResetCategory[]
}> = [
  {
    id: "operativo",
    label: "Datos operativos",
    hint: "Ventas, soporte, notifs, deseos, stories, reseñas, ciclos, loyalty",
    icon: Database,
    iconBgCls: "bg-amber-500",
    borderCls: "border-amber-200/70 dark:border-amber-500/30",
    cats: [
      "ventas",
      "soporte",
      "notifs",
      "deseos",
      "stories",
      "resenias",
      "pricing_ops",
      "ciclos",
      "loyalty",
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo completo",
    hint: "Productos, variantes, bundles, Q&A y fotos. ⚠ Lo más destructivo.",
    icon: ShoppingBag,
    iconBgCls: "bg-rose-500",
    borderCls: "border-rose-200/70 dark:border-rose-500/30",
    cats: ["catalogo"],
  },
  {
    id: "selectivas",
    label: "Limpiezas selectivas",
    hint: "Filtran por estado o fecha. Útiles sin borrar todo.",
    icon: Sliders,
    iconBgCls: "bg-sky-500",
    borderCls: "border-sky-200/70 dark:border-sky-500/30",
    cats: SELECTIVE_CATEGORIES,
  },
]

function DangerZoneSection() {
  const ALL_CATEGORIES = Object.keys(CATEGORY_INFO) as ResetCategory[]
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ResetReport | null>(null)
  // Por default: operativo expandido (lo más usado); catálogo y
  // selectivas colapsadas para no asustar a Mari de entrada.
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["operativo"])
  // Por default proponemos TODO menos:
  //  - catálogo (lo más destructivo)
  //  - limpiezas selectivas de históricos (visitas/audit) — son opt-in
  //    porque borran data útil para análisis a largo plazo, no son
  //    parte del reset operativo típico.
  const [selected, setSelected] = useState<ResetCategory[]>(
    ALL_CATEGORIES.filter(
      (c) => c !== "catalogo" && c !== "visitas_viejas" && c !== "audit_viejo",
    ),
  )

  const canRun =
    confirmText.trim().toUpperCase() === "RESETEAR" &&
    selected.length > 0 &&
    !busy
  const isFullReset = selected.length === ALL_CATEGORIES.length

  function toggle(cat: ResetCategory) {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  function selectAll() {
    setSelected(ALL_CATEGORIES)
  }
  function selectNone() {
    setSelected([])
  }
  function selectSafe() {
    setSelected(ALL_CATEGORIES.filter((c) => c !== "catalogo"))
  }

  async function handleReset() {
    if (!canRun) return
    const labels = selected.map((c) => CATEGORY_INFO[c].label).join(", ")
    const confirmed = await confirmAction({
      title: "⚠️ Última confirmación",
      description: isFullReset
        ? "Vas a BORRAR TODO lo operativo: catálogo, ventas, comprobantes, soporte, notificaciones, deseos, stories, reseñas, ciclos y cálculos. La app quedará VACÍA, como recién instalada.\n\nLos USUARIOS y la CONFIGURACIÓN se preservan.\n\nEsto NO se puede deshacer."
        : `Vas a borrar SOLO: ${labels}.\n\nLas demás categorías y los usuarios/configuración se preservan.\n\nEsto NO se puede deshacer.`,
      confirmLabel: isFullReset ? "Sí, reiniciar la app" : "Sí, borrar lo seleccionado",
      tone: "danger",
    })
    if (!confirmed) return
    setBusy(true)
    const tid = toast.loading(
      isFullReset ? "Borrando todo..." : "Borrando seleccionados...",
    )
    try {
      const r = await resetAppData(selected)
      setReport(r)
      const totalRows = Object.values(r.tables).reduce((a, b) => a + b, 0)
      const hadErrors = r.errors.length > 0
      if (hadErrors) {
        toast.error(
          `Reset parcial: ${totalRows} filas y ${r.storage_deleted} archivos. ${r.errors.length} errores. Revisa el reporte.`,
          { id: tid, duration: 6000 },
        )
      } else {
        toast.success(
          `✓ Listo: ${totalRows} filas y ${r.storage_deleted} archivos eliminados.`,
          { id: tid, duration: 4500 },
        )
      }
      setConfirmText("")
      setOpen(false)
      if (!hadErrors) {
        const reload = await confirmAction({
          title: "Datos eliminados",
          description:
            "Te recomendamos recargar la app para que todas las vistas reflejen el estado actualizado.",
          confirmLabel: "Recargar ahora",
          cancelLabel: "Más tarde",
          tone: "primary",
        })
        if (reload) {
          setTimeout(() => window.location.reload(), 200)
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falló el reset", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-5 mb-4 border-2 border-rose-200 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/5 space-y-3"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shadow-bloom">
          <AlertTriangle size={14} />
        </div>
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300">
            Zona peligrosa
          </h3>
          <p className="text-[9px] font-bold text-rose-600/80 dark:text-rose-400/80">
            Borrar datos por categoría
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-rose-200/60 dark:border-rose-500/20 p-3 text-[11px] leading-snug text-slate-700 dark:text-slate-200 space-y-1.5">
        <p className="font-bold">
          Elige qué categorías borrar. Lo que NO esté seleccionado se preserva.
        </p>
        <p className="font-bold pt-1 text-emerald-700 dark:text-emerald-400">
          NUNCA se tocan: cuentas de usuarios, configuración (tienda, banco,
          reglas, precios) ni avatars.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full h-11 rounded-xl bg-white dark:bg-slate-900/60 border-2 border-rose-300 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 active:scale-[0.99] transition-all"
        >
          <Trash2 size={12} /> Elegir qué borrar
        </button>
      ) : (
        <div className="space-y-3">
          {/* Atajos rápidos de selección */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={selectSafe}
              disabled={busy}
              className="h-7 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 disabled:opacity-50"
              title="Todo menos catálogo (seguro)"
            >
              ✓ Seguro
            </button>
            <button
              type="button"
              onClick={selectAll}
              disabled={busy}
              className="h-7 px-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 disabled:opacity-50"
              title="Marca todas — borra absolutamente todo"
            >
              ⚠ Todo
            </button>
            <button
              type="button"
              onClick={selectNone}
              disabled={busy}
              className="h-7 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 disabled:opacity-50"
            >
              Ninguno
            </button>
          </div>

          {/* Checklist agrupado por severidad para no abrumar.
              Cada grupo es colapsable; el badge muestra cuántos están
              marcados sobre el total del grupo para que Mari sepa de
              un vistazo qué tan agresivo va su reset. */}
          {GROUPS.map((g) => {
            const isExpanded = expandedGroups.includes(g.id)
            const groupCount = g.cats.filter((c) => selected.includes(c)).length
            const total = g.cats.length
            const allOn = groupCount === total
            const noneOn = groupCount === 0
            return (
              <div
                key={g.id}
                className={`rounded-2xl border ${g.borderCls} bg-white/70 dark:bg-slate-900/40 overflow-hidden`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((prev) =>
                      prev.includes(g.id)
                        ? prev.filter((x) => x !== g.id)
                        : [...prev, g.id],
                    )
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left press"
                  aria-expanded={isExpanded}
                >
                  <span
                    className={`w-7 h-7 rounded-lg ${g.iconBgCls} text-white flex items-center justify-center shrink-0`}
                  >
                    <g.icon size={13} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 leading-tight">
                      {g.label}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 leading-tight truncate">
                      {g.hint}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full tabular-nums ${
                      allOn
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                        : noneOn
                        ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    }`}
                  >
                    {groupCount}/{total}
                  </span>
                  <ChevronRight
                    size={14}
                    className={`text-slate-400 transition-transform ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 space-y-1.5">
                        {g.cats.map((cat) => {
                          const info = CATEGORY_INFO[cat]
                          const isOn = selected.includes(cat)
                          const isSelective = SELECTIVE_CATEGORIES.includes(cat)
                          return (
                            <label
                              key={cat}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl border bg-white dark:bg-slate-900/60 cursor-pointer transition-colors ${
                                isOn
                                  ? "border-rose-400/60 ring-1 ring-rose-400/30"
                                  : "border-slate-200/70 dark:border-slate-700/60 opacity-70 hover:opacity-100"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={() => toggle(cat)}
                                disabled={busy}
                                className="mt-0.5 w-4 h-4 accent-rose-500 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p
                                    className={`text-[11px] font-black ${
                                      isOn
                                        ? "text-slate-900 dark:text-slate-100"
                                        : "text-slate-600 dark:text-slate-400"
                                    }`}
                                  >
                                    {info.label}
                                  </p>
                                  {isSelective && (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                                      Selectiva
                                    </span>
                                  )}
                                </div>
                                <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                                  {info.description}
                                </p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          <label className="text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 block pt-1">
            Escribe <span className="font-mono">RESETEAR</span> para confirmar
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="RESETEAR"
            disabled={busy}
            className="w-full h-11 px-3 rounded-xl border-2 border-rose-300 dark:border-rose-500/40 bg-white dark:bg-slate-900 text-sm font-black uppercase tracking-widest tabular-nums outline-none focus:border-rose-500 disabled:opacity-50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setConfirmText("")
              }}
              disabled={busy}
              className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!canRun}
              className="flex-[2] h-11 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              {isFullReset
                ? "Sí, borrar TODO"
                : `Borrar ${selected.length} ${selected.length === 1 ? "categoría" : "categorías"}`}
            </button>
          </div>
        </div>
      )}

      {report && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 p-3 space-y-2"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Último reset
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums">
            {Object.entries(report.tables).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-500 truncate">
                  {TABLE_LABEL[k] ?? k}
                </span>
                <span className="font-black">{v}</span>
              </div>
            ))}
            <div className="flex justify-between col-span-2 pt-1 mt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-500">Fotos de storage</span>
              <span className="font-black">{report.storage_deleted}</span>
            </div>
          </div>
          {report.errors.length > 0 && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200/60 p-2 text-[10px] text-rose-700 dark:text-rose-300 space-y-0.5">
              <p className="font-black uppercase tracking-widest">
                {report.errors.length} errores
              </p>
              {report.errors.slice(0, 5).map((e, i) => (
                <p key={i} className="font-bold truncate">
                  · {e.where}: {e.message}
                </p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Limpiar caché local + service worker */}
      <ClearCacheButton />
    </motion.section>
  )
}

/**
 * Botón para limpiar caché local + service worker + recargar.
 * Útil cuando la app muestra datos viejos o un cambio nuevo no apareció.
 */
function ClearCacheButton() {
  const [busy, setBusy] = useState(false)

  async function clearAndReload() {
    setBusy(true)
    try {
      // 1. Borrar Cache Storage del navegador
      if ("caches" in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      // 2. Desregistrar todos los service workers
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      // 3. Borrar localStorage no crítico (preservamos sesión auth)
      try {
        const keep = Object.keys(localStorage).filter((k) =>
          k.startsWith("sb-") || k.startsWith("supabase.")
        )
        const stash: Record<string, string> = {}
        keep.forEach((k) => {
          const v = localStorage.getItem(k)
          if (v !== null) stash[k] = v
        })
        localStorage.clear()
        Object.entries(stash).forEach(([k, v]) => localStorage.setItem(k, v))
      } catch {}
      // 4. Hard reload
      window.location.reload()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo limpiar la caché")
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-rose-200/60 dark:border-rose-500/20 p-3 space-y-2">
      <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">
        ¿La app muestra datos viejos?
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
        Limpia la caché del navegador y vuelve a cargar. No borra ventas ni tu sesión.
      </p>
      <button
        type="button"
        onClick={clearAndReload}
        disabled={busy}
        className="w-full h-10 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 press disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <RotateCcw size={12} />
        )}
        Limpiar caché y recargar
      </button>
    </div>
  )
}

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
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

  const handleStoreReset = () => {
    if (!window.confirm("¿Restaurar valores por defecto?")) return
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
      <div className="mb-4 px-2">
        <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <SettingsIcon size={14} className="text-primary" />
          Configuración
        </h2>
        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
          Información de la tienda y seguridad
        </p>
      </div>

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

      {/* CUENTA */}
      <Section
        icon={<UserCircle size={14} />}
        title="Mi cuenta"
        subtitle="Sesión activa de Supabase"
      >
        <div className="flex items-center gap-3 px-3 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-bloom"
            style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
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
          onClick={() => signOut()}
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
      className="bg-white rounded-3xl border border-slate-100 p-5 mb-4 space-y-3 shadow-sm"
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

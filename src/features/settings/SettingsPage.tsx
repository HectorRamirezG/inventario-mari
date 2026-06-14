import { useState } from "react"
import { motion } from "framer-motion"
import {
  Settings as SettingsIcon,
  Store,
  Lock,
  Save,
  RotateCcw,
  ShieldAlert,
  KeyRound,
} from "lucide-react"
import { toast } from "react-hot-toast"

import { useStoreInfo } from "../../lib/useStoreInfo"
import { useRole, type Role } from "../../lib/useRole"

export default function SettingsPage() {
  const { info, update, reset } = useStoreInfo()
  const { isAdmin, changePin } = useRole()

  const [form, setForm] = useState(info)
  const [pinAdmin, setPinAdmin] = useState("")
  const [pinCajera, setPinCajera] = useState("")
  const [savingStore, setSavingStore] = useState(false)
  const [savingPin, setSavingPin] = useState<Role | null>(null)

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

  const handlePinChange = (which: Role, value: string) => {
    if (!isAdmin) return
    setSavingPin(which)
    try {
      changePin(which, value)
      if (which === "admin") setPinAdmin("")
      else setPinCajera("")
      toast.success(`PIN de ${which} actualizado`)
    } catch (e: any) {
      toast.error(e?.message ?? "Error al cambiar PIN")
    } finally {
      setSavingPin(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-3 pt-1 pb-28">
      {/* HEADER */}
      <div className="mb-4 px-2">
        <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-slate-900">
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

      {/* SEGURIDAD: PINs */}
      <Section
        icon={<Lock size={14} />}
        title="PINs de acceso"
        subtitle={
          isAdmin
            ? "Cambia los PINs de admin y cajera"
            : "Sólo el administrador puede cambiar PINs"
        }
      >
        {!isAdmin && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-bold">
            <ShieldAlert size={14} />
            <span>Inicia sesión como admin para modificar los PINs.</span>
          </div>
        )}

        <PinChanger
          role="admin"
          label="PIN Administrador"
          value={pinAdmin}
          onValue={setPinAdmin}
          onSave={() => handlePinChange("admin", pinAdmin)}
          saving={savingPin === "admin"}
          disabled={!isAdmin}
        />
        <PinChanger
          role="cajera"
          label="PIN Cajera"
          value={pinCajera}
          onValue={setPinCajera}
          onSave={() => handlePinChange("cajera", pinCajera)}
          saving={savingPin === "cajera"}
          disabled={!isAdmin}
        />

        <p className="text-[9px] font-bold text-slate-400 leading-relaxed pt-2">
          Los PINs viven sólo en este dispositivo (no se sincronizan con Supabase).
          Si olvidas el PIN admin, borra el localStorage del navegador para resetear
          a <code className="text-primary">1234</code>.
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

function PinChanger({
  role,
  label,
  value,
  onValue,
  onSave,
  saving,
  disabled,
}: {
  role: Role
  label: string
  value: string
  onValue: (v: string) => void
  onSave: () => void
  saving: boolean
  disabled: boolean
}) {
  return (
    <div className="flex items-end gap-2">
      <Field label={label}>
        <div className="relative">
          <KeyRound
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
          />
          <input
            type="password"
            inputMode="numeric"
            pattern="\d*"
            maxLength={8}
            value={value}
            onChange={(e) =>
              onValue(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
            placeholder="4 a 8 dígitos"
            disabled={disabled}
            className="settings-input pl-8 tabular-nums tracking-widest"
            autoComplete="new-password"
          />
        </div>
      </Field>
      <button
        onClick={onSave}
        disabled={disabled || saving || value.length < 4}
        className="h-11 px-4 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {saving ? "..." : `Cambiar ${role === "admin" ? "Admin" : "Cajera"}`}
      </button>
    </div>
  )
}

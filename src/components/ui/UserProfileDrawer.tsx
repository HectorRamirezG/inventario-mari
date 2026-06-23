import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, PanInfo } from "framer-motion"
import {
  X,
  User as UserIcon,
  Mail,
  Lock,
  Phone,
  Shield,
  Save,
  LogOut,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react"
import toast from "react-hot-toast"

import { useAuth, isStaffOrAdmin } from "../../lib/useAuth"
import {
  fetchMyProfile,
  updateMyProfile,
  updateMyEmail,
  updateMyPassword,
  type UserProfileDetail,
} from "../../features/profile/profileService"
import ProductImageUploader from "./ProductImageUploader"
import SmartLocationInput from "./SmartLocationInput"
import Skeleton from "./Skeleton"
import RfmBadge from "./RfmBadge"
import { fetchMyShoppingStats, type MyShoppingStats } from "../../features/profile/myShoppingStatsService"
import { formatMoney } from "../../lib/format"
import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Drawer-cortina para ver y editar el perfil del usuario logueado.
 * Si NO hay sesión, sólo invita a iniciar sesión.
 */
export default function UserProfileDrawer({ open, onClose }: Props) {
  const { user, session, role, email, fullName, signOut } = useAuth()
  const [profile, setProfile] = useState<UserProfileDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [locationUrl, setLocationUrl] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)

  // Cargar perfil cuando se abre
  useEffect(() => {
    if (!open || !user) return
    let alive = true
    setLoading(true)
    fetchMyProfile(user.id).then((p) => {
      if (!alive) return
      setProfile(p)
      setName(p?.full_name ?? fullName ?? "")
      setPhone(p?.phone ?? "")
      setAddress(p?.address ?? "")
      setLocationUrl(p?.location_url ?? "")
      setAvatarUrl(p?.avatar_url ?? null)
      setNewEmail(p?.email ?? email ?? "")
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [open, user, fullName, email])

  // Bloquear scroll body
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // ESC para cerrar
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      await updateMyProfile(user.id, {
        full_name: name.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        location_url: locationUrl.trim() || null,
        avatar_url: avatarUrl,
      })
      toast.success("Perfil actualizado ✓")
      window.dispatchEvent(new CustomEvent("mari:profile-updated"))
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  async function handleChangeEmail() {
    if (!newEmail.trim() || newEmail === email) return
    setEmailSaving(true)
    try {
      await updateMyEmail(newEmail.trim())
      toast.success("Te enviamos un correo para confirmar el cambio")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cambiar el correo")
    } finally {
      setEmailSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!newPwd) return
    setPwdSaving(true)
    try {
      await updateMyPassword(newPwd)
      setNewPwd("")
      toast.success("Contraseña actualizada ✓")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cambiar")
    } finally {
      setPwdSaving(false)
    }
  }

  if (typeof document === "undefined") return null

  // Iniciales para fallback de avatar
  const initials = (name || email || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[220] flex items-end justify-center"
          style={{ isolation: "isolate" }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            className="absolute inset-0 bg-slate-950/70 z-0"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={OVERLAY_PANEL_TRANSITION}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.35)] max-h-[92vh] flex flex-col touch-pan-y"
            style={OVERLAY_PANEL_STYLE}
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <h3 className="text-base font-black tracking-tight">Mi perfil</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 active:scale-90"
              >
                <X size={14} />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-5 pb-8 scroll-container-ios space-y-5">
              {!session && (
                <div className="text-center py-10">
                  <UserIcon size={36} className="mx-auto text-slate-300 mb-3" />
                  <p className="font-bold mb-3">No has iniciado sesión</p>
                  <a
                    href="/login"
                    onClick={onClose}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-bloom"
                    style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
                  >
                    Iniciar sesión
                  </a>
                </div>
              )}

              {session && loading && (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-24 rounded-3xl mx-auto" />
                  <Skeleton className="h-4 w-40 mx-auto" rounded="full" />
                  <Skeleton className="h-12 w-full" rounded="xl" />
                  <Skeleton className="h-12 w-full" rounded="xl" />
                  <Skeleton className="h-12 w-full" rounded="xl" />
                </div>
              )}

              {session && !loading && (
                <>
                  {/* Identity Card — gradient brand + avatar + identidad
                      compacta. Reemplaza el bloque plano de "Avatar grande
                      + texto suelto". Pensada para que se vea premium en
                      mobile sin invadir el resto del scroll. */}
                  <div
                    className="relative overflow-hidden rounded-3xl p-4 shadow-bloom"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)",
                    }}
                  >
                    {/* Orbes decorativos del fondo */}
                    <span className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/15 blur-2xl pointer-events-none" />
                    <span className="absolute -bottom-16 -left-8 w-44 h-44 rounded-full bg-white/10 blur-3xl pointer-events-none" />

                    <div className="relative flex items-center gap-3">
                      <div className="shrink-0">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Tu foto"
                            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/40 shadow-sm"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-xl font-black ring-2 ring-white/40">
                            {initials || "👤"}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-white">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/80">
                          Beauty's Me
                        </p>
                        <p className="text-base font-black leading-tight truncate">
                          {name || fullName || "Cliente"}
                        </p>
                        {email && (
                          <p className="text-[10px] font-bold text-white/85 truncate">
                            {email}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[9px] font-black uppercase tracking-widest">
                            <Shield size={9} />
                            {role}
                          </span>
                          {isStaffOrAdmin(role) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-primary text-[9px] font-black uppercase tracking-widest">
                              <Sparkles size={9} /> Panel
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Uploader avatar */}
                  <ProductImageUploader
                    value={avatarUrl}
                    onChange={setAvatarUrl}
                    folder={`avatars/${user?.id ?? "anon"}`}
                    label="Cambiar foto de perfil"
                  />

                  {email && <MyShoppingStatsCard email={email} />}

                  {/* Datos básicos */}
                  <section className="space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <UserIcon size={10} /> Datos personales
                    </h4>

                    <FieldRow
                      icon={UserIcon}
                      label="Nombre completo"
                      value={name}
                      onChange={setName}
                      placeholder="Ej. María García"
                      autoComplete="name"
                    />

                    <FieldRow
                      icon={Phone}
                      label="Teléfono / WhatsApp"
                      value={phone}
                      onChange={setPhone}
                      placeholder="55 1234 5678"
                      type="tel"
                      autoComplete="tel"
                    />

                    {/* Ubicación con el componente bonito: input de dirección
                        + opciones de pegar link de Maps / GPS / abrir en Maps.
                        Misma UX que la caja del admin. */}
                    <SmartLocationInput
                      address={address}
                      onAddressChange={setAddress}
                      locationUrl={locationUrl}
                      onLocationUrlChange={setLocationUrl}
                    />

                    {/* Aclaración: estos datos se autocompletan al apartar */}
                    <div className="rounded-2xl bg-pink-50/60 dark:bg-pink-500/10 border border-pink-100 dark:border-pink-500/20 px-3 py-2 flex items-start gap-2">
                      <UserIcon
                        size={11}
                        className="text-pink-600 dark:text-pink-300 shrink-0 mt-0.5"
                      />
                      <p className="text-[10px] font-bold text-pink-700 dark:text-pink-300 leading-snug">
                        Cuando apartes, estos datos llenan automático el
                        formulario y aparecen en tu ticket.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full h-12 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                      }}
                    >
                      {saving ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Save size={14} />
                      )}
                      Guardar cambios
                    </button>
                  </section>

                  {/* Seguridad — correo */}
                  <section className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <Mail size={10} /> Correo electrónico
                    </h4>
                    <FieldRow
                      icon={Mail}
                      label=""
                      value={newEmail}
                      onChange={setNewEmail}
                      placeholder="tucorreo@ejemplo.com"
                      type="email"
                      autoComplete="email"
                    />
                    {newEmail !== email && newEmail.trim() && (
                      <button
                        type="button"
                        onClick={handleChangeEmail}
                        disabled={emailSaving}
                        className="w-full h-10 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {emailSaving ? (
                          <Loader2 size={12} className="animate-spin inline" />
                        ) : (
                          "Cambiar correo"
                        )}
                      </button>
                    )}
                  </section>

                  {/* Seguridad — contraseña */}
                  <section className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                      <Lock size={10} /> Cambiar contraseña
                    </h4>
                    <div className="relative">
                      <input
                        type={showPwd ? "text" : "password"}
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        placeholder="Nueva contraseña (min 6 caracteres)"
                        autoComplete="new-password"
                        className="settings-input pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        aria-label={showPwd ? "Ocultar" : "Mostrar"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700"
                      >
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {newPwd && (
                      <button
                        type="button"
                        onClick={handleChangePassword}
                        disabled={pwdSaving || newPwd.length < 6}
                        className="w-full h-10 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {pwdSaving ? (
                          <Loader2 size={12} className="animate-spin inline" />
                        ) : (
                          "Actualizar contraseña"
                        )}
                      </button>
                    )}
                  </section>

                  {/* Cerrar sesión */}
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut()
                      onClose()
                    }}
                    className="w-full h-11 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 mt-4"
                  >
                    <LogOut size={12} /> Cerrar sesión
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function MyShoppingStatsCard({ email }: { email: string }) {
  const [stats, setStats] = useState<MyShoppingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchMyShoppingStats(email)
      .then((s) => {
        if (alive) setStats(s)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [email])

  if (loading) {
    return <Skeleton className="h-32 w-full" rounded="lg" />
  }
  if (!stats || stats.visits === 0) return null

  return (
    <section className="rounded-3xl p-4 border border-primary/15 bg-gradient-to-br from-primary/5 via-fuchsia-50/40 to-purple-50/40 dark:from-primary/10 dark:via-fuchsia-500/5 dark:to-purple-500/5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Sparkles size={11} /> Tu historial
        </h4>
        <RfmBadge tier={stats.tier} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="Compras" value={String(stats.visits)} />
        <Stat label="Gastado" value={formatMoney(stats.totalSpent)} />
        <Stat
          label={stats.pendingBalance > 0 ? "Pendiente" : "Al corriente"}
          value={stats.pendingBalance > 0 ? formatMoney(stats.pendingBalance) : "✓"}
          tone={stats.pendingBalance > 0 ? "amber" : "emerald"}
        />
      </div>

      {stats.savingsVsMenudeo > 0 && (
        <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 text-center mb-2">
          Has ahorrado {formatMoney(stats.savingsVsMenudeo)} en mayoreo
        </p>
      )}

      {stats.firstPurchaseIso && (
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 text-center">
          Cliente desde {new Date(stats.firstPurchaseIso).toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
        </p>
      )}
    </section>
  )
}

function Stat({
  label,
  value,
  tone = "primary",
}: {
  label: string
  value: string
  tone?: "primary" | "emerald" | "amber"
}) {
  const toneCls = {
    primary: "text-primary",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-300",
  }[tone]
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-slate-900/40 backdrop-blur p-2 text-center">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className={`text-sm font-black tabular-nums mt-0.5 ${toneCls}`}>{value}</p>
    </div>
  )
}

function FieldRow({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  icon: typeof UserIcon
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoComplete?: string
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <Icon size={10} /> {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="settings-input"
      />
    </div>
  )
}

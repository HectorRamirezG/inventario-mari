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
  ChevronDown,
  Camera,
  Palette,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
  QrCode,
  Copy,
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
import ImageUploader from "./ImageUploader"
import SmartLocationInput from "./SmartLocationInput"
import Skeleton from "./Skeleton"
import RfmBadge from "./RfmBadge"
import LoyaltyDrawer from "../../features/loyalty/LoyaltyDrawer"
import { useMyLoyaltyBalance } from "../../features/loyalty/loyaltyService"
import { useBusinessRules } from "../../features/settings/businessRulesService"
import { fetchMyShoppingStats, type MyShoppingStats } from "../../features/profile/myShoppingStatsService"
import { formatMoney } from "../../lib/format"
import { useUserPrefs, setPref } from "../../lib/userPrefs"
import { copyToClipboard } from "../../lib/clipboard"
import { confirmAction } from "../../lib/confirm"
import OverlayShell from "./OverlayShell"
import { useTheme, type Theme } from "../../lib/useTheme"
import SoundToggle from "./SoundToggle"
import ThemeToggle from "./ThemeToggle"
import WhatsAppDirectButton from "./WhatsAppDirectButton"
import {
  ACCENT_NAMES,
  ACCENT_LABELS,
  ACCENT_PREVIEW,
} from "../../lib/applyTheme"
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
  const bRules = useBusinessRules()
  const { prefs } = useUserPrefs()
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
  // Secciones colapsables (todo cerrado al abrir = vista limpia)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  // QR de cuenta: modal con el email del cliente codificado. Mari puede
  // escanearlo desde caja para identificar al cliente sin teclear email.
  const [qrOpen, setQrOpen] = useState(false)

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
      // Hidratar emoji local desde BD si tengo guardado uno en mi perfil
      // y NO hay nada en localStorage (caso: cambio de dispositivo o
      // localStorage limpiado). Si ya hay uno local, el local manda.
      if (p?.emoji && !prefs.clientEmoji) {
        setPref("clientEmoji", p.emoji)
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [open, user, fullName, email, prefs.clientEmoji])

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
                  {/* Identity Card premium — gradient brand + avatar + chips
                      de rol. Botón "Cambiar foto" abre acordeón con uploader. */}
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
                      <button
                        type="button"
                        onClick={() => setPhotoOpen((v) => !v)}
                        className="relative shrink-0 group press"
                        aria-label="Cambiar foto de perfil"
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt="Tu foto"
                            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/40 shadow-sm"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-2xl font-black ring-2 ring-white/40">
                            {prefs.clientEmoji || initials || "👤"}
                          </div>
                        )}
                        {/* Overlay con cámara — visible siempre como hint */}
                        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white text-primary flex items-center justify-center shadow-md ring-2 ring-white">
                          <Camera size={11} strokeWidth={2.5} />
                        </span>
                      </button>
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
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
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
                      {/* QR de cuenta — el cliente lo muestra y Mari lo
                          escanea en caja para no teclear email manualmente. */}
                      {email && (
                        <button
                          type="button"
                          onClick={() => setQrOpen(true)}
                          aria-label="Mi código QR"
                          title="Mostrar mi QR para identificarme en caja"
                          className="shrink-0 w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md text-white flex items-center justify-center press transition-colors"
                        >
                          <QrCode size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Uploader avatar — acordeón. Solo aparece cuando el
                      cliente tocó "cambiar foto" en el identity card. */}
                  <AnimatePresence initial={false}>
                    {photoOpen && (
                      <motion.div
                        key="photo-acc"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <ImageUploader
                          value={avatarUrl}
                          onChange={setAvatarUrl}
                          folder={`avatars/${user?.id ?? "anon"}`}
                          label="Cambiar foto de perfil"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Quick access chips REMOVIDOS: Mari decidio que TODOS
                      los accesos rapidos (pedidos / monedero / premios /
                      resenas / deseos) viven en el bot\u00f3n + (ActionHub)
                      para no duplicar acceso. Aqui solo queda info de
                      la cuenta personal: stats + datos + seguridad +
                      cerrar sesion. */}

                  {email && <MyShoppingStatsCard email={email} />}

                  {/* Card de puntos del programa de premios (solo si la
                      regla está activa). Abre el LoyaltyDrawer con la
                      lista plana de movimientos. */}
                  {email && <MyLoyaltyMiniCard />}

                  {/* Preferencias rápidas — controles que antes vivían
                      en el header (sonido, tema, WhatsApp directo).
                      Movidos aquí para no saturar el header. */}
                  <QuickPreferencesSection />

                  {/* Mi estilo: cliente elige color personal + emoji.
                      Funciona como override del theme global del admin
                      (solo afecta a SU sesión). Persiste en localStorage. */}
                  <MyStyleSection />

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

                  {/* Cuenta y seguridad — acordeón único que agrupa email +
                      contraseña. Evita abrumar al cliente con form gigante. */}
                  <section className="pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSecurityOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 py-1 press"
                      aria-expanded={securityOpen}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Lock size={11} /> Cuenta y seguridad
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform ${
                          securityOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {securityOpen && (
                        <motion.div
                          key="sec-acc"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="pt-4 space-y-5">
                            {/* Correo */}
                            <div className="space-y-2">
                              <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                <Mail size={9} /> Correo electrónico
                              </h5>
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
                                  className="w-full h-10 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                  {emailSaving ? (
                                    <Loader2 size={12} className="animate-spin inline" />
                                  ) : (
                                    "Cambiar correo"
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Contraseña */}
                            <div className="space-y-2">
                              <h5 className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                                <Lock size={9} /> Cambiar contraseña
                              </h5>
                              <div className="relative">
                                <input
                                  type={showPwd ? "text" : "password"}
                                  value={newPwd}
                                  onChange={(e) => setNewPwd(e.target.value)}
                                  placeholder="Nueva contraseña (mín 6 caracteres)"
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
                                  className="w-full h-10 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                                >
                                  {pwdSaving ? (
                                    <Loader2 size={12} className="animate-spin inline" />
                                  ) : (
                                    "Actualizar contraseña"
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>

                  {/* Cerrar sesión */}
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirmAction({
                        title: "¿Cerrar sesión?",
                        description:
                          "Tendrás que volver a iniciar sesión para entrar de nuevo.",
                        confirmLabel: "Sí, salir",
                        cancelLabel: "Cancelar",
                        tone: "danger",
                      })
                      if (!ok) return
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

          {/* LoyaltyDrawer ya NO se monta aqui: 'Premios' del grid de
              chips navega directo a /mis-premios. El MyLoyaltyMiniCard
              de mas abajo es quien usa el LoyaltyDrawer y se monta solo. */}

          {/* MyReviewsDrawer ELIMINADO: TODOS los accesos rapidos (incluido
              Resenas) viven ahora en el bot\u00f3n + del dock (ClientActionHub).
              Aqu\u00ed solo cuenta personal. */}

          {/* Modal QR de cuenta — Mari escanea para identificar al
              cliente en caja sin teclear email. */}
          {email && (
            <AccountQRModal
              open={qrOpen}
              onClose={() => setQrOpen(false)}
              email={email}
              name={name || fullName || ""}
            />
          )}
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/**
 * Modal con el QR de la cuenta del cliente. El QR codifica el email.
 * Sin dependencias nuevas — usa api.qrserver.com (mismo patrón que el
 * QR del ticket público).
 */
function AccountQRModal({
  open,
  onClose,
  email,
  name,
}: {
  open: boolean
  onClose: () => void
  email: string
  name: string
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(
    email,
  )}`
  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      variant="modal"
      zIndex={250}
      panelClassName="w-full max-w-xs rounded-3xl bg-white dark:bg-slate-900 shadow-premium overflow-hidden"
    >
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <h3 className="text-sm font-black tracking-tight flex items-center gap-1.5">
          <QrCode size={14} className="text-primary" /> Mi código QR
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-5 pb-5 flex flex-col items-center gap-3">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <img
            src={qrSrc}
            alt="QR de mi cuenta"
            width={240}
            height={240}
            className="w-60 h-60 object-contain"
            loading="lazy"
          />
        </div>
        {name && (
          <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-tight text-center">
            {name}
          </p>
        )}
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 text-center leading-snug">
          Muestra este código en caja para identificarte sin escribir tu
          correo. Mari lo escanea con la cámara y listo.
        </p>
        <button
          type="button"
          onClick={() => copyToClipboard(email, "Email copiado")}
          className="w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 press"
        >
          <Copy size={11} /> Copiar mi email
        </button>
      </div>
    </OverlayShell>
  )
}

/* QuickChip helper REMOVIDO: ya no se usan chips de navegacion en este
   drawer. Si Mari quiere volver, vive en git history (commit anterior). */

/**
 * Mini-card de loyalty: muestra balance compacto + "ver" abre LoyaltyDrawer.
 * Solo se renderiza cuando rules.loyalty_enabled = true y el cliente tiene
 * sesión (useMyLoyaltyBalance ya filtra por email del jwt). Reusa todo el
 * realtime del hub para que el badge se actualice solo cuando llegan puntos.
 */
function MyLoyaltyMiniCard() {
  const bRules = useBusinessRules()
  const { balance, loading } = useMyLoyaltyBalance()
  const { prefs } = useUserPrefs()
  const [open, setOpen] = useState(false)

  if (!bRules.loyalty_enabled || loading) return null

  const pts = balance?.points ?? 0
  const valueMx = pts * (bRules.loyalty_peso_por_punto || 1)
  const minRedeem = bRules.loyalty_min_redeem || 0
  // Si aún no puede canjear pero ya tiene >0, mostramos barra de
  // progreso al primer canje (psicológico: ver el avance motiva).
  const showProgress = minRedeem > 0 && pts > 0 && pts < minRedeem
  const progressPct = showProgress
    ? Math.min(100, Math.round((pts / minRedeem) * 100))
    : 0
  // Chip de streak: aparece solo si la racha es >= 2 días.
  const streak = prefs.dailyLoginStreak
  const showStreak = streak >= 2

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full press group text-left rounded-3xl p-4 border border-amber-200/60 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10"
        aria-label="Ver mis premios"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-2xl shrink-0">
            🏆
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700/80 dark:text-amber-300/80">
                Mis premios
              </p>
              {showStreak && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-300 text-[9px] font-black tabular-nums">
                  🔥 {streak} días
                </span>
              )}
            </div>
            <p className="text-xl font-black tabular-nums leading-tight text-slate-900 dark:text-slate-100">
              {pts} <span className="text-xs opacity-80">pts</span>
            </p>
            <p className="text-[10px] font-bold opacity-80 text-slate-600 dark:text-slate-300">
              {pts > 0
                ? `≈ $${valueMx.toFixed(2)} en tu próxima compra`
                : "Paga tu próximo apartado y empieza a sumar"}
            </p>
          </div>
          <span className="text-[10px] font-black opacity-70 text-amber-700 dark:text-amber-300 group-hover:translate-x-0.5 transition-transform">
            Ver →
          </span>
        </div>
        {showProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[9px] font-bold mb-1">
              <span className="text-amber-700 dark:text-amber-300">
                Te faltan {minRedeem - pts} pts para canjear
              </span>
              <span className="text-slate-500 tabular-nums">
                {pts}/{minRedeem}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-amber-200/60 dark:bg-amber-500/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </button>
      <LoyaltyDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/* ─────────────────────────────────────────────────────────────
 * Mi estilo — cliente personaliza color + emoji + tema de su sesión.
 * El color sobreescribe el theme_accent del admin SOLO en su
 * dispositivo (localStorage); el admin sigue mandando el global
 * para clientes que no eligieron nada. El emoji aparece en el
 * identity card y futuros lugares (chat bubble, avatar fallback).
 * El selector de tema reutiliza `useTheme` (mari-theme localStorage).
 * Incluye preview en vivo: un mini botón demo que se pinta con el
 * color elegido para que el cliente vea cómo se verá.
 * ───────────────────────────────────────────────────────────── */

const CLIENT_EMOJIS = ["✨", "💖", "🛍️", "🌸", "🎀", "🦋", "☀️", "🌙", "🌷", "💎", "🍓", "👑"]

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
]

/* ─────────────────────────────────────────────────────────────
 * QuickPreferencesSection
 * Controles que antes vivían en el header del shop (sonido,
 * tema, WhatsApp directo). Movidos al perfil para no saturar el
 * header (Cart + Bell + Avatar es suficiente).
 *
 * Render: 3 botones-icono con label arriba. Mantienen la lógica
 * existente de cada componente (no duplicamos handlers).
 * ───────────────────────────────────────────────────────────── */
function QuickPreferencesSection() {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 px-0.5">
        Preferencias rápidas
      </h4>
      <div className="grid grid-cols-3 gap-2">
        <PrefCell label="Sonido">
          <SoundToggle />
        </PrefCell>
        <PrefCell label="Tema">
          <ThemeToggle />
        </PrefCell>
        <PrefCell label="WhatsApp">
          <WhatsAppDirectButton />
        </PrefCell>
      </div>
    </section>
  )
}

function PrefCell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      {children}
      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 leading-none">
        {label}
      </span>
    </div>
  )
}

function MyStyleSection() {
  const { prefs, set } = useUserPrefs()
  const bRules = useBusinessRules()
  const { theme, setTheme } = useTheme()
  // useAuth aquí para poder persistir el emoji elegido en BD (no solo
  // en localStorage). Así Mari ve el emoji del cliente en su lista de
  // usuarios. Si no hay sesión (modo invitado), solo persiste local.
  const { user: authUser } = useAuth()
  const currentAccent = prefs.accentOverride ?? bRules.theme_accent
  const usingGlobal = prefs.accentOverride === null
  // Si la tienda forzó un modo (dark u light), bloqueamos el selector
  // personal: aplicar la regla del admin manda. Mostramos al cliente
  // exactamente CUÁL modo está activo para que no se confunda.
  const forcedDark = bRules.force_dark_mode
  const forcedLight = bRules.force_light_mode && !forcedDark
  const themeLocked = forcedDark || forcedLight
  const lockedLabel = forcedDark
    ? "forzado en modo oscuro"
    : forcedLight
    ? "forzado en modo claro"
    : null

  return (
    <section className="rounded-3xl p-4 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Palette size={11} className="text-primary" /> Mi estilo
        </h4>
        {!usingGlobal && (
          <button
            type="button"
            onClick={() => {
              set("accentOverride", null)
              toast.success("Usando el color de la tienda")
            }}
            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 press"
          >
            Quitar color
          </button>
        )}
      </div>

      {/* Grid de 7 colores — mismo que el admin, reutiliza constantes. */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
          Color de acento
          {usingGlobal && (
            <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
              · de la tienda
            </span>
          )}
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {ACCENT_NAMES.map((color) => {
            const isActive = currentAccent === color
            const isMyChoice = prefs.accentOverride === color
            return (
              <button
                key={color}
                type="button"
                onClick={() => set("accentOverride", color)}
                aria-label={ACCENT_LABELS[color]}
                title={ACCENT_LABELS[color]}
                className={`relative h-10 rounded-xl ring-2 transition-all ${
                  isActive
                    ? "ring-slate-900 dark:ring-white scale-105"
                    : "ring-transparent hover:ring-slate-300"
                }`}
                style={{ background: ACCENT_PREVIEW[color] }}
              >
                {isMyChoice && (
                  <CheckCircle2
                    size={12}
                    className="absolute inset-0 m-auto text-white drop-shadow"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selector emoji personal. */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
            Mi emoji
          </p>
          {prefs.clientEmoji && (
            <button
              type="button"
              onClick={() => {
                set("clientEmoji", null)
                // Limpiar también en BD si el usuario tiene sesión.
                // Best-effort: si falla (columna no existe), no rompemos.
                if (authUser?.id) {
                  updateMyProfile(authUser.id, { emoji: null }).catch(() => {})
                }
                toast.success("Emoji quitado")
              }}
              className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 press"
            >
              Quitar
            </button>
          )}
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {CLIENT_EMOJIS.map((emoji) => {
            const isActive = prefs.clientEmoji === emoji
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  set("clientEmoji", emoji)
                  // Persistir en BD para que Mari lo vea en lista admin.
                  // Si la columna emoji no existe aún en BD, fallback silencioso.
                  if (authUser?.id) {
                    updateMyProfile(authUser.id, { emoji }).catch(() => {})
                  }
                }}
                aria-label={`Emoji ${emoji}`}
                className={`h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                  isActive
                    ? "bg-primary/15 ring-2 ring-primary scale-110"
                    : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {emoji}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selector de tema — claro/oscuro/auto. Usa useTheme directo. */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
          Tema de la app
          {lockedLabel && (
            <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
              · {lockedLabel}
            </span>
          )}
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const isActive = theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => !themeLocked && setTheme(value)}
                disabled={themeLocked}
                className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  isActive
                    ? "bg-primary text-white shadow-bloom"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                } ${themeLocked ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Icon size={12} /> {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Preview en vivo del color elegido — un mini botón demo + chip
          que reaccionan al `--color-primary` / `--brand-from/to` actuales. */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
          Vista previa
        </p>
        <div className="flex items-center gap-2">
          <span
            className="h-9 px-3 rounded-xl text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-bloom"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
            }}
          >
            <Sparkles size={11} /> Apartar
          </span>
          <span className="h-9 px-3 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest flex items-center justify-center">
            +25 pts
          </span>
          <span className="ml-auto text-2xl">{prefs.clientEmoji ?? "🛍️"}</span>
        </div>
      </div>

      <p className="text-[9px] text-slate-400 italic leading-snug">
        Tu color, emoji y tema solo se aplican en este dispositivo. El
        admin mantiene su propio color para toda la tienda.
      </p>
    </section>
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

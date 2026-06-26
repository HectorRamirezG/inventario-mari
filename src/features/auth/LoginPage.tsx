import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles,
  Mail,
  Lock,
  ArrowRight,
  Send,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  User as UserIcon,
  Gift,
} from "lucide-react"
import toast from "react-hot-toast"
import { useAuth } from "../../lib/useAuth"
import { supabase } from "../../lib/supabase"
import { getLastSession, clearLastSession } from "../../lib/lastSession"
import { getReferredBy, clearReferredBy } from "../../lib/referral"
import Avatar from "../../components/ui/Avatar"
import {
  notifyAdmins,
  notifyClient,
} from "../notifications/notificationsService"

type Mode = "signin" | "signup" | "magic" | "reset"

/**
 * Feature flag para mostrar el botón "Continuar con Google".
 * Para habilitarlo:
 *   1. Activa el provider Google en Supabase Dashboard → Auth → Providers.
 *   2. Configura Client ID + Secret de Google Cloud Console.
 *   3. Cambia este flag a `true`.
 * Mientras esté en `false`, el botón no se renderiza (queda Google
 * deshabilitado en el lado servidor de todas formas).
 */
const GOOGLE_OAUTH_ENABLED = false

export default function LoginPage() {
  const { signInWithPassword, signUpWithPassword, sendMagicLink, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  // Smart Login: si hay sesión previa en este dispositivo, mostramos
  // "Continuar como X" con avatar. El user puede "Usar otra cuenta"
  // para revelar el form completo.
  const [last, setLast] = useState(() => getLastSession())
  const [quickMode, setQuickMode] = useState(() => !!getLastSession())
  // Referido: si la URL traía ?ref=email, lo mostramos como chip cuando
  // el modo es signup. Después del registro exitoso se incluye en la
  // notificación a admins para que Mari pueda otorgar los puntos.
  const [referredBy] = useState(() => getReferredBy())
  // Wave login polish:
  //  - capsLockOn: warning visible cuando el usuario tiene mayúsculas en
  //    el password input (común causa de "credenciales inválidas").
  //  - magicSentAt: timestamp del último magic link enviado para mostrar
  //    botón "Reenviar" con cooldown de 60s.
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [magicSentAt, setMagicSentAt] = useState<number | null>(null)
  const [magicResendIn, setMagicResendIn] = useState(0)

  // Si el user prellena email desde quick login, lo sincronizamos.
  useEffect(() => {
    if (quickMode && last?.email && !email) {
      setEmail(last.email)
    }
  }, [quickMode, last?.email, email])

  // Si la URL traía un referido y no hay sesión previa, mostramos signup
  // directamente — venimos de un link de invitación.
  useEffect(() => {
    if (referredBy && !last) {
      setMode("signup")
      setQuickMode(false)
    }
  }, [referredBy, last])

  // Cooldown del botón "Reenviar magic link" — 60s desde el último envío.
  // Decrementa cada segundo. Si no hay envío reciente, valor 0.
  useEffect(() => {
    if (!magicSentAt) return
    const tick = () => {
      const elapsedMs = Date.now() - magicSentAt
      const remaining = Math.max(0, Math.ceil((60_000 - elapsedMs) / 1000))
      setMagicResendIn(remaining)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [magicSentAt])

  // Detecta Caps Lock en cualquier input para mostrar warning visible.
  // Modifies state SOLO si cambia (evita re-renders innecesarios).
  function handleCapsCheck(e: React.KeyboardEvent<HTMLInputElement>) {
    try {
      const isOn = e.getModifierState && e.getModifierState("CapsLock")
      if (isOn !== capsLockOn) setCapsLockOn(!!isOn)
    } catch {
      /* navegador viejo: ignorar */
    }
  }

  // Reenvía el magic link y reinicia el cooldown.
  async function resendMagic() {
    if (!email.trim() || magicResendIn > 0 || loading) return
    setLoading(true)
    try {
      await sendMagicLink(email.trim())
      toast.success("Te reenviamos el enlace ✨")
      setMagicSentAt(Date.now())
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo reenviar")
    } finally {
      setLoading(false)
    }
  }

  // Calcula la fuerza del password (0..4) para el meter visual.
  // Cuenta: longitud, mayúsculas, minúsculas, números, símbolos.
  function passwordStrength(p: string): {
    score: 0 | 1 | 2 | 3 | 4
    label: string
    tone: string
  } {
    if (!p) return { score: 0, label: "", tone: "" }
    let s = 0
    if (p.length >= 6) s++
    if (p.length >= 10) s++
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
    if (/[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
    const map = [
      { label: "Muy débil", tone: "bg-rose-500" },
      { label: "Débil", tone: "bg-rose-400" },
      { label: "Aceptable", tone: "bg-amber-400" },
      { label: "Fuerte", tone: "bg-emerald-500" },
      { label: "Muy fuerte", tone: "bg-emerald-600" },
    ]
    return { score: s as 0 | 1 | 2 | 3 | 4, ...map[s] }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      if (mode === "signin") {
        await signInWithPassword(email.trim(), password)
      } else if (mode === "signup") {
        await signUpWithPassword(
          email.trim(),
          password,
          fullName || email.split("@")[0]
        )
        toast.success(
          "Cuenta creada. Revisa tu correo si te pide confirmar."
        )
        // Notif al cliente nuevo (bienvenida) y a admins (heads-up)
        const cleanEmail = email.trim().toLowerCase()
        const displayName = (fullName || email.split("@")[0] || "Cliente").trim()
        notifyClient(cleanEmail, {
          type: "new_customer",
          title: `¡Bienvenida${displayName ? ", " + displayName : ""}! 💖`,
          body: "Tu cuenta de Beauty's Me ya está lista. Explora la tienda y arma tu wishlist.",
          link: "/tienda",
          metadata: { signup_at: new Date().toISOString() },
        }).catch(() => {})
        notifyAdmins({
          type: "new_customer",
          title: `Nueva clienta: ${displayName}`,
          body: referredBy
            ? `${cleanEmail}\n👯 Referida por: ${referredBy}`
            : cleanEmail,
          link: "/apartados",
          metadata: {
            email: cleanEmail,
            name: displayName,
            referred_by: referredBy ?? null,
          },
        }).catch(() => {})
        // Si vino con referido, lo limpiamos del storage para que no
        // se aplique a futuros signups del mismo dispositivo.
        if (referredBy) clearReferredBy()
      } else if (mode === "magic") {
        await sendMagicLink(email.trim())
        toast.success("Te enviamos un enlace mágico ✨")
        setMagicSentAt(Date.now())
      } else if (mode === "reset") {
        if (!email.trim()) {
          toast.error("Escribe tu correo primero")
          return
        }
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: window.location.origin + "/login" }
        )
        if (error) throw new Error(error.message)
        toast.success("Te enviamos un correo para restablecerla 📧")
        setMode("signin")
      }
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo iniciar sesión"
      // Mensajes más amigables que los crudos de Supabase
      const friendly =
        /invalid login credentials/i.test(msg)
          ? "Correo o contraseña incorrectos"
          : /email not confirmed/i.test(msg)
          ? "Confirma tu correo desde el enlace que te enviamos"
          : /user already registered/i.test(msg)
          ? "Ya existe una cuenta con ese correo. Inicia sesión."
          : msg
      toast.error(friendly)
    } finally {
      setLoading(false)
    }
  }

  const title = {
    signin: "Bienvenida de nuevo",
    signup: "Crea tu cuenta",
    magic: "Enlace mágico",
    reset: "Restablecer contraseña",
  }[mode]

  const subtitle = {
    signin: "Inicia sesión para apartar y ver tus pedidos.",
    signup: "Es gratis. Tu rol se asigna automáticamente.",
    magic: "Te enviamos un correo. Toca el enlace y entras sin contraseña.",
    reset: "Te enviaremos un correo con instrucciones.",
  }[mode]

  const ctaLabel = {
    signin: quickMode && last?.full_name ? `Continuar como ${last.full_name.split(" ")[0]}` : "Entrar",
    signup: "Crear cuenta",
    magic: "Enviar enlace",
    reset: "Enviar correo",
  }[mode]

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-5 overflow-hidden bg-white dark:bg-slate-950">
      {/* Aurora animada de fondo — 3 blobs con escala+rotación lenta. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.15, 1], rotate: [0, 25, 0], x: [0, 28, 0], y: [0, -16, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-40 -left-32 w-[68vw] h-[68vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(236,72,153,0.32), transparent 65%)", filter: "blur(80px)" }}
        />
        <motion.div
          animate={{ scale: [1.1, 1, 1.1], rotate: [0, -20, 0], x: [0, -32, 0], y: [0, 24, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-40 -right-32 w-[72vw] h-[72vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.30), transparent 65%)", filter: "blur(90px)" }}
        />
        <motion.div
          animate={{ scale: [1, 1.25, 1], x: [0, 18, 0], y: [0, -22, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/3 w-[40vw] h-[40vw] rounded-full -translate-x-1/2 -translate-y-1/2"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.18), transparent 70%)", filter: "blur(60px)" }}
        />

        {/* Sutil grano para feel editorial — usa SVG noise como background-image */}
        <div
          className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
      </div>

      {/* Logo flotante (encima del card) */}
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className="relative mb-5 flex flex-col items-center"
      >
        <motion.div
          animate={{ y: [0, -4, 0], rotate: [0, 2, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="w-16 h-16 rounded-3xl flex items-center justify-center shadow-[0_18px_50px_-12px_rgba(236,72,153,0.55)] ring-1 ring-white/60 dark:ring-white/20"
          style={{ background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)" }}
        >
          <Sparkles size={26} className="text-white" />
        </motion.div>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-50 leading-none">
          Beauty's Me
        </h1>
        <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 font-bold mt-1">
          Beauty · Cosméticos
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
        className="w-full max-w-sm bg-white/85 dark:bg-slate-900/75 backdrop-blur-2xl border border-white/60 dark:border-white/10 rounded-[2rem] p-7 shadow-[0_30px_80px_-25px_rgba(15,23,42,0.35)] dark:shadow-[0_30px_80px_-25px_rgba(0,0,0,0.7)]"
      >
        {/* Header del card: título + back button cuando aplica */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-[26px] font-black tracking-tight leading-[1.05] text-slate-900 dark:text-slate-50">
              {title}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-snug max-w-[15rem]">
              {subtitle}
            </p>
          </div>
          {mode !== "signin" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary flex items-center gap-1 mt-1 press"
              aria-label="Volver al inicio de sesión"
            >
              <ArrowLeft size={11} /> Volver
            </button>
          )}
        </div>

        {/* Chip de referido: visible cuando vino una invitación por URL
            y el modo es signup. Se borra del state al hacer signup OK. */}
        {referredBy && mode === "signup" && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/15 dark:to-teal-500/10 p-3 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-bloom">
              <Gift size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                Te invitó una amiga
              </p>
              <p className="text-[11px] font-black text-emerald-800 dark:text-emerald-200 truncate">
                {referredBy}
              </p>
              <p className="text-[9px] font-bold text-emerald-700/80 dark:text-emerald-300/80 leading-snug">
                Al registrarte y comprar, ambas ganan puntos extra
              </p>
            </div>
          </motion.div>
        )}

        {/* Smart Login: identity card del último user logueado.
            Aparece solo en modo signin si tenemos lastSession. */}
        {quickMode && last && mode === "signin" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="mb-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-fuchsia-500/5 to-violet-500/10 p-3 flex items-center gap-3 shadow-[0_8px_24px_-12px_rgba(236,72,153,0.4)]"
          >
            <Avatar
              name={last.full_name || last.email}
              src={last.avatar_url}
              size={44}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary/80">
                Continuar como
              </p>
              <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate leading-tight">
                {last.full_name || last.email.split("@")[0]}
              </p>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                {last.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearLastSession()
                setLast(null)
                setQuickMode(false)
                setEmail("")
              }}
              className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-500 self-start press"
              title="Olvidar este dispositivo y usar otra cuenta"
            >
              Otra
            </button>
          </motion.div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3" autoComplete="on">
          {/* Google OAuth — atajo arriba del email (signin + signup).
              Solo visible en esos modos y cuando el flag está ON.
              Mientras Google no esté configurado en Supabase Dashboard,
              el flag GOOGLE_OAUTH_ENABLED queda en false. */}
          {GOOGLE_OAUTH_ENABLED && (mode === "signin" || mode === "signup") && (
            <>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setBusy(true)
                    await signInWithGoogle()
                    // No hace falta navigate: el redirect de Google
                    // tomará control y volverá a /login con sesión.
                  } catch (e) {
                    const { translateError } = await import("../../lib/supabaseErrors")
                    toast.error(translateError(e, "No se pudo abrir Google"))
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
                className="flex items-center justify-center gap-2.5 h-12 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 text-sm font-black hover:border-slate-400 dark:hover:border-slate-500 active:scale-[0.98] transition-all disabled:opacity-50 press"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#EA4335" d="M12 5.04c1.97 0 3.74.68 5.13 1.99l3.83-3.83C18.66 1.18 15.6 0 12 0 7.32 0 3.26 2.7 1.28 6.65l4.46 3.46C6.71 7.16 9.13 5.04 12 5.04z" />
                  <path fill="#4285F4" d="M23.49 12.27c0-.82-.07-1.61-.21-2.37H12v4.5h6.46c-.28 1.5-1.12 2.77-2.39 3.62l3.86 3c2.26-2.09 3.56-5.17 3.56-8.75z" />
                  <path fill="#FBBC05" d="M5.74 14.27a7.25 7.25 0 0 1 0-4.54L1.28 6.27a12 12 0 0 0 0 11.46l4.46-3.46z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.86-3c-1.07.72-2.45 1.15-4.07 1.15-2.87 0-5.29-2.12-6.16-4.97l-4.46 3.46C3.26 21.3 7.32 24 12 24z" />
                </svg>
                Continuar con Google
              </button>
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  o con email
                </span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>
            </>
          )}

          <AnimatePresence>
            {mode === "signup" && (
              <motion.label
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12 overflow-hidden border border-transparent focus-within:border-primary/40 transition-colors"
              >
                <UserIcon size={16} className="text-slate-400 shrink-0" />
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="name"
                  className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100 placeholder:text-slate-400"
                />
              </motion.label>
            )}
          </AnimatePresence>

          <label className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12 border border-transparent focus-within:border-primary/40 transition-colors">
            <Mail size={16} className="text-slate-400 shrink-0" />
            <input
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              readOnly={quickMode && mode === "signin"}
              className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100 placeholder:text-slate-400"
            />
          </label>

          <AnimatePresence>
            {(mode === "signin" || mode === "signup") && (
              <motion.label
                key="pwd"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12 overflow-hidden border border-transparent focus-within:border-primary/40 transition-colors"
              >
                <Lock size={16} className="text-slate-400 shrink-0" />
                <input
                  required
                  type={showPwd ? "text" : "password"}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleCapsCheck}
                  onKeyUp={handleCapsCheck}
                  placeholder={
                    mode === "signin" ? "Contraseña" : "Mínimo 6 caracteres"
                  }
                  minLength={mode === "signup" ? 6 : undefined}
                  className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 press"
                  aria-label={
                    showPwd ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </motion.label>
            )}
          </AnimatePresence>

          {/* Caps Lock warning — aparece solo cuando hay tecla CAPS Y
              el usuario está escribiendo contraseña. Causa común de
              fallos en signin. */}
          <AnimatePresence>
            {capsLockOn && (mode === "signin" || mode === "signup") && (
              <motion.div
                key="capslock"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-[10px] font-black text-amber-700 dark:text-amber-300"
              >
                <span className="text-base">⚠️</span>
                <span>Mayúsculas activadas (Caps Lock)</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Password strength meter — solo en signup, cuando hay algo
              escrito. Visual: 4 barritas que se llenan + label. */}
          <AnimatePresence>
            {mode === "signup" && password.length > 0 && (
              <motion.div
                key="pwd-strength"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1 overflow-hidden"
              >
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => {
                    const s = passwordStrength(password)
                    const active = i < s.score
                    return (
                      <div
                        key={i}
                        className={`flex-1 h-1.5 rounded-full transition-colors ${
                          active ? s.tone : "bg-slate-200 dark:bg-slate-700"
                        }`}
                      />
                    )
                  })}
                </div>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {passwordStrength(password).label}
                  {passwordStrength(password).score < 3 && password.length >= 6 && (
                    <span className="opacity-70 ml-1">
                      · agrega mayúsculas, números o símbolos
                    </span>
                  )}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => setMode("reset")}
              className="self-end text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary press"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="relative h-12 rounded-2xl font-black text-sm text-white shadow-[0_10px_30px_-8px_rgba(236,72,153,0.6)] flex items-center justify-center gap-2 disabled:opacity-60 overflow-hidden"
            style={{
              background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)",
            }}
          >
            {/* Shine que cruza el botón cada 4s */}
            {!loading && (
              <motion.span
                aria-hidden
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                animate={{ x: ["-150%", "350%"] }}
                transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
              />
            )}
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                {mode === "magic" ? (
                  <Send size={14} />
                ) : mode === "reset" ? (
                  <KeyRound size={14} />
                ) : (
                  <ArrowRight size={14} />
                )}
                <span className="relative z-10">{ctaLabel}</span>
              </>
            )}
          </motion.button>
        </form>

        {/* Reenviar magic link con cooldown 60s. Visible solo si ya hubo
            un envío reciente. Si el correo no llegó, evita pánico. */}
        <AnimatePresence>
          {mode === "magic" && magicSentAt && (
            <motion.div
              key="resend-magic"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-center"
            >
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                ¿No te llegó el correo? Revisa tu spam.
              </p>
              <button
                type="button"
                onClick={resendMagic}
                disabled={magicResendIn > 0 || loading}
                className="h-8 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-[10px] font-black uppercase tracking-widest text-primary disabled:opacity-50 disabled:cursor-not-allowed press"
              >
                {magicResendIn > 0
                  ? `Reenviar en ${magicResendIn}s`
                  : "Reenviar enlace"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cambiar de modo */}
        {(mode === "signin" || mode === "signup" || mode === "magic") && (
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800/70">
            {mode === "signin" && (
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                ¿No tienes cuenta?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="text-primary font-black underline-offset-2 hover:underline press"
                >
                  Crear una gratis
                </button>
                <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
                <button
                  onClick={() => setMode("magic")}
                  className="text-slate-500 dark:text-slate-400 font-black hover:text-primary press"
                >
                  Enlace mágico
                </button>
              </p>
            )}
            {mode === "signup" && (
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                ¿Ya tienes cuenta?{" "}
                <button
                  onClick={() => setMode("signin")}
                  className="text-primary font-black press"
                >
                  Inicia sesión
                </button>
              </p>
            )}
            {mode === "magic" && (
              <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                <button
                  onClick={() => setMode("signin")}
                  className="text-primary font-black press"
                >
                  Volver a contraseña
                </button>
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* Pie discreto */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="mt-6 text-center text-[10px] uppercase tracking-[0.3em] text-slate-400 dark:text-slate-600 font-bold flex items-center gap-1.5"
      >
        Hecho con <span className="text-rose-500 dark:text-rose-400">♥</span> para tu rutina diaria
      </motion.p>
    </div>
  )
}

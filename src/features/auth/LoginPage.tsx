import { useState } from "react"
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
} from "lucide-react"
import toast from "react-hot-toast"
import { useAuth } from "../../lib/useAuth"
import { supabase } from "../../lib/supabase"
import {
  notifyAdmins,
  notifyClient,
} from "../notifications/notificationsService"

type Mode = "signin" | "signup" | "magic" | "reset"

export default function LoginPage() {
  const { signInWithPassword, signUpWithPassword, sendMagicLink } = useAuth()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

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
          body: cleanEmail,
          link: "/apartados",
          metadata: { email: cleanEmail, name: displayName },
        }).catch(() => {})
      } else if (mode === "magic") {
        await sendMagicLink(email.trim())
        toast.success("Te enviamos un enlace mágico ✨")
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
    signin: "Entrar",
    signup: "Crear cuenta",
    magic: "Enviar enlace",
    reset: "Enviar correo",
  }[mode]

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-hidden bg-white dark:bg-slate-950">
      {/* Mesh de fondo */}
      <div className="absolute inset-0 -z-10">
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 16, repeat: Infinity }}
          className="absolute -top-32 -left-32 w-[60vw] h-[60vw] rounded-full bg-primary/25 blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
          className="absolute -bottom-32 -right-32 w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: "rgba(168, 85, 247, 0.25)" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm bg-white/85 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/40 dark:border-slate-700/40 rounded-3xl p-7 shadow-premium"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-bloom"
            style={{ background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)" }}
          >
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none">
              Mari
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Beauty · Cosméticos
            </p>
          </div>
          {mode !== "signin" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary flex items-center gap-1"
            >
              <ArrowLeft size={11} /> Volver
            </button>
          )}
        </div>

        <h2 className="text-2xl font-black tracking-tight mb-1">{title}</h2>
        <p className="text-xs text-slate-500 mb-5">{subtitle}</p>

        <form onSubmit={submit} className="flex flex-col gap-3" autoComplete="on">
          <AnimatePresence>
            {mode === "signup" && (
              <motion.label
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12 overflow-hidden"
              >
                <UserIcon size={16} className="text-slate-400 shrink-0" />
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="name"
                  className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100"
                />
              </motion.label>
            )}
          </AnimatePresence>

          <label className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12">
            <Mail size={16} className="text-slate-400 shrink-0" />
            <input
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100"
            />
          </label>

          <AnimatePresence>
            {(mode === "signin" || mode === "signup") && (
              <motion.label
                key="pwd"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12 overflow-hidden"
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
                  placeholder={
                    mode === "signin" ? "Contraseña" : "Mínimo 6 caracteres"
                  }
                  minLength={mode === "signup" ? 6 : undefined}
                  className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                  aria-label={
                    showPwd ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </motion.label>
            )}
          </AnimatePresence>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => setMode("reset")}
              className="self-end text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-2xl font-black text-sm text-white shadow-bloom flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)",
            }}
          >
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
                {ctaLabel}
              </>
            )}
          </button>
        </form>

        {/* Cambiar de modo */}
        {(mode === "signin" || mode === "signup" || mode === "magic") && (
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
            {mode === "signin" && (
              <p className="text-center text-[11px] text-slate-500">
                ¿No tienes cuenta?{" "}
                <button
                  onClick={() => setMode("signup")}
                  className="text-primary font-black underline-offset-2 hover:underline"
                >
                  Crear una gratis
                </button>
                <span className="mx-2 text-slate-300">·</span>
                <button
                  onClick={() => setMode("magic")}
                  className="text-slate-500 font-black hover:text-primary"
                >
                  Enlace mágico
                </button>
              </p>
            )}
            {mode === "signup" && (
              <p className="text-center text-[11px] text-slate-500">
                ¿Ya tienes cuenta?{" "}
                <button
                  onClick={() => setMode("signin")}
                  className="text-primary font-black"
                >
                  Inicia sesión
                </button>
              </p>
            )}
            {mode === "magic" && (
              <p className="text-center text-[11px] text-slate-500">
                <button
                  onClick={() => setMode("signin")}
                  className="text-primary font-black"
                >
                  Volver a contraseña
                </button>
              </p>
            )}
          </div>
        )}

        <p className="text-center text-[10px] uppercase tracking-widest text-slate-400 mt-6">
          BEAUTY'S ME · v2 · Premium
        </p>
      </motion.div>
    </div>
  )
}

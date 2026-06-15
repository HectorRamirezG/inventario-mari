import { useState } from "react"
import { motion } from "framer-motion"
import { Sparkles, Mail, Lock, ArrowRight, Send, Loader2 } from "lucide-react"
import toast from "react-hot-toast"
import { useAuth } from "../../lib/useAuth"

type Mode = "signin" | "signup" | "magic"

export default function LoginPage() {
  const { signInWithPassword, signUpWithPassword, sendMagicLink } = useAuth()
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      if (mode === "signin") {
        await signInWithPassword(email.trim(), password)
      } else if (mode === "signup") {
        await signUpWithPassword(email.trim(), password, fullName || email.split("@")[0])
        toast.success("Cuenta creada. Revisa tu correo si pide confirmación.")
      } else {
        await sendMagicLink(email.trim())
        toast.success("Te enviamos un enlace mágico al correo ✨")
      }
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6 overflow-hidden">
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
        className="w-full max-w-sm bg-white/80 dark:bg-slate-900/70 backdrop-blur-2xl border border-white/40 dark:border-slate-700/40 rounded-3xl p-7 shadow-premium"
      >
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-bloom"
            style={{ background: "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)" }}
          >
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none">Mari</h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Inventario · Cosméticos
            </p>
          </div>
        </div>

        <h2 className="text-2xl font-black tracking-tight mb-1">
          {mode === "signin" && "Bienvenida de nuevo"}
          {mode === "signup" && "Crea tu cuenta"}
          {mode === "magic" && "Enlace mágico"}
        </h2>
        <p className="text-xs text-slate-500 mb-5">
          {mode === "magic"
            ? "Te mandamos un correo. Toca el enlace y entras sin contraseña."
            : "Tu rol (admin / cajera / cliente) se asigna automáticamente."}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <label className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12">
              <Sparkles size={16} className="text-slate-400" />
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
                className="bg-transparent outline-none flex-1 text-sm font-semibold"
              />
            </label>
          )}

          <label className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12">
            <Mail size={16} className="text-slate-400" />
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="bg-transparent outline-none flex-1 text-sm font-semibold"
            />
          </label>

          {mode !== "magic" && (
            <label className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 h-12">
              <Lock size={16} className="text-slate-400" />
              <input
                required
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="bg-transparent outline-none flex-1 text-sm font-semibold"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-2xl font-black text-sm text-white shadow-bloom flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)" }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                {mode === "magic" ? <Send size={14} /> : <ArrowRight size={14} />}
                {mode === "signin" && "Entrar"}
                {mode === "signup" && "Crear cuenta"}
                {mode === "magic" && "Enviar enlace"}
              </>
            )}
          </button>
        </form>

        <div className="flex items-center justify-between gap-2 mt-5 text-[11px] font-bold">
          {mode !== "signin" ? (
            <button
              onClick={() => setMode("signin")}
              className="text-slate-500 hover:text-primary"
            >
              Iniciar sesión
            </button>
          ) : (
            <button
              onClick={() => setMode("signup")}
              className="text-slate-500 hover:text-primary"
            >
              Crear cuenta
            </button>
          )}
          <button
            onClick={() => setMode(mode === "magic" ? "signin" : "magic")}
            className="text-primary"
          >
            {mode === "magic" ? "Usar contraseña" : "Enlace mágico"}
          </button>
        </div>

        <p className="text-center text-[10px] uppercase tracking-widest text-slate-400 mt-6">
          Mari · v2.0 · Premium
        </p>
      </motion.div>
    </div>
  )
}

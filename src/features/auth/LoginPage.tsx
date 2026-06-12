import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "react-hot-toast"
import { Sparkles, ShieldCheck, Mail, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"

import Card from "../../components/ui/Card"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [isEmailValid, setIsEmailValid] = useState<boolean | null>(null)

  // Validación en tiempo real
  useEffect(() => {
    if (email.length === 0) {
      setIsEmailValid(null)
      return
    }
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    setIsEmailValid(isValid)
  }, [email])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isEmailValid) {
      toast.error("Por favor, ingresa un correo válido 🌸")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    })

    if (error) {
      toast.error("Acceso denegado. Verifica tu cuenta.")
    } else {
      setSent(true)
      toast.success("Enlace enviado con éxito")
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center overflow-hidden selection:bg-primary/20">
      
      {/* FONDO PREMIUM CON MOVIMIENTO */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 30, 0],
            y: [0, -20, 0] 
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-10%] w-[100%] h-[60%] bg-primary/10 blur-[130px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, -40, 0],
            y: [0, 40, 0] 
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[50%] bg-violet-200/40 blur-[110px] rounded-full" 
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[420px] px-6 z-10"
      >
        <Card className="relative overflow-hidden p-8 md:p-10 rounded-[3.5rem] border-white/60 bg-white/60 backdrop-blur-3xl shadow-[0_40px_80px_-15px_rgba(0,0,0,0.1)]">
          
          {/* LOGO ANIMADO */}
          <div className="flex flex-col items-center text-center">
            <motion.div 
              whileHover={{ rotate: 15, scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              className="h-16 w-16 rounded-[1.8rem] bg-gradient-to-br from-primary to-pink-400 text-white flex items-center justify-center mb-6 shadow-bloom cursor-pointer"
            >
              <Sparkles size={28} className="drop-shadow-md" />
            </motion.div>

            <h1 className="text-3xl font-black text-slate-900 tracking-tighter italic">
              Mari <span className="text-primary not-italic tracking-normal">Inventory</span>
            </h1>
            
            <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">
              Sistema de Gestión Privado
            </p>
          </div>

          <AnimatePresence mode="wait">
            {!sent ? (
              <motion.form 
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onSubmit={handleLogin} 
                className="mt-10 space-y-5"
              >
                <div className="relative group">
                  <div className={`absolute left-5 top-1/2 -translate-y-1/2 transition-colors duration-300 ${
                    isEmailValid === true ? "text-emerald-500" : 
                    isEmailValid === false ? "text-red-400" : "text-slate-300 group-focus-within:text-primary"
                  }`}>
                    {isEmailValid === true ? <CheckCircle2 size={18} /> : <Mail size={18} />}
                  </div>
                  
                  <input
                    type="email"
                    inputMode="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
                    className={`w-full h-14 pl-12 pr-12 bg-slate-50/50 border rounded-2xl font-bold text-slate-900 outline-none transition-all text-sm shadow-inner-soft ${
                      isEmailValid === false ? "border-red-100 focus:ring-red-50 focus:border-red-200" : "border-slate-100 focus:bg-white focus:border-primary/30 focus:ring-8 focus:ring-primary/5"
                    }`}
                  />

                  {/* Icono de error si el correo no es válido */}
                  <AnimatePresence>
                    {isEmailValid === false && (
                      <motion.div 
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-red-400"
                      >
                        <AlertCircle size={18} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Mensaje de validación sutil */}
                <AnimatePresence>
                  {isEmailValid === false && (
                    <motion.p 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="text-[10px] font-black text-red-400 uppercase tracking-widest text-center"
                    >
                      Formato de correo inválido
                    </motion.p>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={loading || isEmailValid === false}
                  className="relative overflow-hidden w-full h-14 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] shadow-xl hover:shadow-primary/20 active:scale-[0.97] transition-all duration-300 disabled:opacity-30 flex items-center justify-center group"
                >
                  {loading ? (
                    <Loader2 className="animate-spin text-primary" size={20} />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>Acceder ahora</span>
                      <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.div 
                key="sent"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-10 p-8 rounded-[2.5rem] bg-primary/5 border border-primary/10 text-center"
              >
                <div className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center mx-auto mb-5 shadow-bloom">
                  <Mail size={24} />
                </div>
                <h3 className="text-slate-900 font-black text-lg">Check your inbox</h3>
                <p className="text-slate-500 text-[11px] font-bold mt-2 leading-relaxed italic">
                  Te enviamos un enlace mágico para entrar sin contraseña.
                </p>
                <button 
                  onClick={() => setSent(false)}
                  className="mt-6 text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 border-b border-primary/20 pb-1"
                >
                  Volver a intentar
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <footer className="mt-10 pt-6 border-t border-slate-50 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-[9px] text-slate-300 font-black uppercase tracking-widest">
              <ShieldCheck size={12} />
              Secured by Supabase Auth
            </div>
          </footer>
        </Card>
      </motion.div>

      <div className="mt-8 opacity-20 flex gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  )
}
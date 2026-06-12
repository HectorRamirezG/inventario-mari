import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, Delete, Sparkles, Shield, ShoppingBag } from "lucide-react"
import { useRole, type Role } from "../../lib/useRole"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const

export default function PinGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, login, role, logout } = useRole()
  const [pin, setPin] = useState("")
  const [shake, setShake] = useState(false)
  const [lastRole, setLastRole] = useState<Role | null>(null)

  useEffect(() => {
    if (role && role !== lastRole) {
      setLastRole(role)
    }
  }, [role, lastRole])

  // Auto-intento cuando llega a 4 dígitos (PIN default)
  useEffect(() => {
    if (pin.length >= 4 && pin.length <= 8) {
      // Pequeño delay para que el usuario vea el último dígito
      const t = setTimeout(() => {
        const r = login(pin)
        if (!r) {
          setShake(true)
          setTimeout(() => {
            setShake(false)
            setPin("")
          }, 500)
        }
      }, 150)
      return () => clearTimeout(t)
    }
  }, [pin, login])

  // Atajo de teclado físico
  useEffect(() => {
    if (isAuthenticated) return
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") setPin(p => (p.length < 8 ? p + e.key : p))
      else if (e.key === "Backspace") setPin(p => p.slice(0, -1))
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isAuthenticated])

  if (isAuthenticated) {
    return (
      <>
        {children}
        {/* Botón flotante para cerrar sesión — sólo visible si autenticado */}
        <button
          onClick={logout}
          className="fixed bottom-3 left-3 z-[60] w-9 h-9 rounded-full bg-slate-900/80 backdrop-blur text-white text-[9px] font-black uppercase flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          {role === "admin" ? <Shield size={14} /> : <ShoppingBag size={14} />}
        </button>
      </>
    )
  }

  return (
    <PinScreen
      pin={pin}
      shake={shake}
      onDigit={d => setPin(p => (p.length < 8 ? p + d : p))}
      onBackspace={() => setPin(p => p.slice(0, -1))}
      onClear={() => setPin("")}
    />
  )
}

interface PinScreenProps {
  pin: string
  shake: boolean
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear: () => void
}

function PinScreen({ pin, shake, onDigit, onBackspace, onClear }: PinScreenProps) {
  const len = pin.length
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-slate-50"
    >
      {/* Fondo decorativo */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.15, 1], x: [0, 20, 0], y: [0, -10, 0] }}
          transition={{ duration: 14, repeat: Infinity }}
          className="absolute top-[-20%] left-[-20%] w-[80%] h-[60%] bg-primary/10 blur-3xl rounded-full"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity }}
          className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[50%] bg-blue-200/30 blur-3xl rounded-full"
        />
      </div>

      {/* Logo + título */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center mb-8"
      >
        <div className="w-14 h-14 rounded-[1.5rem] bg-primary text-white flex items-center justify-center shadow-bloom mb-3">
          <Sparkles size={22} />
        </div>
        <h1 className="text-2xl font-black italic tracking-tighter">
          Mari <span className="text-primary not-italic">Inventory</span>
        </h1>
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mt-1">
          Ingresa tu PIN
        </p>
      </motion.div>

      {/* Dots */}
      <motion.div
        animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-3 mb-8"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={i}
            initial={false}
            animate={{
              scale: len > i ? 1 : 0.7,
              backgroundColor: shake
                ? "#f43f5e"
                : len > i
                ? "#e6007e"
                : "#cbd5e1",
            }}
            className="w-3 h-3 rounded-full"
          />
        ))}
        {len > 4 && (
          <span className="text-[10px] font-black text-slate-500 ml-2">
            +{len - 4}
          </span>
        )}
      </motion.div>

      {/* Teclado */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {KEYS.map((k, i) => {
          if (k === "") return <div key={i} />
          if (k === "del") {
            return (
              <motion.button
                key={i}
                whileTap={{ scale: 0.9 }}
                onClick={onBackspace}
                className="h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center active:bg-slate-200"
                aria-label="Borrar"
              >
                <Delete size={18} />
              </motion.button>
            )
          }
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.9 }}
              onClick={() => onDigit(k)}
              className="h-14 rounded-2xl bg-white border border-slate-100 text-lg font-black text-slate-800 shadow-sm active:bg-primary/5"
            >
              {k}
            </motion.button>
          )
        })}
      </div>

      {/* Hint */}
      <AnimatePresence>
        {pin.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-6 text-center text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 leading-relaxed"
          >
            <p>Default Admin: 1234 · Cajera: 0000</p>
            <p className="text-rose-500 mt-1 flex items-center justify-center gap-1">
              <Lock size={9} /> Cámbialos desde Configuración
            </p>
          </motion.div>
        )}
        {pin.length > 0 && (
          <motion.button
            key="clear"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClear}
            className="mt-6 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500"
          >
            Borrar todo
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

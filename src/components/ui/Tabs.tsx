import { useState, createContext, useContext, useId } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "../../lib/utils"

/* ---------------- ROOT ---------------- */
const TabsContext = createContext<{ value: string; setValue: (v: string) => void; id: string } | null>(null)

export function Tabs({ defaultValue, children, className }: { defaultValue: string; children: React.ReactNode; className?: string }) {
  const [value, setValue] = useState(defaultValue)
  const id = useId() // Evita conflictos si usas varios Tabs en la misma pantalla

  return (
    <TabsContext.Provider value={{ value, setValue, id }}>
      <div className={cn("flex flex-col gap-6", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

/* ---------------- LIST ---------------- */
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "relative flex w-full p-1.5 gap-1",
      "rounded-[2rem] bg-pink-50/50 border border-pink-100/50 backdrop-blur-sm",
      "overflow-x-auto no-scrollbar shadow-inner-soft",
      className
    )}>
      {children}
    </div>
  )
}

/* ---------------- TRIGGER ---------------- */
export function TabsTrigger({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error("TabsTrigger must be inside Tabs")

  const active = ctx.value === value

  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cn(
        "relative flex-1 min-w-[100px] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.15em]",
        "rounded-full transition-all duration-300 flex items-center justify-center select-none",
        active ? "text-primary" : "text-slate-400 hover:text-slate-600",
        "active:scale-95",
        className
      )}
    >
      {active && (
        <motion.span
          layoutId={`indicator-${ctx.id}`}
          className="absolute inset-0 rounded-full bg-white shadow-premium border border-pink-100/20"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

/* ---------------- CONTENT ---------------- */
export function TabsContent({ value, children, className = "" }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error("TabsContent must be inside Tabs")

  return (
    <AnimatePresence mode="wait">
      {ctx.value === value && (
        <motion.div
          key={value}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className={`outline-none ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
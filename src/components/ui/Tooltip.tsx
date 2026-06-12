import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "../../lib/utils"

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  delay?: number
  className?: string
}

export default function Tooltip({ content, children, side = "top", delay = 150, className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    timeoutRef.current = setTimeout(() => setOpen(true), delay)
  }

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setOpen(false)
  }

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-3",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-3",
    left: "right-full top-1/2 -translate-y-1/2 mr-3",
    right: "left-full top-1/2 -translate-y-1/2 ml-3"
  }

  // Clases para la flechita según el lado
  const arrowStyles = {
    top: "bottom-[-4px] left-1/2 -translate-x-1/2 border-t-slate-900",
    bottom: "top-[-4px] left-1/2 -translate-x-1/2 border-b-slate-900",
    left: "right-[-4px] top-1/2 -translate-y-1/2 border-l-slate-900",
    right: "left-[-4px] top-1/2 -translate-y-1/2 border-r-slate-900"
  }

  return (
    <div 
      className="relative inline-flex" 
      onMouseEnter={show} 
      onMouseLeave={hide} 
      onFocus={show} 
      onBlur={hide}
    >
      {children}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: side === "top" ? 5 : -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn("pointer-events-none absolute z-[100]", positions[side], className)}
          >
            {/* Contenedor con Glassmorphism Oscuro */}
            <div className="relative rounded-xl bg-slate-950/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 shadow-2xl border border-white/10">
              {content}
              
              {/* La flechita (Caret) */}
              <div className={cn("absolute w-0 h-0 border-4 border-transparent", arrowStyles[side])} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
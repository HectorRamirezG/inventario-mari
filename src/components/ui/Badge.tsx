import React from "react"
import { tv, type VariantProps } from "tailwind-variants"
import { motion } from "framer-motion"
import { cn } from "../../lib/utils"

// Definición de estilos con Tailwind Variants
const badge = tv({
  base: "inline-flex items-center gap-1.5 rounded-full border font-black uppercase tracking-[0.12em] leading-none select-none whitespace-nowrap transition-all duration-300",
  variants: {
    tone: {
      ok: "bg-emerald-50 text-emerald-600 border-emerald-100/50",
      warn: "bg-amber-50 text-amber-600 border-amber-100/50",
      bad: "bg-rose-50 text-rose-600 border-rose-100/50",
      info: "bg-sky-50 text-sky-600 border-sky-100/50",
      neutral: "bg-slate-50 text-slate-500 border-slate-200/50",
      primary: "bg-primary/10 text-primary border-primary/20"
    },
    size: {
      sm: "px-2.5 py-1 text-[9px]",
      md: "px-3 py-1.5 text-[10px]"
    }
  },
  defaultVariants: {
    tone: "neutral",
    size: "sm"
  }
})

// Estilos para el punto (dot) según el tono
const dotColors: Record<string, string> = {
  ok: "bg-emerald-500 shadow-[0_0_8px_#10b981]",
  warn: "bg-amber-500 shadow-[0_0_8px_#f59e0b]",
  bad: "bg-rose-500 shadow-[0_0_8px_#f43f5e]",
  info: "bg-sky-500 shadow-[0_0_8px_#0ea5e9]",
  neutral: "bg-slate-400 shadow-none",
  primary: "bg-primary shadow-[0_0_8px_var(--color-primary)]"
}

interface BadgeProps extends VariantProps<typeof badge> {
  children: React.ReactNode
  className?: string
  dot?: boolean
  pulse?: boolean
}

export default function Badge({
  tone,
  size,
  children,
  className,
  dot = false,
  pulse = false
}: BadgeProps) {
  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ y: -1 }} // Pequeña flotación al pasar el mouse
      className={cn(badge({ tone, size }), className)}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {/* Anillo de pulso infinito si pulse es true */}
          {pulse && (
            <span className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              dotColors[tone || "neutral"]
            )} />
          )}
          <span className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            dotColors[tone || "neutral"]
          )} />
        </span>
      )}

      {children}
    </motion.span>
  )
}
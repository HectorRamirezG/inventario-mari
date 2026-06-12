import React from "react"
import { tv, type VariantProps } from "tailwind-variants"
import { Loader2 } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "../../lib/utils"
import { useFeedback } from "../../lib/useFeedback"

const buttonStyles = tv({
  base: [
    "relative inline-flex items-center justify-center gap-2",
    "rounded-full px-6 py-3 text-[11px] font-black uppercase tracking-[0.15em]",
    "transition-all duration-300 select-none overflow-hidden",
    "disabled:opacity-40 disabled:pointer-events-none",
    "will-change-transform focus:outline-none"
  ],
  variants: {
    variant: {
      primary: "bg-primary text-white shadow-bloom hover:bg-primary-hover hover:shadow-primary/40",
      ghost: "bg-transparent text-slate-400 hover:bg-pink-50/50 hover:text-primary",
      danger: "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100/50",
      soft: "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/50",
      outline: "bg-white border border-pink-100 text-primary hover:bg-pink-50/30 shadow-sm"
    }
  },
  defaultVariants: {
    variant: "primary"
  }
})

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  isLoading?: boolean
  icon?: React.ReactNode
}

export default function Button({
  variant,
  isLoading = false,
  icon,
  className,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const { feedback } = useFeedback()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !isLoading) {
      feedback() // Ejecuta sonido/vibración
      onClick?.(e)
    }
  }

  return (
    <motion.button
      whileTap={{ scale: 0.94 }} // Efecto físico real
      className={cn(buttonStyles({ variant }), className)}
      disabled={disabled || isLoading}
      onClick={handleClick}
      {...props}
    >
      {/* CAPA DE BRILLO (Para el botón primario) */}
      {variant === 'primary' && (
        <span className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
      )}

      {/* CONTENIDO */}
      <div className={cn(
        "flex items-center gap-2 transition-all duration-300",
        isLoading ? "opacity-0 scale-90" : "opacity-100 scale-100"
      )}>
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="relative z-10">{children}</span>
      </div>

      {/* LOADER CENTRADO */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-current" />
        </div>
      )}
    </motion.button>
  )
}
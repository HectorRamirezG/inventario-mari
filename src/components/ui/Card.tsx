import React from "react"
import { motion } from "framer-motion"
import { cn } from "../../lib/utils"

interface CardProps {
  title?: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
  noPadding?: boolean
  icon?: React.ReactNode
  animate?: boolean
}

export default function Card({
  title,
  subtitle,
  right,
  children,
  className,
  noPadding = false,
  icon,
  animate = true
}: CardProps) {
  const hasHeader = title || subtitle || right || icon

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 20 } : false}
      animate={animate ? { opacity: 1, y: 0 } : false}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "bg-white/80 backdrop-blur-xl rounded-[2.5rem]", // Más redondeado estilo iOS
        "border border-pink-100/50 shadow-premium",
        "transition-all duration-500 ease-out",
        "hover:shadow-bloom hover:bg-white/95",
        className
      )}
    >
      {/* HEADER */}
      {hasHeader && (
        <div className="px-8 pt-8 pb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {/* ICON CON ESTILO BOUTIQUE */}
            {icon && (
              <div className="flex items-center justify-center h-12 w-12 rounded-[1.2rem] bg-pink-50 text-primary shrink-0 shadow-inner-soft border border-pink-100/30">
                {React.cloneElement(icon as React.ReactElement, { size: 22, strokeWidth: 2.5 })}
              </div>
            )}

            <div className="min-w-0">
              {subtitle && (
                <p className="text-[10px] font-black text-primary/60 uppercase tracking-[0.2em] mb-0.5">
                  {subtitle}
                </p>
              )}
              {title && (
                <h2 className="text-[18px] font-black text-slate-800 leading-none tracking-tight truncate">
                  {title}
                </h2>
              )}
            </div>
          </div>

          {/* ACCIÓN DERECHA */}
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}

      {/* CONTENT */}
      <div
        className={cn(
          "px-8 pb-8",
          !hasHeader && "pt-8",
          noPadding && "p-0 overflow-hidden rounded-[2.5rem]"
        )}
      >
        <div className={cn("relative", !noPadding && "space-y-6")}>
          {children}
        </div>
      </div>
    </motion.div>
  )
}
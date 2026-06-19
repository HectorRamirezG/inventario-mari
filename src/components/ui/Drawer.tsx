import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import { X } from "lucide-react"
import clsx from "clsx"
import { useEffect } from "react"

import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"

interface DrawerProps {
  open: boolean
  title?: string
  children: React.ReactNode
  onClose: () => void
  side?: "left" | "right" | "bottom"
  size?: "sm" | "md" | "lg"
  /** Desactivar drag-to-dismiss en bottom sheets. Default: activado. */
  draggable?: boolean
}

export default function Drawer({
  open,
  title,
  children,
  onClose,
  side = "bottom",
  size = "md",
  draggable = true,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-xl",
  }

  const sidePosition = {
    right: "right-0 top-0 h-full",
    left: "left-0 top-0 h-full",
    bottom: "bottom-0 left-0 w-full",
  }

  const motionVariants = {
    right: { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } },
    left: { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" } },
    bottom: { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } },
  }

  function handleDragEnd(_e: any, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_BACKDROP_TRANSITION}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/65"
          />

          <motion.div
            initial={motionVariants[side].initial}
            animate={motionVariants[side].animate}
            exit={motionVariants[side].exit}
            transition={OVERLAY_PANEL_TRANSITION}
            drag={side === "bottom" && draggable ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            className={clsx(
              "relative flex flex-col",
              "bg-white dark:bg-slate-900",
              "border border-slate-100 dark:border-slate-800",
              "shadow-[0_20px_60px_rgba(0,0,0,0.25)]",
              "text-slate-900 dark:text-slate-100",
              side === "bottom"
                ? "w-full rounded-t-[2rem] max-h-[90vh] touch-pan-y"
                : `w-full ${sizes[size]} h-full rounded-l-[2rem]`,
              sidePosition[side],
            )}
            style={{
              ...OVERLAY_PANEL_STYLE,
              paddingBottom:
                side === "bottom" ? "env(safe-area-inset-bottom)" : undefined,
            }}
          >
            {side === "bottom" && (
              <div className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing">
                <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
            )}

            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-[15px] font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 scroll-container-ios">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import clsx from "clsx"
import { useEffect } from "react"

interface DrawerProps {
  open: boolean
  title?: string
  children: React.ReactNode
  onClose: () => void
  side?: "left" | "right" | "bottom"
  size?: "sm" | "md" | "lg"
}

export default function Drawer({
  open,
  title,
  children,
  onClose,
  side = "bottom",
  size = "md"
}: DrawerProps) {

  /* ESC */
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-xl"
  }

  const sidePosition = {
    right: "right-0 top-0 h-full",
    left: "left-0 top-0 h-full",
    bottom: "bottom-0 left-0 w-full"
  }

  const motionVariants = {
    right: { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } },
    left: { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" } },
    bottom: { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex">

          {/* BACKDROP */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          />

          {/* DRAWER */}
          <motion.div
            initial={motionVariants[side].initial}
            animate={motionVariants[side].animate}
            exit={motionVariants[side].exit}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className={clsx(
              "relative bg-white flex flex-col",
              "border border-gray-100",
              "shadow-[0_20px_60px_rgba(0,0,0,0.25)]",

              side === "bottom"
                ? "w-full rounded-t-[2rem] max-h-[90vh]"
                : `w-full ${sizes[size]} h-full rounded-l-[2rem]`,

              sidePosition[side]
            )}
          >

            {/* HANDLE (solo mobile bottom) */}
            {side === "bottom" && (
              <div className="flex justify-center py-2">
                <div className="h-1.5 w-10 rounded-full bg-gray-300" />
              </div>
            )}

            {/* HEADER */}
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">

                <h3 className="text-[15px] font-semibold text-slate-800">
                  {title}
                </h3>

                <button
                  onClick={onClose}
                  className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95 transition"
                >
                  <X size={16} className="text-slate-400" />
                </button>

              </div>
            )}

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {children}

            </div>

          </motion.div>

        </div>
      )}
    </AnimatePresence>
  )
}
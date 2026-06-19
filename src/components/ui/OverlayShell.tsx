import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import clsx from "clsx"

import {
  OVERLAY_BACKDROP_TRANSITION,
  OVERLAY_PANEL_STYLE,
  OVERLAY_PANEL_TRANSITION,
} from "../../lib/overlayMotion"

export type OverlayVariant = "sheet" | "modal" | "drawer-right" | "drawer-left"

interface OverlayShellProps {
  open: boolean
  variant?: OverlayVariant
  onClose: () => void
  children: React.ReactNode
  panelClassName?: string
  backdropClassName?: string
  zIndex?: number
  panelStyle?: React.CSSProperties
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
  lockBodyScroll?: boolean
  onAnimationComplete?: () => void
}

const ENTER: Record<OverlayVariant, Record<string, string | number>> = {
  sheet: { y: "100%" },
  modal: { opacity: 0, y: 12 },
  "drawer-right": { x: "100%" },
  "drawer-left": { x: "-100%" },
}

const REST: Record<OverlayVariant, Record<string, string | number>> = {
  sheet: { y: 0 },
  modal: { opacity: 1, y: 0 },
  "drawer-right": { x: 0 },
  "drawer-left": { x: 0 },
}

const POSITION: Record<OverlayVariant, string> = {
  sheet: "items-end justify-center",
  modal: "items-center justify-center p-4",
  "drawer-right": "items-stretch justify-end",
  "drawer-left": "items-stretch justify-start",
}

export default function OverlayShell({
  open,
  variant = "modal",
  onClose,
  children,
  panelClassName,
  backdropClassName,
  zIndex = 180,
  panelStyle,
  closeOnBackdrop = true,
  closeOnEsc = true,
  lockBodyScroll = true,
  onAnimationComplete,
}: OverlayShellProps) {
  useEffect(() => {
    if (!open || !closeOnEsc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, closeOnEsc, onClose])

  useEffect(() => {
    if (!open || !lockBodyScroll) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open, lockBodyScroll])

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={OVERLAY_BACKDROP_TRANSITION}
          className={clsx("fixed inset-0 flex", POSITION[variant])}
          style={{ zIndex, isolation: "isolate" }}
        >
          <div
            className={clsx(
              "absolute inset-0 bg-slate-950/70 z-0",
              backdropClassName,
            )}
            onClick={closeOnBackdrop ? onClose : undefined}
            aria-hidden
          />
          <motion.div
            initial={ENTER[variant]}
            animate={REST[variant]}
            exit={ENTER[variant]}
            transition={OVERLAY_PANEL_TRANSITION}
            onAnimationComplete={onAnimationComplete}
            className={clsx("relative z-10", panelClassName)}
            style={{ ...OVERLAY_PANEL_STYLE, ...panelStyle }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

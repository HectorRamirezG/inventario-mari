import { motion, AnimatePresence } from "framer-motion"
import { Heart } from "lucide-react"

interface Props {
  active: boolean
  onClick: (e: React.MouseEvent) => void
  size?: number
  className?: string
}

export default function WishlistHeart({ active, onClick, size = 14, className = "" }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      aria-label={active ? "Quitar de favoritos" : "Agregar a favoritos"}
      className={`relative w-9 h-9 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur shadow-sm flex items-center justify-center transition-transform active:scale-90 ${className}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={active ? "on" : "off"}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
        >
          <Heart
            size={size}
            strokeWidth={2.5}
            className={active ? "text-rose-500" : "text-slate-400"}
            fill={active ? "currentColor" : "none"}
          />
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

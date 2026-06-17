import { motion } from "framer-motion"

interface AnimatedCheckmarkProps {
  size?: number
  tone?: "success" | "primary" | "white"
  className?: string
}

/**
 * Checkmark animado por SVG stroke-dashoffset.
 * Úsalo dentro de modales de éxito (cobro, abono, guardado).
 * Tarda ~600ms; tras eso queda estático.
 */
export default function AnimatedCheckmark({
  size = 64,
  tone = "success",
  className,
}: AnimatedCheckmarkProps) {
  const palette = {
    success: { ring: "#10b981", check: "#10b981", bg: "#ecfdf5" },
    primary: { ring: "#e6007e", check: "#e6007e", bg: "#fff0f7" },
    white:   { ring: "#ffffff", check: "#ffffff", bg: "rgba(255,255,255,0.18)" },
  }[tone]

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 18 }}
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" fill={palette.bg} />
      <motion.circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke={palette.ring}
        strokeWidth="3"
        strokeDasharray="176"
        initial={{ strokeDashoffset: 176 }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      <motion.path
        d="M19 33 L28 42 L46 22"
        fill="none"
        stroke={palette.check}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="44"
        initial={{ strokeDashoffset: 44 }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ delay: 0.25, duration: 0.4, ease: "easeOut" }}
      />
    </motion.svg>
  )
}

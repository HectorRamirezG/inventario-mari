import { motion } from "framer-motion"

type Variant = "no-products" | "no-orders" | "no-results" | "no-photos" | "cart-empty"

interface Props {
  variant: Variant
  title: string
  subtitle?: string
  cta?: React.ReactNode
  className?: string
}

export default function EmptyStateIllustration({ variant, title, subtitle, cta, className = "" }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center text-center py-10 px-6 ${className}`}
    >
      <Illustration variant={variant} />
      <h3 className="mt-4 text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">
        {title}
      </h3>
      {subtitle && (
        <p className="mt-1 max-w-xs text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-snug">
          {subtitle}
        </p>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </motion.div>
  )
}

function Illustration({ variant }: { variant: Variant }) {
  switch (variant) {
    case "no-products":
      return <Box />
    case "no-orders":
      return <Bag />
    case "no-results":
      return <Search />
    case "no-photos":
      return <Camera />
    case "cart-empty":
      return <Heart />
  }
}

function Box() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="es-box" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbcfe8" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
      </defs>
      <rect x="22" y="40" width="76" height="60" rx="10" fill="url(#es-box)" />
      <rect x="22" y="40" width="76" height="14" rx="6" fill="#e6007e" opacity=".25" />
      <rect x="52" y="60" width="16" height="36" rx="4" fill="white" opacity=".7" />
      <circle cx="32" cy="30" r="6" fill="#a855f7" opacity=".5" />
      <circle cx="92" cy="26" r="4" fill="#fbbf24" opacity=".7" />
      <circle cx="80" cy="38" r="3" fill="#10b981" opacity=".7" />
    </svg>
  )
}

function Bag() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="es-bag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fce7f3" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity=".4" />
        </linearGradient>
      </defs>
      <path d="M30 46h60l-6 56a8 8 0 0 1-8 7H44a8 8 0 0 1-8-7l-6-56Z" fill="url(#es-bag)" />
      <path d="M44 46v-8a16 16 0 0 1 32 0v8" stroke="#e6007e" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="68" r="3" fill="#e6007e" />
      <circle cx="74" cy="68" r="3" fill="#e6007e" />
    </svg>
  )
}

function Search() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      <circle cx="50" cy="50" r="26" fill="none" stroke="#e6007e" strokeWidth="6" opacity=".55" />
      <line x1="72" y1="72" x2="96" y2="96" stroke="#a855f7" strokeWidth="8" strokeLinecap="round" />
      <circle cx="50" cy="50" r="14" fill="#fce7f3" />
      <path d="M40 50 h20 M50 40 v20" stroke="#e6007e" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Camera() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="es-cam" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f9a8d4" />
        </linearGradient>
      </defs>
      <rect x="20" y="38" width="80" height="56" rx="10" fill="url(#es-cam)" />
      <rect x="40" y="30" width="22" height="12" rx="4" fill="#fde68a" />
      <circle cx="60" cy="66" r="16" fill="white" />
      <circle cx="60" cy="66" r="10" fill="#a855f7" opacity=".4" />
      <circle cx="86" cy="48" r="3" fill="#e6007e" />
    </svg>
  )
}

function Heart() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="es-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M60 96 L26 60 a18 18 0 0 1 25-26 l9 9 9-9 a18 18 0 0 1 25 26 Z"
        fill="url(#es-heart)"
        opacity=".85"
      />
      <circle cx="42" cy="44" r="3" fill="white" opacity=".7" />
    </svg>
  )
}

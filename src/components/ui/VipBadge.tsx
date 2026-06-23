import { Crown } from "lucide-react"

interface VipBadgeProps {
  /** Tamaño de la corona en píxeles. Default 10 (mini-badge). */
  size?: number
  /** Si true, muestra solo el icono sin background; útil para overlay sobre avatar. */
  bare?: boolean
  className?: string
  /** Texto del tooltip al pasar el cursor. */
  title?: string
}

/**
 * Mini-corona dorada para identificar clientas VIP en avatars, listas
 * y cabeceras. Se usa como overlay en la esquina superior derecha del
 * Avatar (vía prop `vip`) o como pill standalone en headers.
 *
 * El criterio para "es VIP" se decide en el caller (gasto mensual >
 * threshold, lifetime earned > N, rol = 'vip', etc.). Este componente
 * solo se ocupa del visual.
 */
export default function VipBadge({
  size = 10,
  bare = false,
  className = "",
  title = "Cliente VIP",
}: VipBadgeProps) {
  if (bare) {
    return (
      <Crown
        size={size}
        className={`text-amber-500 fill-amber-400 ${className}`}
        aria-label={title}
      />
    )
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm ring-1 ring-amber-200/60 ${className}`}
      style={{ width: size + 4, height: size + 4 }}
    >
      <Crown size={size} strokeWidth={2.5} fill="currentColor" />
    </span>
  )
}

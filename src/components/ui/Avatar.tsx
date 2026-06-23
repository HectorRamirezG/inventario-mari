import { useState } from "react"
import { avatarGradient, initialsFromName, cn } from "../../lib/utils"
import { imageAvatar } from "../../lib/imageTransform"
import VipBadge from "./VipBadge"

interface AvatarProps {
  name?: string | null
  src?: string | null
  size?: number
  className?: string
  ring?: boolean
  /** Si true, dibuja una corona VIP dorada en la esquina superior derecha. */
  vip?: boolean
}

/**
 * Avatar reusable.
 * - Si hay src, lo muestra (con fallback automático a iniciales si falla la carga).
 * - Si no hay src, gradiente único por nombre + iniciales.
 * - Si vip=true, agrega corona VIP en la esquina superior derecha.
 */
export default function Avatar({
  name,
  src,
  size = 36,
  className,
  ring = false,
  vip = false,
}: AvatarProps) {
  const [errored, setErrored] = useState(false)
  const initials = initialsFromName(name)
  const gradient = avatarGradient(name || src || "anon")
  const showImage = src && !errored

  const fontSize = Math.max(10, Math.round(size * 0.38))
  // Tamaño proporcional del badge: ~30% del avatar pero mínimo 10px.
  const badgeSize = Math.max(10, Math.round(size * 0.32))

  // Si hay VIP, el wrapper no recorta para que el badge sobresalga.
  const wrapperCls = vip
    ? cn("relative shrink-0", className)
    : undefined

  const inner = (
    <div
      className={cn(
        "relative flex items-center justify-center shrink-0 rounded-full overflow-hidden text-white font-black select-none",
        ring && "ring-2 ring-white dark:ring-slate-900 shadow-sm",
        !vip && className,
      )}
      style={{
        width: size,
        height: size,
        background: showImage ? undefined : gradient,
        fontSize,
      }}
      aria-label={name || undefined}
    >
      {showImage ? (
        <img
          src={imageAvatar(src!) || src!}
          alt={name || ""}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
          width={size}
          height={size}
          decoding="async"
        />
      ) : (
        <span className="leading-none tracking-tight">{initials}</span>
      )}
    </div>
  )

  if (!vip) return inner

  return (
    <div className={wrapperCls} style={{ width: size, height: size }}>
      {inner}
      <span
        className="absolute -top-0.5 -right-0.5 pointer-events-none"
        aria-hidden
      >
        <VipBadge size={badgeSize} title={`${name ?? "Cliente"} VIP`} />
      </span>
    </div>
  )
}

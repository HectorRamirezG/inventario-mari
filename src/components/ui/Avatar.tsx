import { useState } from "react"
import { avatarGradient, initialsFromName, cn } from "../../lib/utils"

interface AvatarProps {
  name?: string | null
  src?: string | null
  size?: number
  className?: string
  ring?: boolean
}

/**
 * Avatar reusable.
 * - Si hay src, lo muestra (con fallback automático a iniciales si falla la carga).
 * - Si no hay src, gradiente único por nombre + iniciales.
 * Pensado para clientes, vendedoras, comentarios, etc.
 */
export default function Avatar({
  name,
  src,
  size = 36,
  className,
  ring = false,
}: AvatarProps) {
  const [errored, setErrored] = useState(false)
  const initials = initialsFromName(name)
  const gradient = avatarGradient(name || src || "anon")
  const showImage = src && !errored

  const fontSize = Math.max(10, Math.round(size * 0.38))

  return (
    <div
      className={cn(
        "relative flex items-center justify-center shrink-0 rounded-full overflow-hidden text-white font-black select-none",
        ring && "ring-2 ring-white dark:ring-slate-900 shadow-sm",
        className,
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
          src={src!}
          alt={name || ""}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <span className="leading-none tracking-tight">{initials}</span>
      )}
    </div>
  )
}

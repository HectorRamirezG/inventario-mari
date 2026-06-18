import { motion } from "framer-motion"
import { Phone, MapPin, Mail, MessageCircle, ExternalLink } from "lucide-react"
import Avatar from "./Avatar"

/**
 * Tarjeta compacta y reutilizable con los datos del cliente.
 * Se usa en: ticket público, modal de comanda, drawer de comprobante,
 * tarjetas de apartado, drawer de pago, etc.
 *
 * Patrón: si el dato existe, se muestra con su icono y se vuelve link
 * accionable (tel:, mailto:, mapa). Si no existe, se omite (no se
 * dibuja la fila vacía).
 *
 * NO permite editar — es solo display. Para edición usa los inputs
 * específicos del formulario.
 */
export interface CustomerInfoCardProps {
  name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  /** URL de Google Maps / Waze, o "lat,lng". */
  locationUrl?: string | null
  /** Avatar URL del cliente (si existe). */
  avatarUrl?: string | null
  /** Tamaño del componente. Default md (caja completa). */
  size?: "sm" | "md"
  /** Variante visual. */
  tone?: "default" | "muted"
  /** Mostrar acciones rápidas (WhatsApp/llamar/mapa). Default true. */
  showActions?: boolean
  /** Nota inferior opcional (ej. "última actualización…"). */
  footer?: React.ReactNode
}

/** Limpia un teléfono mexicano para tel:/wa.me. */
function phoneClean(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return "52" + digits
  return digits
}

export default function CustomerInfoCard({
  name,
  email,
  phone,
  address,
  locationUrl,
  avatarUrl,
  size = "md",
  tone = "default",
  showActions = true,
  footer,
}: CustomerInfoCardProps) {
  const padding = size === "sm" ? "p-3" : "p-4"
  const avatarSize = size === "sm" ? 36 : 48
  const cleanPhone = phone ? phoneClean(phone) : null
  const hasAnyContact = !!(phone || email || address || locationUrl)

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-slate-200 dark:border-slate-700 ${
        tone === "muted"
          ? "bg-slate-50/60 dark:bg-slate-800/40"
          : "bg-white dark:bg-slate-900"
      } ${padding}`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={name} src={avatarUrl} size={avatarSize} />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Cliente
          </p>
          <p
            className={`font-black text-slate-900 dark:text-slate-100 truncate ${
              size === "sm" ? "text-sm" : "text-base"
            }`}
          >
            {name || "Sin nombre"}
          </p>
          {email && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {email}
            </p>
          )}
        </div>
      </div>

      {hasAnyContact && (
        <div className="space-y-1.5 mt-3">
          {phone && (
            <a
              href={`tel:${cleanPhone}`}
              className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors"
            >
              <Phone size={11} className="text-emerald-500 shrink-0" />
              <span className="truncate">{phone}</span>
            </a>
          )}
          {address && (
            <p className="flex items-start gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-200">
              <MapPin size={11} className="text-rose-500 shrink-0 mt-0.5" />
              <span className="leading-snug">{address}</span>
            </p>
          )}
          {locationUrl && (
            <a
              href={locationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[11px] font-bold text-sky-600 hover:underline"
            >
              <ExternalLink size={11} className="shrink-0" />
              <span className="truncate">Abrir en mapa</span>
            </a>
          )}
        </div>
      )}

      {showActions && (phone || email) && (
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {cleanPhone && (
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-sm press"
            >
              <MessageCircle size={11} />
              WhatsApp
            </a>
          )}
          {email ? (
            <a
              href={`mailto:${email}`}
              className="h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
            >
              <Mail size={11} />
              Correo
            </a>
          ) : cleanPhone ? (
            <a
              href={`tel:${cleanPhone}`}
              className="h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
            >
              <Phone size={11} />
              Llamar
            </a>
          ) : null}
        </div>
      )}

      {footer && (
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {footer}
        </div>
      )}
    </motion.section>
  )
}

import { motion } from "framer-motion"
import { MessageCircle } from "lucide-react"
import { useLocation } from "react-router-dom"

const SUPPORT_PHONE = "5215611142961"  // formato internacional (+52 1 56 1114 2961)

/**
 * Devuelve un mensaje pre-llenado relevante a la pantalla actual.
 * Si la ruta es /ticket/:token, incluye el folio en el texto.
 */
function buildPrefilledMessage(pathname: string): string {
  const ticketMatch = pathname.match(/^\/ticket\/([^/?#]+)/i)
  if (ticketMatch) {
    const token = ticketMatch[1].slice(0, 8).toUpperCase()
    return `Hola Beauty's Me 💖, tengo una duda con mi apartado del Folio ${token}...`
  }
  if (pathname.startsWith("/mis-pedidos")) {
    return "Hola Beauty's Me 💖, tengo una duda sobre uno de mis pedidos..."
  }
  return "Hola Beauty's Me 💖, me gustaría preguntarte algo..."
}

/**
 * Botón flotante (FAB) de soporte por WhatsApp. Aparece SIEMPRE para el
 * cliente. Está pegado abajo-izquierda para no chocar con el FAB del
 * carrito (abajo-derecha) y respeta el safe-area.
 */
export default function WhatsAppSupportFab({
  bottomOffset = 80,
}: {
  /** Distancia en px desde el borde inferior (para evitar el dock). */
  bottomOffset?: number
}) {
  const { pathname } = useLocation()
  const msg = encodeURIComponent(buildPrefilledMessage(pathname))
  const href = `https://wa.me/${SUPPORT_PHONE}?text=${msg}`

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, rotate: -45 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.4 }}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      aria-label="Contactar soporte por WhatsApp"
      title="¿Dudas? Escríbenos a WhatsApp"
      className="fixed left-4 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-[0_15px_40px_-10px_rgba(37,211,102,0.55)] text-white"
      style={{
        bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))`,
        background: "linear-gradient(135deg,#25D366,#128C7E)",
      }}
    >
      <MessageCircle size={20} strokeWidth={2.4} fill="white" fillOpacity={0.15} />
      <motion.span
        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        className="absolute inset-0 rounded-full -z-10"
        style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}
      />
    </motion.a>
  )
}

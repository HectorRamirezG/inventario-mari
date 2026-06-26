import { MessageCircle } from "lucide-react"
import { useStoreInfo } from "../../lib/useStoreInfo"
import { cleanPhone } from "../../lib/format"
import { useFeedback } from "../../lib/useFeedback"
import { useAuth } from "../../lib/useAuth"

interface Props {
  className?: string
  /** Mensaje pre-escrito en el WhatsApp (opcional). */
  message?: string
}

/**
 * Botón compacto WhatsApp directo a Mari. Visible en el header del shop
 * cuando hay `store.phone` configurado. Si el cliente está logueado,
 * pre-llena con su nombre para que Mari no tenga que preguntar quién es.
 */
export default function WhatsAppDirectButton({ className = "", message }: Props) {
  const store = useStoreInfo()
  const { fullName, email } = useAuth()
  const { tap } = useFeedback()

  if (!store.phone) return null

  const clean = cleanPhone(store.phone)
  if (!clean) return null

  const greeting = fullName
    ? `Hola, soy ${fullName.split(" ")[0]}. `
    : email
    ? `Hola, soy ${email.split("@")[0]}. `
    : "Hola! "

  const text = message ?? `${greeting}tengo una duda sobre la tienda.`
  const href = `https://wa.me/${clean}?text=${encodeURIComponent(text)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => tap()}
      aria-label="Hablar con Mari por WhatsApp"
      title="Hablar con Mari por WhatsApp"
      className={`w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors active:scale-90 ${className}`}
    >
      <MessageCircle size={15} />
    </a>
  )
}

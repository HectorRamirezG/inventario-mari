import { useState } from "react"
import MessageCircle from "lucide-react/dist/esm/icons/message-circle"
import Loader2 from "lucide-react/dist/esm/icons/loader-2"
import Download from "lucide-react/dist/esm/icons/download"

import { downloadProductSticker } from "../products/productStickerService"
import { toastSuccess, toastError } from "../../lib/toast"

/**
 * Mini-botón reusable que genera y descarga un sticker WhatsApp 512×512
 * para un producto. Mari lo comparte → marketing gratis. También sirve
 * para clientes que quieren compartir el producto con sus amigas.
 */
export default function StickerWaButton({
  productName,
  imageUrl,
  price,
  variant = "ghost",
  iconOnly = false,
}: {
  productName: string
  imageUrl: string | null
  price: number
  variant?: "ghost" | "primary"
  /** Cuando true, sólo renderiza el icono (botón circular). Útil cuando
   *  el espacio es escaso (header de un drawer, etc.). */
  iconOnly?: boolean
}) {
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    setBusy(true)
    try {
      const ok = await downloadProductSticker({
        productName,
        imageUrl,
        price,
      })
      if (ok) {
        toastSuccess("Sticker descargado 🎀 compártelo en WhatsApp")
      } else {
        toastError("No se pudo generar el sticker")
      }
    } catch {
      toastError("Falló la generación del sticker")
    } finally {
      setBusy(false)
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label="Descargar sticker para WhatsApp"
        title="Genera un sticker 512×512 listo para WhatsApp"
        className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center active:scale-90 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <MessageCircle size={14} />
        )}
      </button>
    )
  }

  const cls =
    variant === "primary"
      ? "h-10 px-3 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom active:scale-95 disabled:opacity-50"
      : "h-9 px-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 active:scale-95 disabled:opacity-50"

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={cls}
      title="Genera un sticker 512×512 listo para WhatsApp"
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <MessageCircle size={12} />
      )}
      Sticker WA <Download size={11} />
    </button>
  )
}

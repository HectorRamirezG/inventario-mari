import { useEffect, useState } from "react"
import { Bell, Loader2, MessageCircle, Mail, User as UserIcon } from "lucide-react"
import toast from "react-hot-toast"

import Drawer from "./Drawer"
import EmptyStateIllustration from "./EmptyStateIllustration"
import {
  listStockSubscribers,
  type StockSubscriber,
} from "../../features/client/stockAlertsService"
import { formatRelative } from "../../lib/format"
import { copyToClipboard } from "../../lib/clipboard"

interface Props {
  open: boolean
  onClose: () => void
  variantId: string | null
  variantName?: string
  productName?: string
}

/**
 * Drawer admin: lista los clientes que pidieron "Avísame cuando llegue"
 * de una variante específica. Mari puede mandar WhatsApp manual a cada
 * uno desde aquí — útil para avisar ANTES de que el trigger SQL dispare
 * (ej. cuando aún no surte el stock pero quiere comprometerse).
 *
 * Best-effort: si la tabla `stock_alerts` no existe, queda en estado
 * vacío con CTA "Aún nadie está esperando".
 */
export default function StockSubscribersDrawer({
  open,
  onClose,
  variantId,
  variantName,
  productName,
}: Props) {
  const [subs, setSubs] = useState<StockSubscriber[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !variantId) {
      setSubs([])
      return
    }
    let alive = true
    setLoading(true)
    listStockSubscribers(variantId)
      .then((rows) => {
        if (alive) setSubs(rows)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, variantId])

  function buildWaMessage(s: StockSubscriber): string {
    const greet = s.name ? `Hola ${s.name.split(" ")[0]}` : "Hola"
    const item = variantName
      ? `${productName ? productName + " · " : ""}${variantName}`
      : productName ?? "tu producto"
    return `${greet} 💜 te avisamos que ya tenemos ${item} de regreso. ¿Te lo aparto? Beauty's Me ✨`
  }

  function openWhatsApp(s: StockSubscriber) {
    if (!s.phone) {
      toast.error("Esta clienta no tiene teléfono guardado")
      return
    }
    const clean = s.phone.replace(/[^\d]/g, "")
    if (clean.length < 10) {
      toast.error("Teléfono inválido")
      return
    }
    const msg = encodeURIComponent(buildWaMessage(s))
    window.open(`https://wa.me/${clean}?text=${msg}`, "_blank", "noopener")
  }

  async function copyEmail(s: StockSubscriber) {
    await copyToClipboard(s.email, "Email copiado")
  }

  const title = variantName
    ? `Esperan: ${variantName}`
    : "Clientas esperando stock"

  return (
    <Drawer open={open} onClose={onClose} title={title} side="bottom" size="md">
      <div className="px-5 pb-6 pt-2 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={16} className="animate-spin mr-2" />
            <span className="text-[11px] font-bold">Cargando…</span>
          </div>
        ) : subs.length === 0 ? (
          <div className="py-6">
            <EmptyStateIllustration
              variant="no-orders"
              title="Aún nadie está esperando"
              subtitle="Cuando una clienta toque «Avísame cuando llegue» en una variante agotada, aparecerá aquí."
            />
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-3 py-2 flex items-center gap-2">
              <Bell size={12} className="text-emerald-600 dark:text-emerald-300 shrink-0" />
              <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 leading-tight">
                {subs.length} {subs.length === 1 ? "clienta espera" : "clientas esperan"} esta variante. Al
                reponer stock recibirán notificación automática.
              </p>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              {subs.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[11px] font-black">
                    {(s.name || s.email)
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                      {s.name ?? s.email.split("@")[0]}
                      {!s.name && (
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                          invitada
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                      <Mail size={9} /> {s.email}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      {formatRelative(s.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.phone ? (
                      <button
                        type="button"
                        onClick={() => openWhatsApp(s)}
                        title={`Mandar WhatsApp a ${s.phone}`}
                        aria-label="Enviar WhatsApp"
                        className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-sm press"
                      >
                        <MessageCircle size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => copyEmail(s)}
                        title="Sin teléfono — copiar email"
                        aria-label="Copiar email"
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-700 flex items-center justify-center press"
                      >
                        <UserIcon size={13} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-[9px] text-slate-400 italic leading-snug">
              Si mandas WhatsApp ahora, la notificación automática se
              dispara igual cuando subas el stock. Para evitar doble
              aviso, considera apartar manualmente la pieza al mandar el
              mensaje.
            </p>
          </>
        )}
      </div>
    </Drawer>
  )
}

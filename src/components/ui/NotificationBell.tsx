import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  X,
  CreditCard,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Receipt,
  Sparkles,
} from "lucide-react"

import { useNotifications, type AppNotification } from "../../features/notifications/notificationsService"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} d`
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  })
}

const ICON: Record<string, typeof CreditCard> = {
  payment_added: CreditCard,
  sale_paid: CheckCircle2,
  sale_cancelled: XCircle,
  new_layaway: ShoppingBag,
  payment_proof_uploaded: Receipt,
  payment_proof_rejected: XCircle,
  proof_rejected: XCircle,
  price_adjusted: Sparkles,
  support_ticket: Bell,
}

/* Colores pastel ULTRA claros (compactos). El icono lleva su color más
 * intenso; el fondo es suavísimo para no saturar la lista. */
const COLOR: Record<string, string> = {
  payment_added:
    "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sale_paid:
    "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sale_cancelled:
    "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  new_layaway:
    "bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  payment_proof_uploaded:
    "bg-sky-50/70 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
  payment_proof_rejected:
    "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  proof_rejected:
    "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  price_adjusted:
    "bg-pink-50/70 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300",
  support_ticket:
    "bg-violet-50/70 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
}

/* Fondo suave del ROW (no del icono) según tipo. Mantiene tipografía esbelta. */
const ROW_BG: Record<string, string> = {
  payment_added: "bg-emerald-50/40 dark:bg-emerald-500/5",
  sale_paid: "bg-emerald-50/40 dark:bg-emerald-500/5",
  sale_cancelled: "bg-rose-50/40 dark:bg-rose-500/5",
  new_layaway: "bg-amber-50/40 dark:bg-amber-500/5",
  payment_proof_uploaded: "bg-sky-50/40 dark:bg-sky-500/5",
  payment_proof_rejected: "bg-rose-50/40 dark:bg-rose-500/5",
  proof_rejected: "bg-rose-50/40 dark:bg-rose-500/5",
  price_adjusted: "bg-pink-50/40 dark:bg-pink-500/5",
  support_ticket: "bg-violet-50/40 dark:bg-violet-500/5",
}

/** Etiqueta del CTA según tipo de notificación. */
function actionLabel(type: string): string | null {
  if (type === "payment_proof_uploaded") return "Revisar pago"
  if (type === "new_layaway") return "Ver apartado"
  if (type === "payment_added") return "Ver pedido"
  if (type === "price_adjusted") return "Ver pedido"
  if (type === "payment_proof_rejected") return "Ver pedido"
  if (type === "sale_paid" || type === "sale_cancelled") return "Ver pedido"
  return null
}

/**
 * Campana global de notificaciones. Renderiza un botón con badge y
 * abre un dropdown portal. Funciona en móvil (full-width) y desktop.
 */
export default function NotificationBell({
  align = "right",
}: {
  align?: "left" | "right"
}) {
  const { items, unread, markAsRead, markAllRead, removeNotification } =
    useNotifications()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return
      const drop = document.getElementById("mari-notif-dropdown")
      if (drop?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("touchstart", close)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("touchstart", close)
    }
  }, [open])

  const handleClick = async (n: AppNotification) => {
    if (!n.read_at) await markAsRead(n.id)
    setOpen(false)

    // Acciones especiales: en lugar de navegar, abre el drawer apropiado
    if (n.type === "payment_proof_uploaded") {
      const proofId = n.metadata?.proof_id as string | undefined
      if (proofId) {
        window.dispatchEvent(
          new CustomEvent("mari:open-proof", { detail: { proofId } })
        )
        return
      }
    }

    if (n.link) {
      if (/^https?:\/\//i.test(n.link)) {
        window.open(n.link, "_blank")
        return
      }
      // Para enlaces tipo /admin?proof=xxx → parsear y abrir drawer
      const url = new URL(n.link, window.location.origin)
      const proof = url.searchParams.get("proof")
      if (proof) {
        window.dispatchEvent(
          new CustomEvent("mari:open-proof", { detail: { proofId: proof } })
        )
        return
      }
      navigate(n.link)
    }
  }

  const handleMarkAll = async () => {
    await markAllRead()
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones"
        className="relative w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
      >
        <Bell size={15} />
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-900"
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              id="mari-notif-dropdown"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className={`fixed z-[200] w-[92vw] sm:w-[380px] max-h-[70vh] bg-white dark:bg-slate-900 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden ${
                align === "right"
                  ? "right-3 sm:right-6"
                  : "left-3 sm:left-6"
              }`}
              style={{
                top: (btnRef.current?.getBoundingClientRect().bottom ?? 60) + 8,
              }}
            >
              {/* Cabecera */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-primary" />
                  <h3 className="text-sm font-black tracking-tight">
                    Notificaciones
                  </h3>
                  {unread > 0 && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {unread} nuevas
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unread > 0 && (
                    <button
                      onClick={handleMarkAll}
                      className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-primary flex items-center gap-1 px-2 py-1 rounded-lg"
                      title="Marcar todas como leídas"
                    >
                      <CheckCheck size={11} /> Leer todas
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400"
                    aria-label="Cerrar"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Lista */}
              {items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
                  <BellOff size={28} className="text-slate-300 mb-2" />
                  <p className="text-sm font-black text-slate-500">
                    Todo tranquilo
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Aquí verás avisos cuando haya movimiento en tus apartados.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {items.map((n) => {
                    const Icon = ICON[n.type] ?? Bell
                    const tone = COLOR[n.type] ?? "bg-slate-50/70 text-slate-600"
                    const rowBg = ROW_BG[n.type] ?? ""
                    const unreadItem = !n.read_at
                    const cta = actionLabel(n.type)
                    // Si la notif trae motivo de rechazo en metadata o es proof_rejected
                    const rejectReason: string | null =
                      (n.type === "proof_rejected" || n.type === "payment_proof_rejected")
                        ? (n.metadata as any)?.reason ?? n.body ?? null
                        : null
                    return (
                      <div
                        key={n.id}
                        className={`relative flex gap-2.5 px-3 py-2 border-b border-slate-50 dark:border-slate-800/60 transition-colors ${
                          unreadItem
                            ? "bg-primary/5 dark:bg-primary/10"
                            : `${rowBg} hover:bg-slate-50 dark:hover:bg-slate-800/40`
                        }`}
                      >
                        <div className="flex gap-2.5 flex-1 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}
                          >
                            <Icon size={13} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-black truncate leading-tight">
                                {n.title}
                              </p>
                              {unreadItem && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              )}
                            </div>
                            {n.body && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                                {n.body}
                              </p>
                            )}
                            {rejectReason && (
                              <div className="mt-1 px-2 py-1 rounded-md bg-rose-50/80 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">
                                <p className="text-[9px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300 opacity-70">
                                  Motivo
                                </p>
                                <p className="text-[10px] text-rose-700 dark:text-rose-300 leading-tight">
                                  "{rejectReason}"
                                </p>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <p className="text-[9px] text-slate-400 font-bold">
                                {timeAgo(n.created_at)}
                              </p>
                              {cta && (
                                <button
                                  type="button"
                                  onClick={() => handleClick(n)}
                                  className="text-[9px] font-black uppercase tracking-widest text-white px-2 py-0.5 rounded-full shadow-bloom active:scale-95 transition-transform"
                                  style={{
                                    background:
                                      "linear-gradient(135deg,#e6007e,#a855f7)",
                                  }}
                                >
                                  {cta} →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeNotification(n.id)}
                          className="opacity-0 group-hover:opacity-100 sm:opacity-100 w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500 self-start"
                          title="Quitar"
                          aria-label="Quitar notificación"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

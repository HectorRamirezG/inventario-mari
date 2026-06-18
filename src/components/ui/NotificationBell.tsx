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
  LifeBuoy,
  Package,
  PackageX,
  PackageCheck,
  Truck,
  AlertTriangle,
  Trophy,
  Gift,
  UserPlus,
  Star,
  MessageCircle,
  Cake,
  Heart,
  Loader2,
  RotateCcw,
} from "lucide-react"
import toast from "react-hot-toast"

import { useNotifications, type AppNotification } from "../../features/notifications/notificationsService"
import { formatRelative } from "../../lib/format"
import { useAuth, isStaffOrAdmin } from "../../lib/useAuth"
import { approveProof, rejectProof } from "../../features/payments/paymentProofsService"
import { promptDialog } from "../../lib/prompt"
import { supabase } from "../../lib/supabase"

const ICON: Record<string, typeof CreditCard> = {
  // Pagos
  payment_added: CreditCard,
  sale_paid: CheckCircle2,
  sale_cancelled: XCircle,
  new_layaway: ShoppingBag,
  payment_proof: Receipt,
  payment_proof_uploaded: Receipt,
  payment_proof_received: Receipt,
  payment_proof_reminder: AlertTriangle,
  payment_approved: CheckCircle2,
  payment_rejected: XCircle,
  proof_rejected: XCircle,
  price_adjusted: Sparkles,
  // Apartados
  layaway_extension: ShoppingBag,
  layaway_due_soon: AlertTriangle,
  layaway_stale: AlertTriangle,
  // Soporte
  support_ticket: Bell,
  support_resolved: LifeBuoy,
  // Wishes
  wish_created: Heart,
  wish_status: Sparkles,
  wish_available: Sparkles,
  // Reviews
  review_created: Star,
  review_published: Star,
  // Delivery
  delivery_picked_up: Truck,
  delivery_delivered: PackageCheck,
  delivery_not_opened: AlertTriangle,
  // Stock
  stock_low: PackageX,
  stock_back: Package,
  // Milestones / lifecycle
  daily_goal: Trophy,
  birthday: Cake,
  new_customer: UserPlus,
  abandoned_cart: ShoppingBag,
}

/* Colores pastel ULTRA claros (compactos). El icono lleva su color más
 * intenso; el fondo es suavísimo para no saturar la lista. */
const COLOR: Record<string, string> = {
  // Verde — éxito / dinero entrando
  payment_added: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sale_paid: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  payment_approved: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  support_resolved: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  delivery_delivered: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  stock_back: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  wish_available: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  review_published: "bg-emerald-50/70 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  // Rojo — cancelado, rechazado, alerta dura
  sale_cancelled: "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  payment_rejected: "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  proof_rejected: "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  delivery_not_opened: "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  stock_low: "bg-rose-50/70 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300",
  // Ámbar — atención / recordatorio
  new_layaway: "bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  payment_proof_reminder: "bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  layaway_due_soon: "bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  layaway_stale: "bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  abandoned_cart: "bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  // Sky — info, comprobantes, entregas en camino
  payment_proof: "bg-sky-50/70 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
  payment_proof_uploaded: "bg-sky-50/70 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
  payment_proof_received: "bg-sky-50/70 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
  delivery_picked_up: "bg-sky-50/70 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
  // Pink — celebración, ajuste, soporte
  price_adjusted: "bg-pink-50/70 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300",
  daily_goal: "bg-pink-50/70 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300",
  birthday: "bg-pink-50/70 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300",
  new_customer: "bg-pink-50/70 dark:bg-pink-500/10 text-pink-700 dark:text-pink-300",
  // Violet — wishes, soporte, layaway extension
  support_ticket: "bg-violet-50/70 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
  wish_created: "bg-violet-50/70 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
  wish_status: "bg-violet-50/70 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
  layaway_extension: "bg-violet-50/70 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
  // Amarillo — reviews
  review_created: "bg-amber-50/70 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
}

/* Fondo suave del ROW (no del icono) según tipo. Mantiene tipografía esbelta. */
const ROW_BG: Record<string, string> = {
  payment_added: "bg-emerald-50/40 dark:bg-emerald-500/5",
  sale_paid: "bg-emerald-50/40 dark:bg-emerald-500/5",
  payment_approved: "bg-emerald-50/40 dark:bg-emerald-500/5",
  support_resolved: "bg-emerald-50/40 dark:bg-emerald-500/5",
  delivery_delivered: "bg-emerald-50/40 dark:bg-emerald-500/5",
  stock_back: "bg-emerald-50/40 dark:bg-emerald-500/5",
  wish_available: "bg-emerald-50/40 dark:bg-emerald-500/5",
  review_published: "bg-emerald-50/40 dark:bg-emerald-500/5",
  sale_cancelled: "bg-rose-50/40 dark:bg-rose-500/5",
  payment_rejected: "bg-rose-50/40 dark:bg-rose-500/5",
  proof_rejected: "bg-rose-50/40 dark:bg-rose-500/5",
  delivery_not_opened: "bg-rose-50/40 dark:bg-rose-500/5",
  stock_low: "bg-rose-50/40 dark:bg-rose-500/5",
  new_layaway: "bg-amber-50/40 dark:bg-amber-500/5",
  payment_proof_reminder: "bg-amber-50/40 dark:bg-amber-500/5",
  layaway_due_soon: "bg-amber-50/40 dark:bg-amber-500/5",
  layaway_stale: "bg-amber-50/40 dark:bg-amber-500/5",
  abandoned_cart: "bg-amber-50/40 dark:bg-amber-500/5",
  payment_proof: "bg-sky-50/40 dark:bg-sky-500/5",
  payment_proof_uploaded: "bg-sky-50/40 dark:bg-sky-500/5",
  payment_proof_received: "bg-sky-50/40 dark:bg-sky-500/5",
  delivery_picked_up: "bg-sky-50/40 dark:bg-sky-500/5",
  price_adjusted: "bg-pink-50/40 dark:bg-pink-500/5",
  daily_goal: "bg-pink-50/40 dark:bg-pink-500/5",
  birthday: "bg-pink-50/40 dark:bg-pink-500/5",
  new_customer: "bg-pink-50/40 dark:bg-pink-500/5",
  support_ticket: "bg-violet-50/40 dark:bg-violet-500/5",
  wish_created: "bg-violet-50/40 dark:bg-violet-500/5",
  wish_status: "bg-violet-50/40 dark:bg-violet-500/5",
  layaway_extension: "bg-violet-50/40 dark:bg-violet-500/5",
  review_created: "bg-amber-50/40 dark:bg-amber-500/5",
}

/** Etiqueta del CTA según tipo de notificación. */
function actionLabel(type: string): string | null {
  if (type === "payment_proof_uploaded" || type === "payment_proof") return "Revisar pago"
  if (type === "new_layaway") return "Ver apartado"
  if (type === "payment_added") return "Ver pedido"
  if (type === "price_adjusted") return "Ver pedido"
  if (type === "payment_proof_rejected" || type === "proof_rejected") return "Ver pedido"
  if (type === "sale_paid" || type === "sale_cancelled") return "Ver pedido"
  if (type === "delivery_picked_up" || type === "delivery_delivered") return "Ver pedido"
  if (type === "delivery_not_opened") return "Llamar"
  if (type === "wish_available") return "Ver tienda"
  if (type === "wish_created" || type === "wish_status") return "Ver deseo"
  if (type === "stock_low" || type === "stock_back") return "Ver inventario"
  if (type === "support_ticket") return "Atender"
  if (type === "support_resolved") return "Ver respuesta"
  if (type === "review_created") return "Moderar"
  if (type === "layaway_due_soon" || type === "layaway_stale") return "Ver apartados"
  if (type === "daily_goal") return "Ver dashboard"
  if (type === "new_customer") return "Ver pedidos"
  if (type === "birthday") return "Saludar"
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
  const { items, unread, markAsRead, markAsUnread, markAllRead, removeNotification } =
    useNotifications()
  const { role } = useAuth()
  const isAdmin = isStaffOrAdmin(role)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<"unread" | "today" | "all">("unread")
  const [busyApprove, setBusyApprove] = useState<string | null>(null)
  const [busyReject, setBusyReject] = useState<string | null>(null)
  /**
   * Map de proof_id → status real (approved/rejected/pending). Lo cargamos
   * cuando abrimos el bell para saber qué notifs de comprobante ya fueron
   * procesadas — así escondemos los botones inline y mostramos un chip de
   * status definitivo en vez del CTA.
   */
  const [proofStatus, setProofStatus] = useState<Record<string, string>>({})
  const btnRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()

  /** Recolecta proof_ids de las notifs visibles y consulta status en batch. */
  useEffect(() => {
    if (!open || !isAdmin) return
    const ids = Array.from(
      new Set(
        items
          .filter(
            (n) =>
              n.type === "payment_proof" || n.type === "payment_proof_uploaded",
          )
          .map((n) => n.metadata?.proof_id as string | undefined)
          .filter((x): x is string => !!x),
      ),
    )
    if (ids.length === 0) {
      setProofStatus({})
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase
          .from("payment_proofs")
          .select("id,status")
          .in("id", ids)
        if (!alive || !data) return
        const map: Record<string, string> = {}
        for (const row of data as Array<{ id: string; status: string }>) {
          map[row.id] = row.status
        }
        setProofStatus(map)
      } catch {
        /* silencio: si falla simplemente no bloqueamos */
      }
    })()
    return () => {
      alive = false
    }
  }, [open, items, isAdmin])

  /**
   * Listener global: cuando otro componente (ReviewProofDrawer, palette,
   * etc.) aprueba/rechaza un proof, actualiza el state local para que
   * los botones se escondan al instante en el bell.
   */
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail
      if (!detail?.proofId || !detail?.status) return
      setProofStatus((m) => ({ ...m, [detail.proofId]: detail.status }))
    }
    window.addEventListener("mari:proof-status", handler)
    return () => window.removeEventListener("mari:proof-status", handler)
  }, [])

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
    if (
      n.type === "payment_proof_uploaded" ||
      n.type === "payment_proof"
    ) {
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

  /** Aprobar comprobante directamente desde la notif (sin abrir drawer). */
  const handleInlineApprove = async (n: AppNotification) => {
    const proofId = n.metadata?.proof_id as string | undefined
    const amount = Number(n.metadata?.amount ?? 0)
    const method = (n.metadata?.method as string) ?? "transferencia"
    if (!proofId || amount <= 0) {
      // Faltan datos: abre el drawer para que el admin complete
      handleClick(n)
      return
    }
    setBusyApprove(n.id)
    try {
      await approveProof(proofId, amount, method)
      // Optimistic update del status para que los botones desaparezcan ya.
      setProofStatus((m) => ({ ...m, [proofId]: "approved" }))
      toast.success("Pago aprobado")
      await markAsRead(n.id)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo aprobar")
    } finally {
      setBusyApprove(null)
    }
  }

  /** Rechazar comprobante con motivo directo desde la notif. */
  const handleInlineReject = async (n: AppNotification) => {
    const proofId = n.metadata?.proof_id as string | undefined
    if (!proofId) {
      handleClick(n)
      return
    }
    const reason = await promptDialog({
      title: "Motivo del rechazo",
      description: "Le aparecerá al cliente para que envíe uno nuevo.",
      placeholder: "Ej. Monto no coincide, imagen borrosa…",
      confirmLabel: "Rechazar",
      multiline: true,
    })
    if (reason === null) return
    setBusyReject(n.id)
    try {
      await rejectProof(proofId, reason || undefined)
      setProofStatus((m) => ({ ...m, [proofId]: "rejected" }))
      toast.success("Comprobante rechazado")
      await markAsRead(n.id)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo rechazar")
    } finally {
      setBusyReject(null)
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
        className="relative w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-primary hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group"
      >
        <span className={unread > 0 ? "wiggle-on-hover inline-flex animate-[wiggle_0.5s_ease-in-out_infinite_4s]" : "wiggle-on-hover inline-flex"}>
          <Bell size={15} />
        </span>
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 460, damping: 18 }}
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-900"
          >
            {unread > 9 ? "9+" : unread}
            <span className="absolute inset-0 rounded-full bg-rose-500 -z-10 animate-ping opacity-60" />
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

              <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                {(
                  [
                    { id: "unread", label: `Sin leer (${unread})` },
                    { id: "today", label: "Hoy" },
                    { id: "all", label: `Todas (${items.length})` },
                  ] as const
                ).map((f) => {
                  const active = filter === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={`h-7 px-3 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                        active
                          ? "bg-primary text-white shadow-bloom"
                          : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>

              {/* Lista */}
              {items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 px-6 text-center">
                  <div className="relative mb-3">
                    <div className="absolute inset-0 rounded-full bg-emerald-100/60 dark:bg-emerald-500/15 blur-xl" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-500/20 dark:to-emerald-500/5 flex items-center justify-center border border-emerald-200/60 dark:border-emerald-500/30">
                      <BellOff size={24} className="text-emerald-600 dark:text-emerald-300" />
                    </div>
                  </div>
                  <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                    Todo tranquilo
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-[220px] leading-snug">
                    Aquí verás avisos cuando haya movimiento en tus apartados o ventas.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800/60 stagger-list">
                  {items
                    .filter((n) => {
                      if (filter === "unread") return !n.read_at
                      if (filter === "today") {
                        const d = new Date(n.created_at)
                        const today = new Date()
                        return (
                          d.getFullYear() === today.getFullYear() &&
                          d.getMonth() === today.getMonth() &&
                          d.getDate() === today.getDate()
                        )
                      }
                      return true
                    })
                    .map((n) => {
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
                    const proofIdMeta = n.metadata?.proof_id as string | undefined
                    const proofCurrentStatus = proofIdMeta
                      ? proofStatus[proofIdMeta]
                      : undefined
                    const proofAlreadyHandled =
                      proofCurrentStatus === "approved" ||
                      proofCurrentStatus === "rejected"
                    const isProof =
                      isAdmin &&
                      (n.type === "payment_proof" || n.type === "payment_proof_uploaded") &&
                      !!proofIdMeta &&
                      !proofAlreadyHandled
                    const inlineApproveBusy = busyApprove === n.id
                    const inlineRejectBusy = busyReject === n.id
                    return (
                      <div
                        key={n.id}
                        className={`relative flex gap-2 px-2.5 py-1.5 transition-colors ${
                          unreadItem
                            ? "bg-primary/5 dark:bg-primary/10"
                            : `${rowBg} hover:bg-slate-50 dark:hover:bg-slate-800/40`
                        }`}
                      >
                        <div className="flex gap-2 flex-1 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone}`}
                          >
                            <Icon size={12} />
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
                            {n.body && !rejectReason && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                                {n.body}
                              </p>
                            )}
                            {rejectReason && (
                              <div className="mt-0.5 px-2 py-0.5 rounded-md bg-rose-100/80 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30">
                                <p className="text-[8px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300 opacity-70 leading-none">
                                  Motivo
                                </p>
                                <p className="text-[10px] text-rose-700 dark:text-rose-300 leading-tight">
                                  "{rejectReason}"
                                </p>
                              </div>
                            )}
                            {/* Acciones inline para comprobantes (admin) */}
                            {isProof && (
                              <div className="flex items-center gap-1 mt-1">
                                <button
                                  type="button"
                                  onClick={() => handleInlineApprove(n)}
                                  disabled={inlineApproveBusy || inlineRejectBusy}
                                  className="flex-1 h-6 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1"
                                >
                                  {inlineApproveBusy ? (
                                    <Loader2 size={10} className="animate-spin" />
                                  ) : (
                                    <CheckCircle2 size={10} />
                                  )}
                                  Aprobar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInlineReject(n)}
                                  disabled={inlineApproveBusy || inlineRejectBusy}
                                  className="flex-1 h-6 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-rose-500 hover:bg-rose-600 text-white shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-1"
                                >
                                  {inlineRejectBusy ? (
                                    <Loader2 size={10} className="animate-spin" />
                                  ) : (
                                    <XCircle size={10} />
                                  )}
                                  Rechazar
                                </button>
                              </div>
                            )}
                            {/* Estado final cuando ya se procesó */}
                            {proofAlreadyHandled && (
                              <div
                                className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                  proofCurrentStatus === "approved"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                    : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                                }`}
                              >
                                {proofCurrentStatus === "approved" ? (
                                  <CheckCircle2 size={10} />
                                ) : (
                                  <XCircle size={10} />
                                )}
                                {proofCurrentStatus === "approved"
                                  ? "Ya aprobado"
                                  : "Ya rechazado"}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <p className="text-[9px] text-slate-400 font-bold leading-none">
                                {formatRelative(n.created_at)}
                              </p>
                              {cta && !isProof && (
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
                        <div className="flex flex-col items-center gap-0.5 self-start opacity-60 hover:opacity-100 transition-opacity">
                          {n.read_at && (
                            <button
                              onClick={() => markAsUnread(n.id)}
                              className="w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:bg-primary/10 hover:text-primary"
                              title="Marcar como no leída"
                              aria-label="Marcar como no leída"
                            >
                              <RotateCcw size={9} />
                            </button>
                          )}
                          <button
                            onClick={() => removeNotification(n.id)}
                            className="w-5 h-5 rounded-md flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                            title="Quitar"
                            aria-label="Quitar notificación"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
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

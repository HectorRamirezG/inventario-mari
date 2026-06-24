import { useEffect, useState, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles, Receipt, CheckCircle2, Clock, ArrowRight,
  CreditCard, MessageCircle, ArrowLeft, Home, LifeBuoy,
  Share2, Download, QrCode, X, Copy, Printer,
} from "lucide-react"
import toast from "react-hot-toast"
import { supabase } from "../../lib/supabase"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { useAuth, isStaffOrAdmin } from "../../lib/useAuth"
import ReportPaymentButton from "../../components/ui/ReportPaymentButton"
import RequestExtensionButton from "../client/RequestExtensionButton"
import SupportModal from "../support/SupportModal"
import DeliveryStatusChip from "../../components/ui/DeliveryStatusChip"
import OrderProgressTracker, {
  type OrderProgressDelivery,
} from "../../components/ui/OrderProgressTracker"
import TicketTotalsDetailed from "../../components/ui/TicketTotalsDetailed"
import { shareUrl } from "../../lib/share"
import { shareTicketPdf } from "../../lib/shareImage"
import { copyToClipboard } from "../../lib/clipboard"
import OverlayShell from "../../components/ui/OverlayShell"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import { useFeedback } from "../../lib/useFeedback"
interface TicketItem {
  id: string
  product_name: string
  variant_name: string | null
  qty: number
  unit_price: number
  tier: string
}

interface TicketPayment {
  amount: number
  method: string | null
  created_at: string
}

interface PublicTicket {
  id: string
  public_token: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  customer_avatar?: string | null
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  payment_url: string | null
  notes: string | null
  adjustment_amount?: number | null
  adjustment_reason?: string | null
  shipping_amount?: number | null
  is_foreign_shipping?: boolean | null
  created_at: string
  items: TicketItem[]
  payments: TicketPayment[]
}

export default function PublicTicketPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, role } = useAuth()
  const [ticket, setTicket] = useState<PublicTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openSupport, setOpenSupport] = useState(false)
  const [openQR, setOpenQR] = useState(false)
  /** Status de la comanda más reciente asociada a esta venta. */
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null)
  const [deliveryFull, setDeliveryFull] = useState<OrderProgressDelivery | null>(null)
  const store = getStoreInfo()
  /** Ref al card principal — lo capturamos para generar el PDF. */
  const ticketCardRef = useRef<HTMLDivElement | null>(null)

  /** Vuelve a un home contextual según el usuario logueado. */
  const goHome = () => {
    if (session && isStaffOrAdmin(role)) navigate("/admin")
    else if (session) navigate("/mis-pedidos")
    else navigate("/")
  }

  /** URL público del ticket actual — base para Compartir y QR. */
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/ticket/${token}`
      : ""

  async function handleShare() {
    const r = await shareUrl({
      title: "Mi ticket de Beauty's Me",
      text: ticket
        ? `Ticket ${shortId(ticket.id)} · Total ${formatMoney(ticket.total)}`
        : undefined,
      url: publicUrl,
    })
    if (r === "copied") toast.success("Link copiado al portapapeles")
  }

  async function handlePdf() {
    if (!ticket) return
    await shareTicketPdf({
      node: ticketCardRef.current,
      filename: `ticket-${shortId(ticket.id)}.pdf`,
    })
  }

  useEffect(() => {
    if (!token) {
      setError("Sin token")
      setLoading(false)
      return
    }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc("get_public_ticket", {
        p_token: token,
      })
      if (!alive) return
      if (error) {
        setError(error.message)
      } else if (!data) {
        setError("Ticket no encontrado")
      } else {
        // El RPC puede devolver dos formatos según la versión instalada:
        //   A) Plano: { id, total, ..., items, payments }
        //   B) Anidado: { sale: { id, total, ... }, items, payments }
        // Aplanamos aquí para que el resto del componente siempre acceda
        // a ticket.id, ticket.total, etc. sin importar la forma.
        const raw = data as any
        const flat: any = raw?.sale ? { ...raw.sale } : { ...raw }
        flat.items = raw?.items ?? raw?.sale?.items ?? flat.items ?? []
        flat.payments = raw?.payments ?? raw?.sale?.payments ?? flat.payments ?? []
        if (!flat.id) {
          setError("Ticket inválido (sin id)")
        } else {
          setTicket(flat as PublicTicket)
        }
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [token])

  /**
   * Realtime: cuando admin valida un pago (UPDATE en sales o INSERT en
   * payments) volvemos a llamar a la RPC y refrescamos los totales. El
   * cliente ve su saldo cambiar al instante sin recargar.
   *
   * IMPORTANTE: solo actualizamos si paid/balance/status realmente cambian
   * para evitar bucles de renderizado por updates ruidosos.
   */
  useEffect(() => {
    if (!ticket?.id || !token) return
    let alive = true
    const apply = async () => {
      const { data } = await supabase.rpc("get_public_ticket", { p_token: token })
      if (!alive || !data) return
      const raw = data as any
      const flat: any = raw?.sale ? { ...raw.sale } : { ...raw }
      flat.items = raw?.items ?? raw?.sale?.items ?? flat.items ?? []
      flat.payments = raw?.payments ?? raw?.sale?.payments ?? flat.payments ?? []
      if (!flat.id) return
      const incoming = flat as PublicTicket
      setTicket((prev) => {
        if (!prev) return incoming
        // Skip si nada cambia (evita re-render → evita bucle de animaciones)
        if (
          prev.paid === incoming.paid &&
          prev.balance === incoming.balance &&
          prev.status === incoming.status
        ) {
          return prev
        }
        return incoming
      })
    }

    /** Carga la comanda más reciente con campos para el tracker. */
    const loadDelivery = async () => {
      try {
        const { data } = await supabase
          .from("delivery_notes")
          .select(
            "id,status,driver_name,driver_phone,picked_up_at,delivered_at,current_lat,current_lng,last_position_at",
          )
          .eq("sale_id", ticket.id)
          .order("created_at", { ascending: false })
          .limit(1)
        if (!alive) return
        const note = (data?.[0] as any) ?? null
        setDeliveryStatus(note?.status ?? null)
        setDeliveryFull(
          note
            ? {
                id: note.id,
                status: note.status,
                driver_name: note.driver_name ?? null,
                driver_phone: note.driver_phone ?? null,
                current_lat: note.current_lat ?? null,
                current_lng: note.current_lng ?? null,
                last_position_at: note.last_position_at ?? null,
                picked_up_at: note.picked_up_at ?? null,
                delivered_at: note.delivered_at ?? null,
              }
            : null,
        )
      } catch {
        /* tabla puede no existir o campos nuevos faltantes */
      }
    }
    loadDelivery()

    const channel = supabase
      .channel(`ticket-${ticket.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sales",
          filter: `id=eq.${ticket.id}`,
        },
        apply
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payments",
          filter: `sale_id=eq.${ticket.id}`,
        },
        apply
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_notes",
          filter: `sale_id=eq.${ticket.id}`,
        },
        loadDelivery
      )
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [ticket?.id, token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full"
        />
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-slate-50">
        <Receipt size={48} className="text-slate-300 mb-3" />
        <h1 className="text-xl font-black mb-1">Ticket no disponible</h1>
        <p className="text-sm text-slate-500">{error ?? "Enlace inválido o caducado."}</p>
        <button
          onClick={goHome}
          className="mt-6 h-11 px-5 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-bloom inline-flex items-center gap-2"
          style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
        >
          <Home size={14} /> Ir al inicio
        </button>
      </div>
    )
  }

  // Cálculos canónicos desde los datos primarios. Si la BD vino con
  // total/balance desincronizados (porque algún flujo viejo no recalculó),
  // los recomputamos aquí para que el cliente NUNCA vea cifras contradictorias.
  const subtotalReal = ticket.items.reduce(
    (a, it) => a + Number(it.qty) * Number(it.unit_price),
    0,
  )
  const adjReal = Number(ticket.adjustment_amount) || 0
  const shipReal = Number(ticket.shipping_amount) || 0
  const totalReal = Math.max(0, subtotalReal - adjReal + shipReal)
  const paidReal =
    ticket.payments?.reduce((a, p) => a + Number(p.amount || 0), 0) ??
    (Number(ticket.paid) || 0)
  const balanceReal = Math.max(0, totalReal - paidReal)

  const pct = totalReal > 0 ? Math.min(100, (paidReal / totalReal) * 100) : 0
  const isPaid = balanceReal <= 0

  return (
    <div className="min-h-screen pb-24 px-4 pt-8" style={{
      background: "radial-gradient(at 0% 0%, rgba(230,0,126,0.08) 0%, transparent 40%), radial-gradient(at 100% 100%, rgba(168,85,247,0.08) 0%, transparent 40%), #fafafa"
    }}>
      <div className="max-w-md mx-auto">
        {/* Botón volver (siempre visible para que nunca quede atrapado) */}
        <button
          onClick={goHome}
          className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary transition-colors"
        >
          <ArrowLeft size={12} />
          {session
            ? isStaffOrAdmin(role)
              ? "Volver al panel"
              : "Mis pedidos"
            : "Volver a la tienda"}
        </button>

        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center shadow-bloom"
            style={{ background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)" }}
          >
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">
              {store.name}
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Ticket digital
            </p>
          </div>
        </motion.div>

        {/* Toolbar acciones rápidas: Compartir / PDF / QR. Solo aparece
            cuando el ticket cargó. Va FUERA del card principal para
            no aparecer en la captura del PDF. */}
        {ticket && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className="flex items-center justify-center gap-2 mb-3 flex-wrap"
          >
            <ToolbarBtn label="Compartir" icon={Share2} onClick={handleShare} />
            <ToolbarBtn label="PDF" icon={Download} onClick={handlePdf} />
            <ToolbarBtn
              label="Imprimir"
              icon={Printer}
              onClick={() => window.print()}
            />
            <ToolbarBtn label="QR" icon={QrCode} onClick={() => setOpenQR(true)} />
          </motion.div>
        )}

        {/* Card principal */}
        <motion.div
          ref={ticketCardRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white/85 backdrop-blur-xl border border-white/60 rounded-3xl p-6 shadow-premium relative overflow-hidden"
        >
          {/* Borde de color según estado */}
          <div
            className="absolute top-0 left-0 right-0 h-1.5"
            style={{
              background: isPaid
                ? "linear-gradient(90deg,#10b981,#34d399)"
                : "linear-gradient(90deg, var(--brand-from), var(--brand-to))",
            }}
          />

          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Folio
              </p>
              <p className="text-base font-black tracking-tight">
                {shortId(ticket.id)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Fecha
              </p>
              <p className="text-xs font-bold">{formatDateTime(ticket.created_at)}</p>
            </div>
          </div>

          {ticket.customer_name && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Cliente
              </p>
              <p className="text-base font-black">{ticket.customer_name}</p>
            </div>
          )}

          {/* Items */}
          <div className="divide-y divide-slate-100 mb-4">
            {ticket.items.map((it) => (
              <div key={it.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight truncate">
                    {it.product_name}
                  </p>
                  {it.variant_name && (
                    <p className="text-xs text-slate-500 truncate">{it.variant_name}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {it.qty} × {formatMoney(it.unit_price)}
                    {it.tier !== "menudeo" && (
                      <span className="ml-1 inline-flex px-1.5 py-0 rounded-full bg-primary/10 text-primary font-black uppercase tracking-widest text-[9px]">
                        {it.tier}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-sm font-black tabular-nums">
                  {formatMoney(it.qty * it.unit_price)}
                </p>
              </div>
            ))}
          </div>

          {/* Totales — desglose canónico compartido con TicketDrawer.
              `tone="light"` usa el fondo claro de la vista pública y muestra
              el ajuste con motivo expandido para máxima transparencia. */}
          <TicketTotalsDetailed
            items={ticket.items.map((it) => ({
              qty: Number(it.qty),
              unit_price: Number(it.unit_price),
            }))}
            total={totalReal}
            paid={paidReal}
            balance={balanceReal}
            adjustmentAmount={ticket.adjustment_amount}
            adjustmentReason={ticket.adjustment_reason}
            shippingAmount={ticket.shipping_amount}
            isForeignShipping={ticket.is_foreign_shipping}
            tone="light"
            discountCheerText={`Beauty's Me te apoyó con ${formatMoney(
              Number(ticket.adjustment_amount) || 0
            )} en este pedido ✨`}
          />

          {/* Banner de tier escalonado: si alguna línea va a precio
              distinto de menudeo, lo destacamos para que el cliente
              entienda por qué pagó menos por unidad. */}
          {(() => {
            const tiers = new Set(
              ticket.items.map((i) => (i.tier || "menudeo").toLowerCase()),
            )
            const hasMayoreo = tiers.has("mayoreo")
            const hasMedio = tiers.has("medio")
            if (!hasMayoreo && !hasMedio) return null
            const label = hasMayoreo ? "mayoreo" : "medio mayoreo"
            return (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="mt-2 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 text-sky-700"
              >
                <span className="text-base" aria-hidden>✨</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest leading-tight">
                    Precio {label} aplicado
                  </p>
                  <p className="text-[10px] font-bold leading-tight opacity-80">
                    Pagas el precio especial por la cantidad de piezas.
                  </p>
                </div>
              </motion.div>
            )
          })()}

          {/* Tracker dinámico: muta entre barra de pago, stepper de entrega
              y mini-mapa del repartidor en vivo según el estado actual. */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 px-4 py-4">
            <OrderProgressTracker
              total={totalReal}
              paid={paidReal}
              balance={balanceReal}
              delivery={deliveryFull}
            />
          </div>

          {/* Status de la comanda de entrega — banner descriptivo. */}
          {deliveryStatus && (
            <div className="mt-3 rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/60 dark:bg-sky-500/10 px-4 py-3 flex items-center gap-3">
              <DeliveryStatusChip
                status={deliveryStatus}
                size="md"
                pulseInTransit
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-300">
                  Entrega
                </p>
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                  {deliveryStatus === "picked_up"
                    ? "Tu pedido va en camino, te avisamos cuando llegue"
                    : deliveryStatus === "delivered"
                      ? "Entregado · esperamos que te encante"
                      : deliveryStatus === "sent"
                        ? "Repartidor asignado, pronto sale a entregar"
                        : deliveryStatus === "cancelled"
                          ? "La entrega fue cancelada"
                          : "Estamos preparando tu entrega"}
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* CTA: pagar online */}
        {!isPaid && ticket.payment_url && (
          <motion.a
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            href={ticket.payment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 h-14 rounded-2xl font-black text-white text-sm shadow-bloom"
            style={{ background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)" }}
          >
            <CreditCard size={18} />
            Pagar saldo pendiente
            <ArrowRight size={16} />
          </motion.a>
        )}

        {/* Reportar comprobante (autoservicio) */}
        {!isPaid && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-3"
          >
            <ReportPaymentButton
              saleId={ticket.id}
              balance={balanceReal}
              customerEmail={ticket.customer_email}
            />
            {ticket.is_layaway && (
              <RequestExtensionButton
                saleId={ticket.id}
                customerName={ticket.customer_name}
                customerEmail={ticket.customer_email}
              />
            )}
          </motion.div>
        )}

        {/* CTA: contactar por WhatsApp */}
        {store.phone && (
          <a
            href={`https://wa.me/${store.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
              `Hola, sobre mi ticket ${shortId(ticket.id)}...`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 h-12 rounded-2xl bg-emerald-500 text-white font-black text-sm"
          >
            <MessageCircle size={16} />
            Contactar por WhatsApp
          </a>
        )}

        {/* CTA: ¿Necesitas ayuda con tu pedido? (centro de soporte) */}
        <motion.button
          type="button"
          onClick={() => setOpenSupport(true)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.98 }}
          className="mt-3 w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-white border-2 border-dashed border-primary/40 text-primary font-black text-sm hover:bg-primary/5 transition-colors"
        >
          <LifeBuoy size={16} />
          ¿Necesitas ayuda con tu pedido?
        </motion.button>

        <p className="text-center text-[10px] uppercase tracking-widest text-slate-400 mt-8">
          {store.thanks_message}
        </p>
      </div>

      {/* Modal de incidencias */}
      <SupportModal
        open={openSupport}
        saleId={ticket.id}
        customerName={ticket.customer_name}
        onClose={() => setOpenSupport(false)}
      />

      {/* Modal QR del ticket — usa generador público qrserver.com (sin
          dependencias nuevas). El cliente lo muestra al repartidor o a
          quien necesite verificarlo. */}
      <QRModal open={openQR} onClose={() => setOpenQR(false)} url={publicUrl} />
    </div>
  )
}

/** Botón circular de la toolbar (Compartir / PDF / QR). Estilo flat
 *  blanco con icon arriba y label corto debajo. Incluye haptic feedback
 *  sutil en mobile. */
function ToolbarBtn({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof Share2
  onClick: () => void
}) {
  const { tap } = useFeedback()
  return (
    <button
      type="button"
      onClick={() => {
        tap()
        onClick()
      }}
      className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-2xl bg-white/80 backdrop-blur border border-slate-200 hover:bg-white hover:border-primary/40 hover:text-primary transition-colors shadow-sm press"
    >
      <Icon size={14} className="text-slate-700" />
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
        {label}
      </span>
    </button>
  )
}

/** Modal sencillo con el QR del ticket público. Usa
 *  `api.qrserver.com` (libre, sin auth). Si no hay internet, el `<img>`
 *  no carga y mostramos el URL como fallback copiable. */
function QRModal({
  open,
  onClose,
  url,
}: {
  open: boolean
  onClose: () => void
  url: string
}) {
  useBodyScrollLock(open)
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(
    url,
  )}`

  return (
    <OverlayShell
      open={open}
      onClose={onClose}
      variant="modal"
      zIndex={200}
      panelClassName="w-full max-w-xs rounded-3xl bg-white dark:bg-slate-900 shadow-premium overflow-hidden"
    >
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <h3 className="text-sm font-black tracking-tight flex items-center gap-1.5">
          <QrCode size={14} className="text-primary" /> Tu ticket en QR
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-5 pb-5 flex flex-col items-center gap-3">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
          <img
            src={qrSrc}
            alt="QR del ticket"
            width={240}
            height={240}
            className="w-60 h-60 object-contain"
            loading="lazy"
          />
        </div>
        <p className="text-[11px] font-bold text-slate-500 text-center leading-snug">
          Escanea o comparte el link para que alguien más vea este ticket.
        </p>
        <button
          type="button"
          onClick={() => copyToClipboard(url, "Link copiado")}
          className="w-full h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 press"
        >
          <Copy size={11} /> Copiar link
        </button>
      </div>
    </OverlayShell>
  )
}

/* ─────────────────────────────────────────────────────
 * Progreso animado del apartado
 * ─ Barra: ease-out de 0 → pct al montar
 * ─ Cuando pct cambia (admin valida pago), destello sutil
 * ─ Saldo + pagado con contador animado (spring)
 * ───────────────────────────────────────────────────── */
function ProgressBlock({
  pct,
  paid,
  balance,
}: {
  pct: number
  paid: number
  balance: number
}) {
  const prevPctRef = useRef(pct)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (prevPctRef.current === pct) return
    // Solo dispara destello cuando AUMENTA (cobro nuevo)
    if (pct > prevPctRef.current) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1100)
      prevPctRef.current = pct
      return () => clearTimeout(t)
    }
    prevPctRef.current = pct
  }, [pct])

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
          Progreso de apartado
        </span>
        <motion.span
          animate={{
            scale: flash ? [1, 1.18, 1] : 1,
            color: flash ? "#10b981" : "#e6007e",
          }}
          transition={{ duration: 0.55 }}
          className="text-xs font-black"
        >
          {pct.toFixed(0)}%
        </motion.span>
      </div>
      <div className="relative h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: "linear-gradient(90deg, var(--brand-from), var(--brand-to))",
          }}
        />
        {flash && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "120%" }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="absolute inset-y-0 w-1/2 pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.65) 50%, transparent 100%)",
            }}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-slate-500 font-bold">
          Pagado:{" "}
          <AnimatedMoney value={paid} className="text-emerald-600 font-black" />
        </span>
        <span className="text-slate-500 font-bold">
          Saldo:{" "}
          <AnimatedMoney value={balance} className="text-rose-600 font-black" />
        </span>
      </div>
    </div>
  )
}

/**
 * Cuenta numérica animada con requestAnimationFrame manual (sin framer
 * motionValue). Es estable y no causa bucles de renderizado.
 */
function AnimatedMoney({
  value,
  className = "",
}: {
  value: number
  className?: string
}) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    // Si el target es igual al display actual, no anima nada
    if (value === display) {
      fromRef.current = value
      return
    }
    const from = display
    fromRef.current = from
    const duration = 700
    const startTs = performance.now()
    let rafId = 0
    let cancelled = false

    const tick = (now: number) => {
      if (cancelled) return
      const t = Math.min(1, (now - startTs) / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + (value - from) * eased
      setDisplay(current)
      if (t < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        setDisplay(value)
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
    // Sólo re-anima cuando `value` cambia (no en cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <span className={`tabular-nums ${className}`}>{formatMoney(display)}</span>
  )
}

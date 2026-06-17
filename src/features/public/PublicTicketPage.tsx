import { useEffect, useState, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Sparkles, Receipt, CheckCircle2, Clock, ArrowRight,
  CreditCard, MessageCircle, ArrowLeft, Home, LifeBuoy,
} from "lucide-react"
import { supabase } from "../../lib/supabase"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { useAuth, isStaffOrAdmin } from "../../lib/useAuth"
import ReportPaymentButton from "../../components/ui/ReportPaymentButton"
import RequestExtensionButton from "../client/RequestExtensionButton"
import SupportModal from "../support/SupportModal"
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
  const store = getStoreInfo()

  /** Vuelve a un home contextual según el usuario logueado. */
  const goHome = () => {
    if (session && isStaffOrAdmin(role)) navigate("/admin")
    else if (session) navigate("/mis-pedidos")
    else navigate("/")
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
          style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
        >
          <Home size={14} /> Ir al inicio
        </button>
      </div>
    )
  }

  const pct = ticket.total > 0 ? Math.min(100, (ticket.paid / ticket.total) * 100) : 0
  const isPaid = ticket.balance <= 0

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
            style={{ background: "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)" }}
          >
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">
              {store.name}
            </h1>
            <p className="text-[9px] uppercase tracking-widest text-slate-500">
              Ticket digital
            </p>
          </div>
        </motion.div>

        {/* Card principal */}
        <motion.div
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
                : "linear-gradient(90deg,#e6007e,#a855f7)",
            }}
          />

          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400">
                Folio
              </p>
              <p className="text-base font-black tracking-tight">
                {shortId(ticket.id)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-slate-400">
                Fecha
              </p>
              <p className="text-xs font-bold">{formatDateTime(ticket.created_at)}</p>
            </div>
          </div>

          {ticket.customer_name && (
            <div className="mb-4">
              <p className="text-[9px] uppercase tracking-widest text-slate-400">
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
                      <span className="ml-1 inline-flex px-1.5 py-0 rounded-full bg-primary/10 text-primary font-black uppercase tracking-widest text-[8px]">
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

          {/* Totales — con envío + ajuste desglosado.
              Si el admin aplicó un ajuste (admin_adjust_sale), se pinta
              SIEMPRE la fila entre Subtotal y Total con signo explícito
              y motivo (p_reason) en texto secundario debajo. */}
          {(() => {
            const subtotal = ticket.items.reduce(
              (a, it) => a + Number(it.qty) * Number(it.unit_price),
              0
            )
            const adj = Number(ticket.adjustment_amount) || 0
            const ship = Number(ticket.shipping_amount) || 0
            const isForeign = !!ticket.is_foreign_shipping
            const reason = (ticket.adjustment_reason ?? "").trim()
            return (
              <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
                <Row label="Subtotal" value={formatMoney(subtotal)} />
                {(isForeign || ship > 0) && (
                  <Row
                    label={isForeign ? "Envío foráneo" : "Envío"}
                    value={ship > 0 ? formatMoney(ship) : "¡Gratis! 🎉"}
                    success={ship === 0 && isForeign}
                  />
                )}
                {adj !== 0 && (
                  <AdjustmentRow amount={adj} reason={reason} />
                )}
                <Row label="Total" value={formatMoney(ticket.total)} bold />
                {ticket.paid > 0 && (
                  <Row label="Pagado" value={formatMoney(ticket.paid)} success />
                )}
                {ticket.balance > 0 && (
                  <Row
                    label="Pendiente"
                    value={formatMoney(ticket.balance)}
                    danger
                    bold
                  />
                )}
                {/* Badge festivo de descuento manual */}
                {adj > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.15 }}
                    className="mt-3 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700"
                  >
                    <span className="text-base" aria-hidden>🎉</span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest leading-tight">
                        ¡Se aplicó un descuento manual!
                      </p>
                      <p className="text-[10px] font-bold leading-tight opacity-80">
                        Mari te apoyó con {formatMoney(adj)} en este pedido ✨
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            )
          })()}

          {/* Progreso del apartado */}
          {ticket.is_layaway && ticket.total > 0 && (
            <ProgressBlock
              pct={pct}
              paid={Number(ticket.paid) || 0}
              balance={Number(ticket.balance) || 0}
            />
          )}

          {/* Estado */}
          <div
            className={`mt-4 flex items-center gap-2 px-4 py-3 rounded-2xl ${
              isPaid
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {isPaid ? <CheckCircle2 size={18} /> : <Clock size={18} />}
            <span className="text-sm font-black">
              {isPaid ? "Pagado completo" : "Saldo pendiente"}
            </span>
          </div>
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
            style={{ background: "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)" }}
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
              balance={Number(ticket.balance) || 0}
              customerEmail={session ? null : null}
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
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  success,
  danger,
  discount,
}: {
  label: string
  value: string
  bold?: boolean
  success?: boolean
  danger?: boolean
  discount?: boolean
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? "font-bold text-slate-700" : "text-slate-500"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          bold ? "font-black" : "font-bold"
        } ${success ? "text-emerald-600" : ""} ${danger ? "text-rose-600" : ""} ${
          discount ? "text-rose-600" : ""
        }`}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Fila de Ajuste manual entre Subtotal y Total.
 * Muestra signo explícito (- o +) y debajo, en texto secundario, el motivo
 * capturado por admin_adjust_sale (p_reason). Si no hay motivo, muestra
 * el tipo de ajuste para que el cliente entienda la operación.
 */
function AdjustmentRow({ amount, reason }: { amount: number; reason: string }) {
  const isDiscount = amount > 0
  const sign = isDiscount ? "-" : "+"
  const tone = isDiscount ? "text-rose-600" : "text-amber-700"
  const subLabel = isDiscount ? "Descuento" : "Cargo extra"
  return (
    <div className="py-0.5">
      <div className={`flex justify-between text-sm ${tone}`}>
        <span className="font-bold">Ajuste manual</span>
        <span className="tabular-nums font-black">
          {sign}{" "}
          {new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
          }).format(Math.abs(amount))}
        </span>
      </div>
      <div className="flex justify-between items-start text-[10px] text-slate-500 mt-0.5">
        <span className="uppercase tracking-wider font-bold">{subLabel}</span>
        {reason && (
          <span className="italic text-right ml-2 max-w-[65%] truncate">
            "{reason}"
          </span>
        )}
      </div>
    </div>
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
            background: "linear-gradient(90deg,#e6007e,#a855f7)",
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

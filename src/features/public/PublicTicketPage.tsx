import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Sparkles, Receipt, CheckCircle2, Clock, ArrowRight,
  CreditCard, MessageCircle, ArrowLeft, Home,
} from "lucide-react"
import { supabase } from "../../lib/supabase"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { useAuth, isStaffOrAdmin } from "../../lib/useAuth"
import ReportPaymentButton from "../../components/ui/ReportPaymentButton"

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
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  payment_url: string | null
  notes: string | null
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
        setTicket(data as PublicTicket)
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [token])

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

          {/* Totales */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
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
          </div>

          {/* Progreso del apartado */}
          {ticket.is_layaway && ticket.total > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
                  Progreso de apartado
                </span>
                <span className="text-xs font-black text-primary">
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg,#e6007e,#a855f7)",
                  }}
                />
              </div>
            </div>
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

        <p className="text-center text-[10px] uppercase tracking-widest text-slate-400 mt-8">
          {store.thanks_message}
        </p>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  success,
  danger,
}: {
  label: string
  value: string
  bold?: boolean
  success?: boolean
  danger?: boolean
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? "font-bold text-slate-700" : "text-slate-500"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          bold ? "font-black" : "font-bold"
        } ${success ? "text-emerald-600" : ""} ${danger ? "text-rose-600" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

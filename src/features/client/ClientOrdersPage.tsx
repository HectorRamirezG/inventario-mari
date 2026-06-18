import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Clock, CheckCircle2, ArrowRight, LifeBuoy, Lock, ShoppingBag, Wallet } from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDate, shortId } from "../../lib/format"
import { useAuth } from "../../lib/useAuth"
import TicketDrawer from "../../components/ui/TicketDrawer"
import PaymentCenterDrawer from "../../components/ui/PaymentCenterDrawer"
import Skeleton from "../../components/ui/Skeleton"
import SupportModal from "../support/SupportModal"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import DeliveryStatusChip from "../../components/ui/DeliveryStatusChip"
import {
  useBusinessRules,
  canClaim,
  formatRemaining,
} from "../settings/businessRulesService"

interface MyOrder {
  id: string
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  created_at: string
  public_token: string | null
  payment_url: string | null
}

export default function ClientOrdersPage() {
  const { email, fullName } = useAuth()
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [ticketToken, setTicketToken] = useState<string | null>(null)
  const [paymentOrder, setPaymentOrder] = useState<MyOrder | null>(null)
  const [openSupport, setOpenSupport] = useState(false)
  const [supportSaleId, setSupportSaleId] = useState<string | null>(null)
  /** sale_id -> status de su comanda más reciente (si existe). */
  const [deliveryBySale, setDeliveryBySale] = useState<Record<string, string>>({})
  const rules = useBusinessRules()

  useEffect(() => {
    if (!email) return
    let alive = true
    ;(async () => {
      // Una sola query: trae las ventas + sus comandas embebidas
      // (PostgREST hace el LEFT JOIN). Evita el segundo round-trip
      // que hacíamos antes para resolver el delivery status.
      const { data } = await supabase
        .from("sales")
        .select(
          "id,total,paid,balance,status,is_layaway,created_at,public_token,payment_url,delivery_notes(status,created_at)",
        )
        .eq("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(50)
      if (!alive) return
      const list = (data as any[]) ?? []
      setOrders(list as MyOrder[])
      // Indexa status de la comanda más reciente por sale_id (si existe)
      const map: Record<string, string> = {}
      for (const o of list) {
        const notes: Array<{ status: string; created_at: string }> =
          o.delivery_notes ?? []
        if (notes.length > 0) {
          // Ordena por created_at desc y toma la primera
          const sorted = [...notes].sort((a, b) =>
            b.created_at.localeCompare(a.created_at),
          )
          map[o.id] = sorted[0].status
        }
      }
      setDeliveryBySale(map)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [email])

  if (loading) {
    return (
      <div className="space-y-3 pb-24">
        <div>
          <Skeleton className="h-7 w-40 mb-2" rounded="lg" />
          <Skeleton className="h-3 w-64" rounded="full" />
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <Skeleton className="h-2 w-12" rounded="full" />
                <Skeleton className="h-4 w-20" rounded="md" />
              </div>
              <Skeleton className="h-5 w-20" rounded="full" />
            </div>
            <Skeleton className="h-3 w-32" rounded="full" />
            <div className="flex justify-between">
              <Skeleton className="h-3 w-16" rounded="full" />
              <Skeleton className="h-4 w-20" rounded="md" />
            </div>
            <Skeleton className="h-1.5 w-full" rounded="full" />
            <Skeleton className="h-9 w-full" rounded="xl" />
          </div>
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <EmptyStateIllustration
        variant="no-orders"
        title="Aún no tienes pedidos"
        subtitle="Arma tu carrito desde el catálogo y aparecerán aquí para que sigas su estado."
        cta={
          <a
            href="/"
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-bloom press-hard"
          >
            <ShoppingBag size={12} /> Ir al catálogo
          </a>
        }
      />
    )
  }

  return (
    <div className="space-y-3 pb-24">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Mis pedidos</h1>
        <p className="text-sm text-slate-500">
          Aquí ves todos tus apartados y compras.
        </p>
      </div>
      {orders.map((o) => {
        const pct = o.total > 0 ? Math.min(100, (o.paid / o.total) * 100) : 0
        const paid = o.balance <= 0
        return (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  Folio
                </p>
                <p className="text-sm font-black">{shortId(o.id)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                    paid
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {paid ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                  {paid ? "Pagado" : "Pendiente"}
                </span>
                {/* Chip de entrega — visible siempre que la venta tenga comanda */}
                <DeliveryStatusChip
                  status={deliveryBySale[o.id]}
                  size="xs"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">{formatDate(o.created_at)}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500">Total</span>
              <span className="text-base font-black">{formatMoney(o.total)}</span>
            </div>
            {!paid && (
              <>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: "linear-gradient(90deg,#e6007e,#a855f7)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px]">
                  <span className="text-slate-500">
                    Pagado {formatMoney(o.paid)}
                  </span>
                  <span className="font-black text-primary">
                    Falta {formatMoney(o.balance)}
                  </span>
                </div>
              </>
            )}
            {/* Acciones */}
            <div className="flex flex-col gap-2 mt-3">
              {/* CTA principal: Pagar (solo si hay saldo) */}
              {!paid && (
                <motion.button
                  type="button"
                  onClick={() => setPaymentOrder(o)}
                  whileTap={{ scale: 0.98 }}
                  className="relative overflow-hidden w-full h-11 rounded-xl flex items-center justify-center gap-2 text-white text-[11px] font-black uppercase tracking-widest shadow-bloom press-hard"
                  style={{
                    background:
                      "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)",
                  }}
                >
                  <Wallet size={13} />
                  Pagar saldo
                  <ArrowRight size={12} />
                </motion.button>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTicketToken(o.public_token ?? o.id)}
                  className="flex-1 flex items-center justify-center gap-1 h-9 rounded-xl bg-slate-50 dark:bg-slate-700 text-xs font-black text-slate-700 dark:text-slate-200 press"
                >
                  Ver ticket
                  <ArrowRight size={12} />
                </button>
                {(() => {
                  const claim = canClaim(rules, o as any)
                  if (!claim.allowed) {
                    return (
                      <button
                        type="button"
                        disabled
                        title={claim.reason}
                        className="h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-black flex items-center gap-1 cursor-not-allowed"
                      >
                        <Lock size={12} />
                        Cerrado
                      </button>
                    )
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setSupportSaleId(o.id)
                        setOpenSupport(true)
                      }}
                      title={
                        Number.isFinite(claim.remainingMs)
                          ? `Te quedan ${formatRemaining(claim.remainingMs)} para reportar`
                          : "Reportar problema con este pedido"
                      }
                      className="h-9 px-3 rounded-xl bg-primary/10 text-primary text-xs font-black flex items-center gap-1 press"
                    >
                      <LifeBuoy size={12} />
                      Ayuda
                    </button>
                  )
                })()}
              </div>
            </div>
          </motion.div>
        )
      })}

      {/* Ticket en cortina inferior (no rompe SPA) */}
      <TicketDrawer
        open={!!ticketToken}
        token={ticketToken}
        onClose={() => setTicketToken(null)}
      />

      {/* Centro de pago - drawer dedicado solo para pago/comprobantes */}
      <PaymentCenterDrawer
        open={!!paymentOrder}
        sale={
          paymentOrder
            ? {
                id: paymentOrder.id,
                total: paymentOrder.total,
                paid: paymentOrder.paid,
                balance: paymentOrder.balance,
                payment_url: paymentOrder.payment_url,
                payments: [],
              }
            : null
        }
        onClose={() => setPaymentOrder(null)}
      />

      {/* FAB de soporte (siempre visible, abajo a la izquierda) */}
      <motion.button
        type="button"
        onClick={() => {
          setSupportSaleId(null)
          setOpenSupport(true)
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.4 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Centro de soporte"
        title="¿Necesitas ayuda?"
        className="fixed bottom-16 left-4 z-40 w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-primary shadow-[0_10px_30px_-10px_rgba(15,23,42,0.25)] flex items-center justify-center hover:scale-105 transition-transform"
      >
        <LifeBuoy size={18} />
      </motion.button>

      <SupportModal
        open={openSupport}
        saleId={supportSaleId}
        customerName={fullName ?? email ?? null}
        onClose={() => setOpenSupport(false)}
      />
    </div>
  )
}

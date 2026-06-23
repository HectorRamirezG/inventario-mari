/**
 * MyWalletPage — "Mi Monedero" del cliente.
 *
 * Dashboard financiero personal:
 *   - HERO con saldo pendiente total (+ pedidos vencidos en rojo)
 *   - Card de loyalty (si rule activa) — puntos + valor en pesos
 *   - Sección "Por pagar" — lista de pedidos con saldo, vencimiento
 *   - Sección "Historial de pagos" — últimos 15 movimientos
 *   - Sección "Logros" — niveles VIP, milestones (opcional, futura)
 *
 * Diferencia con Mis Pedidos:
 *   - Mis Pedidos = lista cronológica de TODOS los pedidos
 *   - Mi Monedero = vista FINANCIERA enfocada en cuánto debes/tienes
 *
 * Realtime: refresca cuando llega un pago o cambio de venta.
 */
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Wallet,
  AlertCircle,
  CheckCircle2,
  Trophy,
  Clock,
  TrendingUp,
  ChevronRight,
  ReceiptText,
  CreditCard,
} from "lucide-react"

import { useAuth } from "../../lib/useAuth"
import { useBusinessRules } from "../settings/businessRulesService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import { formatMoney, shortId, formatRelative } from "../../lib/format"
import PageHeader from "../../components/ui/PageHeader"
import Skeleton from "../../components/ui/Skeleton"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import LoyaltyDrawer from "../loyalty/LoyaltyDrawer"
import { useMyLoyaltyBalance } from "../loyalty/loyaltyService"
import {
  listOutstandingOrders,
  listRecentPayments,
  getWalletSummary,
  type WalletOutstandingOrder,
  type WalletPayment,
  type WalletSummary,
} from "./walletService"

export default function MyWalletPage() {
  const { email } = useAuth()
  const navigate = useNavigate()
  const bRules = useBusinessRules()
  const { balance: loyalty } = useMyLoyaltyBalance()

  const [summary, setSummary] = useState<WalletSummary | null>(null)
  const [outstanding, setOutstanding] = useState<WalletOutstandingOrder[]>([])
  const [payments, setPayments] = useState<WalletPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [loyaltyOpen, setLoyaltyOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!email) {
      setSummary(null)
      setOutstanding([])
      setPayments([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [s, o, p] = await Promise.all([
        getWalletSummary(email),
        listOutstandingOrders(email),
        listRecentPayments(email, 15),
      ])
      setSummary(s)
      setOutstanding(o)
      setPayments(p)
    } finally {
      setLoading(false)
    }
  }, [email])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime: refresca cuando llega un pago o cambio en sus ventas.
  const debounced = useDebouncedCallback(refresh, 600)
  useRealtimeSubscription("payments", debounced, {
    enabled: !!email,
  })
  useRealtimeSubscription("sales", debounced, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pb-32 px-1 pt-1 space-y-4">
        <Skeleton className="h-12 w-48" rounded="md" />
        <Skeleton className="h-40 w-full" rounded="xl" />
        <Skeleton className="h-24 w-full" rounded="xl" />
        <Skeleton className="h-24 w-full" rounded="xl" />
      </div>
    )
  }

  const pendingMoney = summary?.totalPending ?? 0
  const hasOverdue = (summary?.overdueCount ?? 0) > 0
  const hasUpcoming = (summary?.upcomingDueSoon ?? 0) > 0
  const loyaltyPts = loyalty?.points ?? 0
  const loyaltyValue = loyaltyPts * (bRules.loyalty_peso_por_punto || 1)

  return (
    <div className="max-w-2xl mx-auto pb-32 px-1 pt-1 space-y-4">
      <PageHeader
        icon={Wallet}
        iconTone="primary"
        title="Mi monedero"
        subtitle={
          pendingMoney > 0
            ? `${formatMoney(pendingMoney)} por liquidar`
            : "Estás al corriente"
        }
      />

      {/* HERO — saldo pendiente o estado "al día" */}
      <WalletHero
        pendingMoney={pendingMoney}
        totalPaid={summary?.totalPaidLifetime ?? 0}
        overdueCount={summary?.overdueCount ?? 0}
        upcomingCount={summary?.upcomingDueSoon ?? 0}
      />

      {/* CARD DE PREMIOS (si regla activa) */}
      {bRules.loyalty_enabled && (
        <button
          type="button"
          onClick={() => setLoyaltyOpen(true)}
          className="w-full press relative overflow-hidden rounded-3xl p-4 text-left bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-200/60 dark:border-amber-500/30"
          aria-label="Ver mis premios"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Trophy size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700/80 dark:text-amber-300/80">
                Mis premios
              </p>
              <p className="text-2xl font-black tabular-nums leading-tight text-slate-900 dark:text-slate-100">
                {loyaltyPts} <span className="text-sm opacity-80">pts</span>
              </p>
              <p className="text-[10px] font-bold opacity-80 text-slate-600 dark:text-slate-300">
                {loyaltyPts > 0
                  ? `≈ ${formatMoney(loyaltyValue)} para tu próxima compra`
                  : "Paga tu próximo apartado y empieza a sumar"}
              </p>
            </div>
            <ChevronRight
              size={16}
              className="text-amber-700/60 dark:text-amber-300/60 shrink-0"
            />
          </div>
        </button>
      )}

      {/* SECCIÓN: POR PAGAR */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CreditCard size={11} />
            Por pagar
          </h2>
          {outstanding.length > 0 && (
            <span className="text-[9px] font-bold text-slate-400">
              {outstanding.length} pedido{outstanding.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {outstanding.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200/50 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/5 p-5 text-center">
            <CheckCircle2
              size={28}
              className="mx-auto text-emerald-500 mb-2"
            />
            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">
              ¡Todo al corriente!
            </p>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 leading-snug mt-0.5">
              No tienes saldos pendientes. Sigue así 💖
            </p>
          </div>
        ) : (
          outstanding.map((o, i) => (
            <OutstandingRow
              key={o.sale_id}
              order={o}
              index={i}
              onClick={() =>
                navigate(
                  o.public_token ? `/ticket/${o.public_token}` : "/mis-pedidos",
                )
              }
            />
          ))
        )}

        {hasOverdue && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 p-3 flex items-start gap-2 mt-2">
            <AlertCircle
              size={12}
              className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
            />
            <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300 leading-snug">
              Tienes {summary?.overdueCount} pedido
              {summary && summary.overdueCount > 1 ? "s" : ""} vencido. Liquida
              pronto para evitar que se cancele automáticamente.
            </p>
          </div>
        )}

        {!hasOverdue && hasUpcoming && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-3 flex items-start gap-2 mt-2">
            <Clock
              size={12}
              className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
            />
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 leading-snug">
              {summary?.upcomingDueSoon === 1
                ? "Tienes 1 pedido que vence pronto."
                : `Tienes ${summary?.upcomingDueSoon} pedidos que vencen pronto.`}
            </p>
          </div>
        )}
      </section>

      {/* SECCIÓN: HISTORIAL DE PAGOS */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ReceiptText size={11} />
            Historial de pagos
          </h2>
          {payments.length > 0 && (
            <span className="text-[9px] font-bold text-slate-400">
              últimos {payments.length}
            </span>
          )}
        </div>

        {payments.length === 0 ? (
          <EmptyStateIllustration
            variant="no-orders"
            title="Sin pagos todavía"
            subtitle="Cuando hagas tu primer abono aparecerá aquí."
          />
        ) : (
          <ul className="space-y-1.5">
            {payments.map((p, i) => (
              <PaymentRow key={p.id} payment={p} index={i} />
            ))}
          </ul>
        )}
      </section>

      <LoyaltyDrawer
        open={loyaltyOpen}
        onClose={() => setLoyaltyOpen(false)}
      />
    </div>
  )
}

/* ============================================================== */
/* Sub-componentes                                                  */
/* ============================================================== */

function WalletHero({
  pendingMoney,
  totalPaid,
  overdueCount,
  upcomingCount,
}: {
  pendingMoney: number
  totalPaid: number
  overdueCount: number
  upcomingCount: number
}) {
  const isClear = pendingMoney <= 0
  const tone = isClear
    ? "from-emerald-500/15 to-emerald-500/5 border-emerald-300/40"
    : overdueCount > 0
    ? "from-rose-500/15 to-rose-500/5 border-rose-300/40"
    : "from-primary/15 to-primary/5 border-primary/30"

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br ${tone} p-5`}
    >
      {/* Orbe decorativo sutil */}
      <span
        aria-hidden
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/30 dark:bg-white/5 blur-2xl pointer-events-none"
      />
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
        {isClear ? "Estás al corriente" : "Por liquidar"}
      </p>
      <p
        className={`text-4xl font-black tabular-nums tracking-tight mt-1 leading-none ${
          isClear
            ? "text-emerald-700 dark:text-emerald-300"
            : overdueCount > 0
            ? "text-rose-600 dark:text-rose-400"
            : "text-primary"
        }`}
      >
        {formatMoney(pendingMoney)}
      </p>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest">
            <AlertCircle size={9} /> {overdueCount} vencido
            {overdueCount === 1 ? "" : "s"}
          </span>
        )}
        {upcomingCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 text-[9px] font-black uppercase tracking-widest">
            <Clock size={9} /> {upcomingCount} vence pronto
          </span>
        )}
        {totalPaid > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest">
            <TrendingUp size={9} /> {formatMoney(totalPaid)} pagado
          </span>
        )}
      </div>
    </motion.div>
  )
}

function OutstandingRow({
  order,
  index,
  onClick,
}: {
  order: WalletOutstandingOrder
  index: number
  onClick: () => void
}) {
  const isOverdue = order.daysUntilDue < 0
  const isDueSoon = order.daysUntilDue >= 0 && order.daysUntilDue <= 3
  const dueLabel = isOverdue
    ? `Vencido hace ${Math.abs(order.daysUntilDue)} d`
    : order.daysUntilDue === 0
    ? "Vence hoy"
    : `Vence en ${order.daysUntilDue} d`

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.2) }}
      className={`w-full rounded-2xl border bg-white dark:bg-slate-900 p-3 flex items-center gap-3 text-left press transition-colors ${
        isOverdue
          ? "border-rose-200 dark:border-rose-500/40"
          : isDueSoon
          ? "border-amber-200 dark:border-amber-500/30"
          : "border-slate-200/70 dark:border-slate-800"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black tracking-tight text-slate-900 dark:text-slate-100">
          Pedido #{shortId(order.sale_id)}
          {order.is_layaway && (
            <span className="ml-1.5 text-[8px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 rounded-full">
              Apart.
            </span>
          )}
        </p>
        <p
          className={`text-[10px] font-bold mt-0.5 ${
            isOverdue
              ? "text-rose-600 dark:text-rose-400"
              : isDueSoon
              ? "text-amber-600 dark:text-amber-400"
              : "text-slate-400 dark:text-slate-500"
          }`}
        >
          {dueLabel}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[13px] font-black tabular-nums text-slate-900 dark:text-slate-100">
          {formatMoney(order.balance)}
        </p>
        <p className="text-[9px] font-bold text-slate-400 tabular-nums">
          de {formatMoney(order.total)}
        </p>
      </div>
      <ChevronRight size={14} className="text-slate-300 shrink-0" />
    </motion.button>
  )
}

function PaymentRow({
  payment,
  index,
}: {
  payment: WalletPayment
  index: number
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.15) }}
      className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 flex items-center gap-3"
    >
      <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
        <CheckCircle2 size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black text-slate-900 dark:text-slate-100">
          {payment.method ?? "Pago"} · #{shortId(payment.sale_id)}
        </p>
        <p className="text-[9px] font-bold text-slate-400">
          {formatRelative(payment.created_at)}
        </p>
      </div>
      <p className="text-[12px] font-black tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
        +{formatMoney(Number(payment.amount) || 0)}
      </p>
    </motion.li>
  )
}

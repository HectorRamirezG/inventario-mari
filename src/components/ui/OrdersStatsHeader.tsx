import { motion } from "framer-motion"
import { Receipt, Clock, Wallet, Heart } from "lucide-react"
import { useMemo } from "react"

import { formatMoney } from "../../lib/format"

/**
 * Header personalizado para `/mis-pedidos`: saludo + 3 KPI mini con
 * stats personales del cliente.
 *
 * Stats que muestra:
 *  - Activos: cuántos pedidos con balance > 0 o entrega pendiente
 *  - Invertido: suma del total pagado en todos sus pedidos
 *  - Próximo pago: monto del balance pendiente más urgente (si hay)
 */

export interface MiniOrder {
  id: string
  total: number
  paid: number
  balance: number
  status: string
  created_at: string
}

interface Props {
  customerFirstName?: string | null
  orders: MiniOrder[]
}

export default function OrdersStatsHeader({ customerFirstName, orders }: Props) {
  const stats = useMemo(() => {
    let activeCount = 0
    let totalInvested = 0
    let nextDueBalance = 0
    for (const o of orders) {
      if (o.status === "cancelled") continue
      const paid = Number(o.paid) || 0
      const balance = Math.max(0, (Number(o.total) || 0) - paid)
      totalInvested += paid
      if (balance > 0) {
        activeCount++
        if (nextDueBalance === 0 || balance < nextDueBalance) {
          nextDueBalance = balance
        }
      }
    }
    return { activeCount, totalInvested, nextDueBalance }
  }, [orders])

  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight truncate">
            {customerFirstName ? `Hola, ${customerFirstName}` : "Mis pedidos"}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tu historial · apartados activos · entregas
          </p>
        </div>
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-bloom shrink-0"
          style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
        >
          <Heart size={18} className="text-white" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatPill
          icon={<Clock size={11} />}
          label="Activos"
          value={String(stats.activeCount)}
          tone="amber"
          highlight={stats.activeCount > 0}
        />
        <StatPill
          icon={<Receipt size={11} />}
          label="Invertido"
          value={formatMoney(stats.totalInvested)}
          tone="emerald"
        />
        <StatPill
          icon={<Wallet size={11} />}
          label={stats.nextDueBalance > 0 ? "Próximo pago" : "Sin pendientes"}
          value={
            stats.nextDueBalance > 0 ? formatMoney(stats.nextDueBalance) : "—"
          }
          tone={stats.nextDueBalance > 0 ? "rose" : "slate"}
          highlight={stats.nextDueBalance > 0}
        />
      </div>
    </div>
  )
}

function StatPill({
  icon,
  label,
  value,
  tone,
  highlight = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: "amber" | "emerald" | "rose" | "slate"
  highlight?: boolean
}) {
  const TONE_BG: Record<typeof tone, string> = {
    amber: "bg-amber-50 dark:bg-amber-500/10",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10",
    rose: "bg-rose-50 dark:bg-rose-500/10",
    slate: "bg-slate-50 dark:bg-slate-800/60",
  }
  const TONE_TEXT: Record<typeof tone, string> = {
    amber: "text-amber-700 dark:text-amber-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
    rose: "text-rose-700 dark:text-rose-300",
    slate: "text-slate-600 dark:text-slate-300",
  }
  const TONE_BORDER: Record<typeof tone, string> = {
    amber: "border-amber-200/60 dark:border-amber-500/30",
    emerald: "border-emerald-200/60 dark:border-emerald-500/30",
    rose: "border-rose-200/60 dark:border-rose-500/30",
    slate: "border-slate-200/60 dark:border-slate-700",
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-2xl border ${TONE_BG[tone]} ${TONE_BORDER[tone]} p-2.5 overflow-hidden`}
    >
      {highlight && (
        <span
          className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
            tone === "amber"
              ? "bg-amber-500"
              : tone === "rose"
              ? "bg-rose-500"
              : "bg-emerald-500"
          } animate-pulse`}
        />
      )}
      <div className={`flex items-center gap-1 ${TONE_TEXT[tone]}`}>
        {icon}
        <p className="text-[8px] font-black uppercase tracking-widest leading-none">
          {label}
        </p>
      </div>
      <p className={`text-sm font-black mt-1 tabular-nums leading-tight ${TONE_TEXT[tone]}`}>
        {value}
      </p>
    </motion.div>
  )
}

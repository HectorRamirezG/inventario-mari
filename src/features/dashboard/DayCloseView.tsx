import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  Sun,
  Wallet,
  Receipt,
  TrendingUp,
  Award,
  CreditCard,
  AlertCircle,
  Printer,
  Calendar,
} from "lucide-react"
import {
  getDayCloseStats,
  type DayCloseStats,
} from "./dayCloseService"

import { formatMoney as fmtMoney } from "../../lib/format";

const money = fmtMoney

const dateLong = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso + "T12:00:00"))

export default function DayCloseView({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<DayCloseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    setLoading(true)
    getDayCloseStats(new Date(date + "T12:00:00"))
      .then(setStats)
      .finally(() => setLoading(false))
  }, [date])

  const handlePrint = () => window.print()

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 print:p-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button
          onClick={onClose}
          className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900"
        >
          ← Dashboard
        </button>
        <button
          onClick={handlePrint}
          className="h-10 px-4 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-transform"
        >
          <Printer size={12} /> Imprimir / PDF
        </button>
      </div>

      {/* Encabezado del reporte */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-100 p-6 mb-4 print:shadow-none"
      >
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">
              Cierre del día
            </p>
            <h2 className="text-xl font-black mt-1 capitalize">
              {dateLong(date)}
            </h2>
          </div>
          <div className="relative print:hidden">
            <Calendar
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi
              icon={<Receipt size={14} />}
              label="Ventas"
              value={String(stats.sales_count)}
              hint={`${stats.layaway_count} apartados`}
            />
            <Kpi
              icon={<Wallet size={14} />}
              label="Ingresos"
              value={money(stats.revenue)}
              tone="primary"
            />
            <Kpi
              icon={<CreditCard size={14} />}
              label="Cobrado"
              value={money(stats.paid_today)}
              tone="ok"
            />
            <Kpi
              icon={<TrendingUp size={14} />}
              label="Utilidad"
              value={money(stats.profit)}
              tone="ok"
            />
          </div>

          {/* Pendiente + Ticket */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Kpi
              icon={<AlertCircle size={14} />}
              label="Por cobrar (del día)"
              value={money(stats.pending_today)}
              tone={stats.pending_today > 0 ? "warn" : "neutral"}
            />
            <Kpi
              icon={<Sun size={14} />}
              label="Ticket promedio"
              value={money(stats.ticket_avg)}
            />
          </div>

          {/* Métodos de pago */}
          {Object.keys(stats.payment_methods).length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                Pagos por método
              </h3>
              <div className="space-y-2">
                {Object.entries(stats.payment_methods).map(([m, amt]) => {
                  const pct = (amt / stats.paid_today) * 100
                  return (
                    <div key={m}>
                      <div className="flex items-center justify-between mb-1 text-[10px] font-black uppercase">
                        <span className="text-slate-700">{m}</span>
                        <span className="tabular-nums">{money(amt)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          className="h-full bg-primary"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Top productos */}
          {stats.top_products.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1">
                <Award size={12} /> Más vendidos
              </h3>
              <div className="space-y-2">
                {stats.top_products.map((p, i) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="font-bold truncate">
                      <span className="text-primary font-black mr-1">{i + 1}.</span>
                      {p.name}
                    </span>
                    <div className="text-right shrink-0 ml-2">
                      <span className="font-black">{p.qty}pz</span>
                      <span className="text-slate-400 ml-2 tabular-nums">
                        {money(p.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top clientes */}
          {stats.top_customers.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-100 p-4 mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                Mejores clientes del día
              </h3>
              <div className="space-y-2">
                {stats.top_customers.map((c, i) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="font-bold truncate">
                      <span className="text-primary font-black mr-1">
                        {i + 1}.
                      </span>
                      {c.name}
                    </span>
                    <span className="font-black tabular-nums shrink-0 ml-2">
                      {money(c.total)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.cancelled_count > 0 && (
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 text-center mt-4">
              ⚠ {stats.cancelled_count} venta(s) cancelada(s)
            </p>
          )}

          {stats.sales_count === 0 && (
            <div className="py-12 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                Sin ventas este día
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "neutral" | "primary" | "ok" | "warn"
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-white border-slate-100 text-slate-900",
    primary: "bg-primary text-white border-primary",
    ok: "bg-emerald-50 border-emerald-100 text-emerald-700",
    warn: "bg-amber-50 border-amber-100 text-amber-700",
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-3 border ${toneClasses[tone]}`}
    >
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}
        <span className="text-[8px] font-black uppercase tracking-widest">
          {label}
        </span>
      </div>
      <p className="text-base font-black tabular-nums leading-tight">{value}</p>
      {hint && (
        <p className="text-[8px] font-bold mt-0.5 opacity-70">{hint}</p>
      )}
    </motion.div>
  )
}

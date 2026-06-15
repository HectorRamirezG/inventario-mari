import { useMemo, useState } from "react"
import { 
  RefreshCw, Trophy, AlertTriangle, ArrowUpRight, Target, Zap, 
  ShoppingCart, Star, Wallet, Sun 
} from "lucide-react"
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, 
  YAxis, Tooltip as RechartsTooltip, CartesianGrid 
} from "recharts"
import { motion } from "framer-motion"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/Tabs"
import Skeleton from "../../components/ui/Skeleton"
import Card from "../../components/ui/Card"

import { useDashboard } from "./useDashboard"
import DayCloseView from "./DayCloseView"
import CycleBanner from "../cycles/CycleBanner"

const formatCurrency = (v: number) => 
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v)

export default function DashboardPage() {
  const { stats, loading, refresh } = useDashboard()
  const [dayCloseOpen, setDayCloseOpen] = useState(false)

  const chartData = useMemo(() => {
    if (!stats?.top) return []
    return stats.top.map(p => ({
      name: (p.name || "S/N").slice(0, 8),
      ventas: p.qty || 0,
      fullName: p.name || "S/N"
    }))
  }, [stats])

  const ticketPromedio = stats ? (stats.revenue / (stats.operations || 1)) : 0
  const cobroEficiencia = stats ? (100 - (stats.pending / (stats.revenue || 1) * 100)) : 0

  if (dayCloseOpen) {
    return <DayCloseView onClose={() => setDayCloseOpen(false)} />
  }

  if (loading) return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-40 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    </div>
  )

  return (
    <div className="max-w-[900px] mx-auto space-y-6 pb-28 px-2">

      {/* HEADER */}
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-2xl font-black tracking-tight">
            Resumen <span className="text-primary">Financiero</span>
          </h2>
          <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-1">
            Estado actual
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDayCloseOpen(true)}
            className="h-10 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom active:scale-95 transition-transform"
            title="Cierre del día"
          >
            <Sun size={12} /> Cierre
          </button>
          <button
            onClick={refresh}
            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary active:scale-90"
            aria-label="Refrescar"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <Tabs defaultValue="resumen" className="space-y-6">

        <TabsList className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl text-[10px] font-black uppercase">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="analisis">Análisis</TabsTrigger>
        </TabsList>

        {/* BANNER DE CICLO ACTIVO */}
        <CycleBanner />

        {/* RESUMEN */}
        <TabsContent value="resumen" className="space-y-6">

          {/* CAPITAL */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">

            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase text-primary/60 flex items-center gap-1">
                <Star size={10} /> Capital
              </span>
              <Wallet size={18} className="text-primary/30" />
            </div>

            <h3 className="text-3xl font-black tracking-tight tabular-nums">
              {formatCurrency(stats?.profit || 0)}
            </h3>

            <div className="grid grid-cols-2 gap-2 mt-4 text-center">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[9px] uppercase text-slate-400">Ingresos</p>
                <p className="font-black text-sm">{formatCurrency(stats?.revenue || 0)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[9px] uppercase text-slate-400">Pendiente</p>
                <p className="font-black text-sm text-rose-500">{formatCurrency(stats?.pending || 0)}</p>
              </div>
            </div>

          </section>

          {/* MÉTRICAS */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<Zap size={16} />} value={stats?.operations || 0} label="Ventas" />
            <StatCard icon={<Target size={16} />} value={formatCurrency(ticketPromedio)} label="Ticket" />
            <StatCard icon={<Trophy size={16} />} value={`${cobroEficiencia.toFixed(0)}%`} label="Cobro" />
            <StatCard icon={<AlertTriangle size={16} />} value={stats?.lowStock || 0} label="Stock" alert={stats?.lowStock} />
          </div>

        </TabsContent>

        {/* ANALISIS */}
        <TabsContent value="analisis" className="space-y-6">

          {/* CHART */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">

            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-black">
                Rotación
              </h4>
              <ShoppingCart size={16} className="text-primary/40" />
            </div>

            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e6007e" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#e6007e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#fce7f3" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} />
                  <YAxis hide />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="ventas" stroke="#e6007e" fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RANKING */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">

            <h4 className="text-sm font-black">Top productos</h4>

            {stats?.top?.slice(0,5).map((p, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span className="font-semibold truncate max-w-[60%]">
                  {p.name}
                </span>
                <span className="text-primary font-black">
                  {p.qty}
                </span>
              </div>
            ))}

          </div>

        </TabsContent>

      </Tabs>
    </div>
  )
}

/* STAT CARD */
function StatCard({ icon, value, label, alert }: any) {
  return (
    <Card className={`p-4 rounded-2xl text-center border ${
      alert ? "border-rose-200 bg-rose-50" : "border-slate-100 bg-white"
    }`}>
      <div className="flex justify-center mb-2 text-primary">
        {icon}
      </div>
      <p className="text-lg font-black">{value}</p>
      <p className="text-[9px] uppercase text-slate-400">{label}</p>
    </Card>
  )
}
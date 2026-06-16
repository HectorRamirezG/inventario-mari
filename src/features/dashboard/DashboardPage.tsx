import { useMemo, useState } from "react"
import {
  RefreshCw, Trophy, AlertTriangle, ArrowUpRight, Target, Zap,
  ShoppingCart, Star, Wallet, Sun, Package, Bell, FileCheck2
} from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis,
  YAxis, Tooltip as RechartsTooltip, CartesianGrid
} from "recharts"
import { motion, AnimatePresence } from "framer-motion"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/Tabs"
import Skeleton from "../../components/ui/Skeleton"
import Card from "../../components/ui/Card"

import { useDashboard } from "./useDashboard"
import DayCloseView from "./DayCloseView"
import CycleBanner from "../cycles/CycleBanner"
import LowStockView from "../inventory/LowStockView"
import { formatMoney as formatCurrency } from "../../lib/format"

export default function DashboardPage() {
  const { stats, loading, refresh } = useDashboard()
  const [dayCloseOpen, setDayCloseOpen] = useState(false)
  const [showLowStock, setShowLowStock] = useState(false)

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

        {/* 3 CARDS DE ACCESO RÁPIDO (operaciones del día) */}
        <DailyOpsCards
          shipments={stats?.pendingShipments ?? 0}
          dueLayaways={stats?.dueLayaways ?? 0}
          proofs={stats?.pendingProofs ?? 0}
        />

        {/* RESUMEN */}
        <TabsContent value="resumen" className="space-y-6">

          {/* CAPITAL */}
          <section className="surface-card p-6">

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
            <button
              type="button"
              onClick={() => setShowLowStock((v) => !v)}
              className={`text-left p-4 rounded-2xl border transition-all active:scale-[0.98] ${
                (stats?.lowStock ?? 0) > 0
                  ? "border-rose-200 bg-rose-50 hover:bg-rose-100"
                  : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <AlertTriangle
                  size={16}
                  className={(stats?.lowStock ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}
                />
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                  {showLowStock ? "Ocultar" : "Ver"}
                </span>
              </div>
              <p className="text-lg font-black text-center">{stats?.lowStock || 0}</p>
              <p className="text-[9px] uppercase text-slate-400 text-center">Stock bajo</p>
            </button>
          </div>

          {/* Panel expandible de stock crítico */}
          <AnimatePresence>
            {showLowStock && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="surface-card p-1 mt-1">
                  <LowStockView />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </TabsContent>

        {/* ANALISIS */}
        <TabsContent value="analisis" className="space-y-6">

          {/* CHART */}
          <div className="surface-card p-5">

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
          <div className="surface-card p-5 space-y-3">

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
      alert ? "border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/40" : "surface-card"
    }`}>
      <div className="flex justify-center mb-2 text-primary">
        {icon}
      </div>
      <p className="text-lg font-black">{value}</p>
      <p className="text-[9px] uppercase text-slate-400">{label}</p>
    </Card>
  )
}

/* DAILY OPS — 3 cards de acceso rápido a los pendientes operativos */
function DailyOpsCards({
  shipments,
  dueLayaways,
  proofs,
}: {
  shipments: number
  dueLayaways: number
  proofs: number
}) {
  const dispatch = (tab: string) =>
    window.dispatchEvent(new CustomEvent("app:navigate", { detail: { tab } }))

  const items = [
    {
      key: "shipments",
      label: "Pedidos por enviar",
      hint: "Pagados foráneos listos",
      icon: Package,
      count: shipments,
      tone:
        shipments > 0
          ? "from-sky-500 to-cyan-400 text-white"
          : "from-slate-100 to-slate-50 text-slate-400",
      onClick: () => dispatch("pendientes"),
    },
    {
      key: "due",
      label: "Recordatorios cobro",
      hint: "Vencen en ≤ 5 días",
      icon: Bell,
      count: dueLayaways,
      tone:
        dueLayaways > 0
          ? "from-amber-500 to-orange-400 text-white"
          : "from-slate-100 to-slate-50 text-slate-400",
      onClick: () => dispatch("pendientes"),
    },
    {
      key: "proofs",
      label: "Comprobantes",
      hint: "Por verificar",
      icon: FileCheck2,
      count: proofs,
      tone:
        proofs > 0
          ? "from-fuchsia-500 to-pink-500 text-white"
          : "from-slate-100 to-slate-50 text-slate-400",
      onClick: () => dispatch("pendientes"),
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map(({ key, label, hint, icon: Icon, count, tone, onClick }) => {
        const has = count > 0
        return (
          <motion.button
            key={key}
            type="button"
            onClick={onClick}
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className={`relative rounded-2xl p-3 sm:p-4 text-left bg-gradient-to-br ${tone} border ${
              has ? "border-white/30 shadow-bloom" : "border-slate-200/60"
            } overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-2">
              <Icon
                size={16}
                strokeWidth={2.5}
                className={has ? "opacity-95" : ""}
              />
              {has && (
                <motion.span
                  key={count}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18 }}
                  className="text-[9px] font-black uppercase tracking-widest bg-white/25 backdrop-blur px-1.5 py-0.5 rounded-full"
                >
                  ¡Ahora!
                </motion.span>
              )}
            </div>
            <p className="text-2xl sm:text-3xl font-black tabular-nums leading-none">
              {count}
            </p>
            <p
              className={`text-[10px] font-black uppercase tracking-widest mt-1 ${
                has ? "opacity-90" : "opacity-70"
              }`}
            >
              {label}
            </p>
            <p
              className={`text-[8px] font-bold mt-0.5 ${
                has ? "opacity-80" : "opacity-60"
              }`}
            >
              {hint}
            </p>
            {has && (
              <motion.span
                aria-hidden
                animate={{ scale: [1, 1.4, 1], opacity: [0.25, 0, 0.25] }}
                transition={{ duration: 2.8, repeat: Infinity }}
                className="absolute -top-2 -right-2 w-12 h-12 rounded-full bg-white/30"
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
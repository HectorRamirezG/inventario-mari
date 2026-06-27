import { useEffect, useMemo, useState, lazy, Suspense } from "react"
import {
  RefreshCw,
  Trophy,
  AlertTriangle,
  Target,
  Zap,
  ShoppingCart,
  Wallet,
  Sun,
  Package,
  Bell,
  FileCheck2,
  TrendingUp,
  TrendingDown,
  Users,
  Tag,
  CreditCard,
  Banknote,
  Smartphone,
  Building2,
  HelpCircle,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
  PiggyBank,
  FileDown,
  Activity,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import TabBar from "../../components/ui/TabBar"
import Skeleton from "../../components/ui/Skeleton"
import SafeSection from "../../components/ui/SafeSection"

import { useDashboard } from "./useDashboard"
import DayCloseView from "./DayCloseView"
import CycleBanner from "../cycles/CycleBanner"
import LowStockView from "../inventory/LowStockView"
import { formatMoney as formatCurrency } from "../../lib/format"
import { useCountUp } from "../../lib/useCountUp"
import Sparkline from "../../components/ui/Sparkline"
import { shareTicketPdf } from "../../lib/shareImage"
import { useBusinessRules } from "../settings/businessRulesService"
import DailyReportShareButton from "./DailyReportShareButton"
import HotProductsCard from "./HotProductsCard"
import DueRemindersCard from "./DueRemindersCard"
import TodayDeliveriesCard from "./TodayDeliveriesCard"
import TodayGlanceCard from "./TodayGlanceCard"
import PeakHoursCard from "./PeakHoursCard"
import ProductFunnelCard from "./ProductFunnelCard"
import ProductOfMonthCard from "./ProductOfMonthCard"
import MarginByCategoryCard from "./MarginByCategoryCard"

/**
 * TrendChart vive en archivo separado e importa `recharts` (~250kb gz).
 * Cargado con `lazy` se mueve a su propio chunk y NO bloquea el render
 * inicial del Dashboard. Mientras carga se muestra un skeleton del mismo
 * alto para evitar layout shift.
 */
const TrendChart = lazy(() => import("./TrendChart"))
const InsightsPanel = lazy(() => import("./InsightsPanel"))

function ChartSkeleton() {
  return (
    <section className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-28" rounded="full" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-14" rounded="full" />
          <Skeleton className="h-3 w-14" rounded="full" />
        </div>
      </div>
      <Skeleton className="h-[240px] w-full" rounded="2xl" />
    </section>
  )
}

type PeriodDays = 7 | 30 | 90

type DashTab = "resumen" | "analisis"

const DASHBOARD_TABS: { id: DashTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "analisis", label: "Análisis" },
]

export default function DashboardPage() {
  const [period, setPeriod] = useState<PeriodDays>(30)
  const { stats, loading, refresh } = useDashboard(period)
  const [dayCloseOpen, setDayCloseOpen] = useState(false)
  const [showLowStock, setShowLowStock] = useState(false)
  const [dashTab, setDashTab] = useState<DashTab>("resumen")

  // Atajo desde la paleta de comandos
  useEffect(() => {
    const handler = () => setDayCloseOpen(true)
    window.addEventListener("dashboard:open-day-close", handler)
    return () => window.removeEventListener("dashboard:open-day-close", handler)
  }, [])

  // ── Derivados financieros claros ────────────────────────────────
  const revenue = stats?.revenue ?? 0
  const collected = stats?.collected ?? 0
  const profit = stats?.profit ?? 0
  const pending = stats?.pending ?? 0
  const operations = stats?.operations ?? 0
  const cogs = Math.max(0, revenue - profit) // costo aproximado de mercancía vendida
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0
  const ticket = operations > 0 ? revenue / operations : 0
  const cobroEficiencia = revenue > 0 ? ((revenue - pending) / revenue) * 100 : 100

  // Variación vs período anterior
  const revGrowth = pctChange(revenue, stats?.prevRevenue ?? 0)
  const profitGrowth = pctChange(profit, stats?.prevProfit ?? 0)
  const opsGrowth = pctChange(operations, stats?.prevOperations ?? 0)

  if (dayCloseOpen) {
    return <DayCloseView onClose={() => setDayCloseOpen(false)} />
  }

  if (loading && !stats) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-40 w-full" rounded="lg" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" rounded="lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative max-w-[960px] mx-auto space-y-6 pb-28 px-2">
      {/* Orbs decorativos detrás del contenido */}
      <span className="deco-orb deco-orb-pink top-0 -left-20 w-72 h-72" />
      <span className="deco-orb deco-orb-violet top-40 -right-24 w-80 h-80" />

      {/* HEADER — responsive: en mobile, título arriba y acciones
          en barra inferior compacta. En desktop sigue side-by-side. */}
      <div className="flex flex-col gap-3 px-2 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-black leading-none mb-1">
              Centro financiero
            </p>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 truncate">
              Resumen <span className="text-gradient-brand">Pro</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Tus números reales — ingresos, costo, ganancia y por cobrar.
            </p>
          </div>
          {/* Refresh siempre visible (es la acción más usada) */}
          <button
            onClick={refresh}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-primary active:scale-90 shrink-0"
            aria-label="Refrescar"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Barra de acciones: en mobile se hace scroll horizontal; en
            desktop queda alineada inline. Evita el overflow off-screen
            que reportaba Mari en celular. */}
        <div className="flex items-center gap-2 -mx-2 px-2 overflow-x-auto scroll-container-ios sm:overflow-visible">
          <PeriodSwitcher value={period} onChange={setPeriod} />
          <div className="flex items-center gap-2 shrink-0">
            <GenerateReportButton
              targetId="dashboard-report-area"
              periodLabel={periodLabelFor(period)}
            />
            <DailyReportShareButton />
            <button
              onClick={() => setDayCloseOpen(true)}
              className="h-10 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom active:scale-95 transition-transform whitespace-nowrap"
              title="Reporte resumen del día (imprimible). No bloquea ventas, solo genera el corte."
            >
              <Sun size={12} /> Cierre del día
            </button>
          </div>
        </div>
      </div>

      {/* Mini-guía para que Mari (o staff nuevo) entienda de un vistazo
          qué es esta pantalla. Sigue el mismo patrón visual que el
          banner de Reglas para mantener consistencia en toda la app. */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/8 to-violet-500/8 dark:from-primary/15 dark:to-violet-500/15 border border-primary/15 dark:border-primary/25 p-3 flex items-start gap-2.5">
        <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 text-[10px] font-black">
          ?
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-tight">
            ¿Qué veo aquí?
          </p>
          <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-snug mt-0.5">
            Tus números del periodo seleccionado:{" "}
            <span className="font-black">Vendido</span> (incluye apartados sin
            liquidar),{" "}
            <span className="font-black text-emerald-700 dark:text-emerald-300">
              Cobrado
            </span>{" "}
            (dinero ya en mano),{" "}
            <span className="font-black">Ganancia</span> (lo que de verdad te
            quedó) y{" "}
            <span className="font-black text-amber-700 dark:text-amber-300">
              Por cobrar
            </span>{" "}
            (apartados pendientes). Toca{" "}
            <span className="font-black">Cierre del día</span> para generar el
            corte imprimible de hoy.
          </p>
        </div>
      </div>

      {/* BANNER DE CICLO ACTIVO */}
      <SafeSection scope="dashboard:cycle-banner">
        <CycleBanner />
      </SafeSection>

      {/* "Tu día en 1 vistazo" — bloque-hero matutino con saludo + entregas
          + comprobantes + saldos + cumpleaños. Se auto-oculta si no hay nada
          urgente (día despejado muestra una micro-card celebratoria). */}
      <SafeSection scope="dashboard:today-glance">
        <TodayGlanceCard />
      </SafeSection>

      {/* 3 CARDS DE ACCESO RÁPIDO (operaciones del día) */}
      <DailyOpsCards
        shipments={stats?.pendingShipments ?? 0}
        dueLayaways={stats?.dueLayaways ?? 0}
        proofs={stats?.pendingProofs ?? 0}
      />

      <TabBar
        tabs={DASHBOARD_TABS}
        active={dashTab}
        onChange={setDashTab}
        layoutId="dashboard-tabs"
      />

      {/* ════════════════ RESUMEN ════════════════ */}
      {dashTab === "resumen" && (
        <div id="dashboard-report-area" className="space-y-5 bg-white dark:bg-slate-950 p-1">
          <FinanceHero
            revenue={revenue}
            collected={collected}
            cogs={cogs}
            profit={profit}
            pending={pending}
            margin={margin}
            revGrowth={revGrowth}
            profitGrowth={profitGrowth}
            periodLabel={periodLabelFor(period)}
            trend={stats?.trend}
          />

          {/* KPIs operativos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Zap size={16} />}
              value={operations}
              label="Ventas"
              growth={opsGrowth}
            />
            <StatCard
              icon={<Target size={16} />}
              value={formatCurrency(ticket)}
              label="Ticket promedio"
            />
            <StatCard
              icon={<Trophy size={16} />}
              value={`${cobroEficiencia.toFixed(0)}%`}
              label="Cobrado del total"
              tone={cobroEficiencia >= 90 ? "emerald" : cobroEficiencia >= 70 ? "amber" : "rose"}
            />
            <button
              type="button"
              onClick={() => setShowLowStock((v) => !v)}
              className={`text-left p-4 rounded-2xl border transition-all active:scale-[0.98] ${
                (stats?.lowStock ?? 0) > 0
                  ? "border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/15"
                  : "border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <AlertTriangle
                  size={16}
                  className={
                    (stats?.lowStock ?? 0) > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }
                />
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                  {showLowStock ? "Ocultar" : "Ver"}
                </span>
              </div>
              <p className="text-lg font-black">{stats?.lowStock || 0}</p>
              <p className="text-[9px] uppercase text-slate-400">Stock bajo</p>
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
                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-1">
                  <LowStockView />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tendencia diaria */}
          <SafeSection scope="dashboard:trend-chart">
            <Suspense fallback={<ChartSkeleton />}>
              <TrendChart
                data={stats?.trend ?? []}
                periodLabel={periodLabelFor(period)}
              />
            </Suspense>
          </SafeSection>

          {/* Insights inteligentes (sin IA externa) */}
          <SafeSection scope="dashboard:insights">
            <Suspense fallback={null}>
              <InsightsPanel />
            </Suspense>
          </SafeSection>

          {/* Entregas activas — marca entregada en 1 toque */}
          <TodayDeliveriesCard />

          {/* Apartados con saldo que vencen pronto — recordatorio en 1 toque */}
          <DueRemindersCard />

          {/* Productos que las clientas vienen viendo seguido */}
          <HotProductsCard />

          {/* Valor de inventario */}
          <InventoryValueCard
            value={stats?.inventoryValue ?? 0}
            products={stats?.products ?? 0}
            variants={stats?.variants ?? 0}
          />

          <StockoutRiskCard items={stats?.stockoutRisk ?? []} />
        </div>
      )}

      {/* ════════════════ ANÁLISIS ════════════════ */}
      {dashTab === "analisis" && (
        <div className="space-y-5">
          {/* Producto del mes — ganador automático del mes anterior */}
          <SafeSection scope="dashboard:product-of-month">
            <ProductOfMonthCard />
          </SafeSection>

          {/* Hora pico real — visitas vs ventas por hora (con toggle heatmap) */}
          <SafeSection scope="dashboard:peak-hours">
            <PeakHoursCard days={period} />
          </SafeSection>

          {/* Margen real por categoría — dónde se gana más dinero */}
          <SafeSection scope="dashboard:margin-by-category">
            <MarginByCategoryCard days={period} />
          </SafeSection>

          {/* Embudo por producto — visto → carrito → apartado → pagado */}
          <SafeSection scope="dashboard:product-funnel">
            <ProductFunnelCard days={period} />
          </SafeSection>

          {/* Métodos de pago */}
          <PaymentMethodsCard methods={stats?.paymentMethods ?? []} />

          {/* Top clientes */}
          <TopList
            title="Mejores clientes"
            icon={Users}
            tone="from-fuchsia-500 to-pink-500"
            empty="Aún no hay ventas en este período."
            items={(stats?.topCustomers ?? []).map((c) => ({
              key: c.name,
              left: c.name,
              right: formatCurrency(c.total),
              sub: `${c.orders} ${c.orders === 1 ? "compra" : "compras"}`,
            }))}
          />

          {/* Top productos */}
          <TopList
            title="Productos más vendidos"
            icon={ShoppingCart}
            tone="from-primary to-purple-500"
            empty="Aún no hay ventas en este período."
            items={(stats?.top ?? []).map((p) => ({
              key: p.name,
              left: p.name,
              right: `${p.qty}`,
              sub: `${p.qty === 1 ? "unidad" : "unidades"}`,
            }))}
          />

          {/* Categorías */}
          <TopList
            title="Categorías líderes"
            icon={Tag}
            tone="from-amber-500 to-orange-400"
            empty="Aún no hay ventas en este período."
            items={(stats?.topCategories ?? []).map((c) => ({
              key: c.category,
              left: c.category,
              right: formatCurrency(c.revenue),
              sub: `${c.qty} ${c.qty === 1 ? "pieza" : "piezas"}`,
            }))}
          />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0 // sin baseline = no se puede calcular
  return ((current - previous) / previous) * 100
}

function periodLabelFor(period: PeriodDays): string {
  if (period === 7) return "Últimos 7 días"
  if (period === 90) return "Últimos 90 días"
  return "Últimos 30 días"
}

/* ═══════════════════════════════════════════════════════════════════
   PERIOD SWITCHER
   ═══════════════════════════════════════════════════════════════════ */

function PeriodSwitcher({
  value,
  onChange,
}: {
  value: PeriodDays
  onChange: (v: PeriodDays) => void
}) {
  const opts: PeriodDays[] = [7, 30, 90]
  return (
    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5">
      {opts.map((d) => {
        const active = value === d
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={`relative h-9 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
              active
                ? "text-white"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                className="absolute inset-0 rounded-lg bg-primary shadow-bloom"
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
              />
            )}
            <span className="relative z-10">{d}d</span>
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   FINANCE HERO — ingresos / costo / ganancia / por cobrar
   Con leyenda explícita que aclara que "por cobrar" NO es pérdida.
   ═══════════════════════════════════════════════════════════════════ */

function FinanceHero({
  revenue,
  collected,
  cogs,
  profit,
  pending,
  margin,
  revGrowth,
  profitGrowth,
  periodLabel,
  trend,
}: {
  revenue: number
  collected: number
  cogs: number
  profit: number
  pending: number
  margin: number
  revGrowth: number | null
  profitGrowth: number | null
  periodLabel: string
  trend?: { date: string; revenue: number; profit: number; operations: number }[]
}) {
  const revenueSeries = trend?.map((t) => t.revenue) ?? []
  const profitSeries = trend?.map((t) => t.profit) ?? []
  const businessRules = useBusinessRules()
  const pendingAlertActive =
    businessRules.daily_pending_alert_enabled &&
    pending >= businessRules.daily_pending_alert_threshold &&
    businessRules.daily_pending_alert_threshold > 0
  return (
    <section className="rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-premium">
      {/* Banda de color */}
      <div
        className="h-1.5"
        style={{ background: "linear-gradient(90deg, var(--brand-from), var(--brand-to))" }}
      />

      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none">
              Ganancia neta · {periodLabel}
            </p>
            <h3 className="text-3xl md:text-4xl font-black tracking-tight tabular-nums mt-1">
              <AnimatedMoney value={profit} />
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
              <Sparkles size={11} className="text-primary" />
              Margen <strong className="text-slate-700 dark:text-slate-200">{margin.toFixed(1)}%</strong> sobre ingresos
            </p>
          </div>
          <Wallet size={22} className="text-primary/30 shrink-0" />
        </div>
        {/* Comparativa con período anterior */}
        <div className="flex flex-wrap gap-3 mb-5">
          <GrowthChip label="Ingresos" pct={revGrowth} />
          <GrowthChip label="Ganancia" pct={profitGrowth} />
        </div>

        {/* Desglose financiero — Vendido vs Cobrado separados.
            Mari pedía dejar claro que "$X de ingresos" no es lo mismo
            que "$X recibidos": una venta apartada cuenta en Vendido
            pero NO en Cobrado hasta que el cliente abone. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <FinTile
            tone="primary"
            label="Vendido"
            value={formatCurrency(revenue)}
            icon={ArrowUpRight}
            hint="Total vendido (incluye apartados)"
            sparkline={revenueSeries}
          />
          <FinTile
            tone="emerald"
            label="Cobrado"
            value={formatCurrency(collected)}
            icon={Wallet}
            hint="Dinero realmente recibido"
          />
          <FinTile
            tone="slate"
            label="Ganancia"
            value={formatCurrency(profit)}
            icon={TrendingUp}
            hint={`${margin.toFixed(0)}% de margen`}
            sparkline={profitSeries}
          />
          <FinTile
            tone="amber"
            label="Por cobrar"
            value={formatCurrency(pending)}
            icon={PiggyBank}
            hint="Apartados sin liquidar"
          />
        </div>

        {/* Aclaración crítica: "por cobrar" NO es pérdida.
            La ocultamos cuando ya estamos disparando la alerta roja
            (regla daily_pending_alert) — no queremos repetir info. */}
        {pending > 0 && !pendingAlertActive && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 p-3">
            <HelpCircle
              size={14}
              className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
            />
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
              <strong>"Por cobrar" no es pérdida:</strong> son apartados con
              saldo que te van a llegar conforme tus clientes paguen. La{" "}
              <strong>ganancia ya considera</strong> la mercancía vendida — los
              abonos pendientes son flujo de caja a futuro.
            </p>
          </div>
        )}

        {/* Alerta de saldo pendiente (regla daily_pending_alert) */}
        {pendingAlertActive && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-500/10 dark:to-pink-500/10 border border-rose-200 dark:border-rose-500/30 p-3"
          >
            <AlertTriangle
              size={16}
              className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300 leading-tight">
                Saldo pendiente alto
              </p>
              <p className="text-[11px] font-bold text-rose-700/80 dark:text-rose-300/80 leading-snug mt-0.5">
                {formatCurrency(pending)} por cobrar supera tu umbral de {formatCurrency(businessRules.daily_pending_alert_threshold)}. Sería buen momento de recordar abonos.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  )
}

function FinTile({
  tone,
  label,
  value,
  icon: Icon,
  hint,
  sparkline,
}: {
  tone: "primary" | "slate" | "emerald" | "amber"
  label: string
  value: string
  icon: typeof TrendingUp
  hint?: string
  sparkline?: number[]
}) {
  const cls = {
    primary:
      "bg-primary/8 text-primary border-primary/15 dark:bg-primary/15 dark:border-primary/30",
    slate:
      "bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700",
    emerald:
      "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
    amber:
      "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  }[tone]
  const sparkColor = {
    primary: "#e6007e",
    slate: "#64748b",
    emerald: "#10b981",
    amber: "#f59e0b",
  }[tone]
  return (
    <div className={`relative rounded-2xl px-3 py-3 border overflow-hidden ${cls}`}>
      <div className="flex items-center justify-between mb-1 relative z-10">
        <Icon size={12} className="opacity-70" />
        <span className="text-[8px] font-black uppercase tracking-widest opacity-70">
          {label}
        </span>
      </div>
      <p className="text-sm md:text-base font-black tabular-nums leading-tight relative z-10">
        {value}
      </p>
      {hint && (
        <p className="text-[9px] font-bold opacity-60 mt-0.5 leading-tight relative z-10">
          {hint}
        </p>
      )}
      {sparkline && sparkline.length > 1 && (
        <div className="absolute bottom-1 right-1 opacity-60 pointer-events-none">
          <Sparkline
            data={sparkline}
            width={56}
            height={22}
            stroke={sparkColor}
            strokeWidth={1.25}
            showDot={false}
          />
        </div>
      )}
    </div>
  )
}

function GrowthChip({ label, pct }: { label: string; pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px] font-black uppercase tracking-widest">
        {label} · sin comparativa
      </span>
    )
  }
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tabular-nums uppercase tracking-widest ${
        up
          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
      }`}
    >
      <Icon size={11} />
      {label} {up ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════════════ */

function StatCard({
  icon,
  value,
  label,
  growth,
  tone = "slate",
}: {
  icon: React.ReactNode
  value: React.ReactNode
  label: string
  growth?: number | null
  tone?: "slate" | "emerald" | "amber" | "rose"
}) {
  const toneCls = {
    slate: "bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-700",
    emerald:
      "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/30",
    amber:
      "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/30",
    rose:
      "bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/30",
  }[tone]
  return (
    <div className={`p-4 rounded-2xl border text-center ${toneCls}`}>
      <div className="flex justify-center mb-2 text-primary">{icon}</div>
      <p className="text-lg font-black tabular-nums leading-none">{value}</p>
      <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-1">
        {label}
      </p>
      {growth !== undefined && growth !== null && (
        <p
          className={`text-[9px] font-black uppercase tracking-widest mt-1 ${
            growth >= 0 ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {growth >= 0 ? "▲" : "▼"} {Math.abs(growth).toFixed(0)}%
        </p>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TREND CHART — movido a ./TrendChart (lazy import por chunk recharts)
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   INVENTORY VALUE
   ═══════════════════════════════════════════════════════════════════ */

function InventoryValueCard({
  value,
  products,
  variants,
}: {
  value: number
  products: number
  variants: number
}) {
  return (
    <section className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-pink-50/40 dark:from-slate-900/60 dark:to-pink-500/5 p-5 flex items-center gap-4">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-bloom shrink-0"
        style={{ background: "linear-gradient(135deg,#0f172a,#475569)" }}
      >
        <Package size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none">
          Inventario activo (al costo)
        </p>
        <p className="text-2xl font-black tabular-nums mt-1">
          {formatCurrency(value)}
        </p>
        <p className="text-[10px] text-slate-500 mt-1">
          {products} {products === 1 ? "producto" : "productos"} ·{" "}
          {variants} {variants === 1 ? "variante" : "variantes"}
        </p>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PAYMENT METHODS
   ═══════════════════════════════════════════════════════════════════ */

function PaymentMethodsCard({
  methods,
}: {
  methods: { method: string; amount: number; count: number }[]
}) {
  const total = methods.reduce((a, b) => a + b.amount, 0)

  return (
    <section className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-black flex items-center gap-1.5">
          <CreditCard size={14} className="text-primary" />
          Cómo te pagaron
        </h4>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {formatCurrency(total)} total
        </span>
      </div>

      {methods.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">
          Sin pagos registrados en este período.
        </p>
      ) : (
        <div className="space-y-2">
          {methods.map((m) => {
            const pct = total > 0 ? (m.amount / total) * 100 : 0
            const meta = methodMeta(m.method)
            const Icon = meta.icon
            return (
              <div key={m.method} className="space-y-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.bg} ${meta.fg} shrink-0`}
                  >
                    <Icon size={13} />
                  </div>
                  <span className="text-xs font-black flex-1 capitalize truncate">
                    {meta.label}
                  </span>
                  <span className="text-xs font-black tabular-nums shrink-0">
                    {formatCurrency(m.amount)}
                  </span>
                  <span className="text-[10px] font-black tabular-nums text-slate-400 w-10 text-right shrink-0">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden ml-9">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className={`h-full ${meta.bar}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function methodMeta(method: string): {
  label: string
  icon: typeof Banknote
  bg: string
  fg: string
  bar: string
} {
  const m = method.toLowerCase()
  if (m.includes("efectivo") || m.includes("cash")) {
    return {
      label: "Efectivo",
      icon: Banknote,
      bg: "bg-emerald-100 dark:bg-emerald-500/15",
      fg: "text-emerald-700 dark:text-emerald-300",
      bar: "bg-gradient-to-r from-emerald-400 to-emerald-500",
    }
  }
  if (m.includes("transfer")) {
    return {
      label: "Transferencia",
      icon: Building2,
      bg: "bg-sky-100 dark:bg-sky-500/15",
      fg: "text-sky-700 dark:text-sky-300",
      bar: "bg-gradient-to-r from-sky-400 to-sky-500",
    }
  }
  if (m.includes("tarjeta") || m.includes("card")) {
    return {
      label: "Tarjeta",
      icon: CreditCard,
      bg: "bg-fuchsia-100 dark:bg-fuchsia-500/15",
      fg: "text-fuchsia-700 dark:text-fuchsia-300",
      bar: "bg-gradient-to-r from-fuchsia-400 to-pink-500",
    }
  }
  if (m.includes("oxxo") || m.includes("conveniencia")) {
    return {
      label: "OXXO",
      icon: Building2,
      bg: "bg-orange-100 dark:bg-orange-500/15",
      fg: "text-orange-700 dark:text-orange-300",
      bar: "bg-gradient-to-r from-orange-400 to-orange-500",
    }
  }
  if (m.includes("paypal") || m.includes("mercado") || m.includes("digital")) {
    return {
      label: "Pago digital",
      icon: Smartphone,
      bg: "bg-indigo-100 dark:bg-indigo-500/15",
      fg: "text-indigo-700 dark:text-indigo-300",
      bar: "bg-gradient-to-r from-indigo-400 to-indigo-500",
    }
  }
  return {
    label: method || "Otro",
    icon: HelpCircle,
    bg: "bg-slate-100 dark:bg-slate-800",
    fg: "text-slate-600 dark:text-slate-300",
    bar: "bg-gradient-to-r from-slate-400 to-slate-500",
  }
}

/* ═══════════════════════════════════════════════════════════════════
   TOP LIST (clientes / productos / categorías)
   ═══════════════════════════════════════════════════════════════════ */

function TopList({
  title,
  icon: Icon,
  tone,
  empty,
  items,
}: {
  title: string
  icon: typeof Users
  tone: string // gradient classes "from-x to-y"
  empty: string
  items: { key: string; left: string; right: string; sub: string }[]
}) {
  return (
    <section className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-8 h-8 rounded-xl bg-gradient-to-br ${tone} text-white flex items-center justify-center shadow-bloom`}
        >
          <Icon size={14} />
        </div>
        <h4 className="text-sm font-black">{title}</h4>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-400 italic">{empty}</p>
      ) : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li
              key={it.key}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50"
            >
              <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 text-[10px] font-black flex items-center justify-center text-slate-500 shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black truncate">{it.left}</p>
                <p className="text-[9px] text-slate-400">{it.sub}</p>
              </div>
              <span className="text-xs font-black tabular-nums text-primary shrink-0">
                {it.right}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   DAILY OPS — 3 cards de acceso rápido a los pendientes operativos
   ═══════════════════════════════════════════════════════════════════ */

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
          : "from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/60 text-slate-400",
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
          : "from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/60 text-slate-400",
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
          : "from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/60 text-slate-400",
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
              has ? "border-white/30 shadow-bloom" : "border-slate-200/60 dark:border-slate-700/60"
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

function AnimatedMoney({ value }: { value: number }) {
  const animated = useCountUp(value, 650)
  return <span>{formatCurrency(animated)}</span>
}

export function StockoutRiskCard({
  items,
}: {
  items: { variantId: string; productName: string; variantName: string; stock: number; daysUntilStockout: number; soldPerDay: number }[]
}) {
  if (!items || items.length === 0) return null
  return (
    <section className="rounded-3xl border border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-orange-50/40 dark:from-amber-500/10 dark:to-orange-500/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-bloom">
          <Activity size={14} />
        </div>
        <div>
          <h4 className="text-sm font-black">Pronto sin stock</h4>
          <p className="text-[10px] font-bold text-slate-500">
            Al ritmo actual de venta
          </p>
        </div>
      </div>
      <ol className="space-y-2">
        {items.map((it) => {
          const urgent = it.daysUntilStockout <= 3
          return (
            <li
              key={it.variantId}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
                urgent
                  ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30"
                  : "bg-white dark:bg-slate-900/40 border-slate-100 dark:border-slate-800"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black truncate">{it.productName}</p>
                <p className="text-[10px] text-slate-500 truncate">{it.variantName}</p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`text-sm font-black tabular-nums ${
                    urgent ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {it.daysUntilStockout < 1 ? "<1" : Math.round(it.daysUntilStockout)} d
                </p>
                <p className="text-[9px] font-bold text-slate-400 tabular-nums">
                  {it.stock} pz · {it.soldPerDay}/día
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function GenerateReportButton({
  targetId,
  periodLabel,
}: {
  targetId: string
  periodLabel: string
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const node = document.getElementById(targetId) as HTMLElement | null
        const safeLabel = periodLabel.toLowerCase().replace(/\s+/g, "-")
        shareTicketPdf({ node, filename: `reporte-${safeLabel}.pdf` })
      }}
      className="h-10 px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 active:scale-95 shadow-sm"
      title="Generar PDF del resumen"
    >
      <FileDown size={12} /> PDF
    </button>
  )
}

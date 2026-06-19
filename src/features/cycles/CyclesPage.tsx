import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar,
  Sparkles,
  CheckCircle2,
  Receipt,
  Plus,
  Loader2,
  PlayCircle,
  StopCircle,
  Trophy,
  Target,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  History,
  X,
  Wand2,
} from "lucide-react"
import toast from "react-hot-toast"

import { useCycle } from "./useCycle"
import {
  addCapitalInjection,
  addExpense,
  closeCycle,
  estimateCurrentInventoryCost,
  EXPENSE_CATEGORIES,
  openCycle,
  suggestNextCycleName,
  type InventoryCycle,
  type CycleSnapshot,
} from "./cyclesService"
import { formatMoney } from "../../lib/format"

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return "—"
  }
}

function daysAgo(iso: string): number {
  return Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 86400000)
  )
}

export default function CyclesPage() {
  const { state, refresh } = useCycle()
  const [openModal, setOpenModal] = useState<
    "open" | "inject" | "expense" | "close" | null
  >(null)

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  return (
    <div className="relative space-y-5 max-w-5xl mx-auto">
      {/* Orbs decorativos */}
      <span className="deco-orb deco-orb-violet top-0 -left-20 w-72 h-72" />
      <span className="deco-orb deco-orb-pink top-32 -right-20 w-80 h-80" />

      {/* HEADER */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black leading-none mb-1">
            Análisis financiero
          </p>
          <h1 className="text-2xl font-black tracking-tight leading-none">
            Ciclos de Inventario
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cuándo recuperas tu inversión y cuándo el dinero ya es ganancia
            libre.
          </p>
        </div>
      </div>

      {/* HERO: ciclo activo */}
      {state.active && state.snapshot ? (
        <ActiveCycleHero
          cycle={state.active}
          snapshot={state.snapshot}
          onInject={() => setOpenModal("inject")}
          onExpense={() => setOpenModal("expense")}
          onClose={() => setOpenModal("close")}
        />
      ) : (
        <NoActiveCycle onOpen={() => setOpenModal("open")} />
      )}

      {/* Detalle: inyecciones + gastos */}
      {state.active && (
        <div className="grid md:grid-cols-2 gap-4">
          <DetailList
            icon={ArrowDownCircle}
            tone="emerald"
            title="Capital inyectado"
            empty="Sin inyecciones todavía"
            items={state.injections.map((i) => ({
              id: i.id,
              left: i.description ?? "Inyección de capital",
              right: `+${formatMoney(i.amount)}`,
              sub: formatDate(i.created_at),
            }))}
            cta={{ label: "+ Inyectar capital", onClick: () => setOpenModal("inject") }}
          />
          <DetailList
            icon={ArrowUpCircle}
            tone="rose"
            title="Gastos operativos"
            empty="Sin gastos registrados"
            items={state.expenses.map((e) => ({
              id: e.id,
              left:
                EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label ??
                e.category,
              right: `-${formatMoney(e.amount)}`,
              sub: `${formatDate(e.occurred_on)}${
                e.description ? " · " + e.description : ""
              }`,
            }))}
            cta={{ label: "+ Registrar gasto", onClick: () => setOpenModal("expense") }}
          />
        </div>
      )}

      {/* Historial */}
      {state.history.filter((c) => c.status === "closed").length > 0 && (
        <CycleHistory
          cycles={state.history.filter((c) => c.status === "closed")}
        />
      )}

      {/* MODALES */}
      <AnimatePresence>
        {openModal === "open" && (
          <OpenCycleModal
            onClose={() => setOpenModal(null)}
            onDone={async () => {
              setOpenModal(null)
              await refresh()
            }}
          />
        )}
        {openModal === "inject" && state.active && (
          <InjectModal
            cycleId={state.active.id}
            onClose={() => setOpenModal(null)}
            onDone={async () => {
              setOpenModal(null)
              await refresh()
            }}
          />
        )}
        {openModal === "expense" && state.active && (
          <ExpenseModal
            cycleId={state.active.id}
            onClose={() => setOpenModal(null)}
            onDone={async () => {
              setOpenModal(null)
              await refresh()
            }}
          />
        )}
        {openModal === "close" && state.active && state.snapshot && (
          <CloseCycleModal
            cycle={state.active}
            snapshot={state.snapshot}
            onClose={() => setOpenModal(null)}
            onDone={async () => {
              setOpenModal(null)
              await refresh()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* =========================================================
   HERO — Ciclo activo
   ========================================================= */
function ActiveCycleHero({
  cycle,
  snapshot,
  onInject,
  onExpense,
  onClose,
}: {
  cycle: InventoryCycle
  snapshot: CycleSnapshot
  onInject: () => void
  onExpense: () => void
  onClose: () => void
}) {
  const beReached = !!snapshot.break_even_at
  const pct = Math.min(100, snapshot.break_even_pct || 0)
  const overflowPct = Math.max(0, (snapshot.break_even_pct || 0) - 100)
  const days = daysAgo(cycle.started_at)
  const gradient = beReached
    ? "linear-gradient(135deg,#10b981,#34d399)"
    : "linear-gradient(135deg, var(--brand-from), var(--brand-to))"

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-premium"
    >
      {/* Banda de color superior */}
      <div className="h-1.5" style={{ background: gradient }} />

      <div className="p-5 md:p-6">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-bloom shrink-0"
              style={{ background: gradient }}
            >
              <Calendar className="text-white" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black leading-none">
                Ciclo activo
              </p>
              <h2 className="text-2xl font-black tracking-tight leading-none mt-1 truncate">
                {cycle.name}
              </h2>
              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                <Clock size={10} /> Iniciado hace {days}{" "}
                {days === 1 ? "día" : "días"}
              </p>
            </div>
          </div>
          {beReached && (
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest shrink-0"
            >
              <Trophy size={11} /> Break-even
            </motion.div>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest mb-2">
            <span className="text-slate-500">
              {formatMoney(snapshot.revenue)} <span className="text-slate-300">/</span>{" "}
              {formatMoney(snapshot.total_investment)}
            </span>
            <span className={beReached ? "text-emerald-600" : "text-primary"}>
              {pct.toFixed(0)}%
              {overflowPct > 0 && (
                <span className="text-emerald-600 ml-1">
                  +{overflowPct.toFixed(0)}%
                </span>
              )}
            </span>
          </div>
          <div className="relative h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="absolute inset-y-0 left-0"
              style={{ background: gradient }}
            />
            {overflowPct > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, overflowPct)}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                className="absolute inset-y-0 right-0 bg-gradient-to-r from-emerald-300/40 to-emerald-500/60"
              />
            )}
          </div>
        </div>

        {/* Mensaje principal */}
        <div
          className={`mb-5 rounded-2xl p-4 ${
            beReached
              ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30"
              : "bg-primary/5 dark:bg-primary/10 border border-primary/15"
          }`}
        >
          {beReached ? (
            <div className="flex items-start gap-3">
              <Sparkles
                size={20}
                className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
              />
              <div>
                <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                  ¡Recuperaste tu inversión!
                </p>
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-200/80 mt-0.5">
                  Punto de equilibrio alcanzado el{" "}
                  <strong>{formatDate(snapshot.break_even_at)}</strong>. Cada
                  venta nueva ya cuenta como ganancia neta libre.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Target size={20} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                  Faltan {formatMoney(snapshot.remaining_to_be)} para recuperar
                  tu inversión.
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cuando el indicador llegue al 100%, cada venta nueva ya es
                  ganancia neta.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <Kpi
            label="Inversión activa"
            value={formatMoney(snapshot.total_investment)}
            tone="slate"
            hint={
              snapshot.capital_injections > 0
                ? `+${formatMoney(snapshot.capital_injections)} extra`
                : undefined
            }
          />
          <Kpi
            label="Cobrado"
            value={formatMoney(snapshot.revenue)}
            tone="primary"
          />
          <Kpi
            label="Gastos del ciclo"
            value={formatMoney(snapshot.expenses)}
            tone="rose"
          />
          <Kpi
            label={beReached ? "Ganancia libre" : "Ganancia proyectada"}
            value={formatMoney(snapshot.net_profit_projection)}
            tone={snapshot.net_profit_projection >= 0 ? "emerald" : "rose"}
          />
        </div>

        {/* Detalles secundarios */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5 text-[10px]">
          <DetailMini label="Stock heredado" value={formatMoney(cycle.opening_inventory_cost)} />
          <DetailMini label="Lote nuevo" value={formatMoney(cycle.new_lot_cost)} />
          <DetailMini label="COGS (costo vendido)" value={formatMoney(snapshot.cogs)} />
          <DetailMini label="Inventario hoy (costo)" value={formatMoney(snapshot.current_inventory_cost)} />
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onInject}
            className="flex-1 min-w-[120px] h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <ArrowDownCircle size={13} /> Inyectar capital
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onExpense}
            className="flex-1 min-w-[120px] h-11 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <Receipt size={13} /> Gasto operativo
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex-1 min-w-[120px] h-11 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom"
            style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}
          >
            <StopCircle size={13} /> Cerrar ciclo
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: "primary" | "emerald" | "rose" | "slate"
  hint?: string
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary border-primary/15",
    emerald:
      "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-500/20",
    rose:
      "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-500/20",
    slate:
      "bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-100 dark:border-slate-700",
  }[tone]
  return (
    <div className={`rounded-2xl px-3 py-2.5 border ${toneClass}`}>
      <p className="text-[8px] font-black uppercase tracking-widest opacity-80">
        {label}
      </p>
      <p className="text-sm font-black tabular-nums mt-0.5">{value}</p>
      {hint && <p className="text-[8px] font-bold opacity-60 mt-0.5">{hint}</p>}
    </div>
  )
}

function DetailMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
      <span className="font-bold uppercase tracking-widest text-slate-400 truncate">
        {label}
      </span>
      <span className="font-black tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
        {value}
      </span>
    </div>
  )
}

/* =========================================================
   Empty state
   ========================================================= */
function NoActiveCycle({ onOpen }: { onOpen: () => void }) {
  // Pre-detectamos el inventario actual para que el primer ciclo se vea
  // motivacional ("vas a empezar midiendo $X de inversión") en vez de
  // sentirse abstracto.
  const [autoCost, setAutoCost] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    estimateCurrentInventoryCost().then((v) => {
      if (alive) setAutoCost(v)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center"
    >
      <div
        className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-bloom"
        style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
      >
        <PlayCircle className="text-white" size={26} />
      </div>
      <h3 className="text-base font-black tracking-tight mb-1">
        Aún no abres un ciclo
      </h3>
      <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
        Un ciclo te dice <strong>cuándo recuperas tu inversión</strong> y a
        partir de qué momento cada venta ya es ganancia libre.
      </p>

      {autoCost !== null && autoCost > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 text-primary text-[10px] font-black uppercase tracking-widest mb-4"
        >
          <Wand2 size={11} />
          Ya detectamos {formatMoney(autoCost)} de inventario
        </motion.div>
      )}

      <div>
        <button
          onClick={onOpen}
          className="h-11 px-5 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-bloom inline-flex items-center gap-2"
          style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
        >
          <Plus size={14} /> Abrir mi primer ciclo
        </button>
      </div>
    </motion.div>
  )
}

/* =========================================================
   Listas auxiliares (gastos / inyecciones)
   ========================================================= */
function DetailList({
  icon: Icon,
  tone,
  title,
  empty,
  items,
  cta,
}: {
  icon: typeof ArrowDownCircle
  tone: "emerald" | "rose"
  title: string
  empty: string
  items: { id: string; left: string; right: string; sub: string }[]
  cta: { label: string; onClick: () => void }
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10"
      : "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10"
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${toneClass}`}
          >
            <Icon size={14} />
          </div>
          <h3 className="text-xs font-black uppercase tracking-widest">
            {title}
          </h3>
        </div>
        <button
          onClick={cta.onClick}
          className="text-[9px] font-black uppercase tracking-widest text-primary"
        >
          {cta.label}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[10px] text-slate-400 italic">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-black truncate">{it.left}</p>
                <p className="text-[9px] text-slate-400 truncate">{it.sub}</p>
              </div>
              <p
                className={`text-xs font-black tabular-nums shrink-0 ${
                  tone === "emerald" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {it.right}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* =========================================================
   Historial
   ========================================================= */
function CycleHistory({ cycles }: { cycles: InventoryCycle[] }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} className="text-slate-400" />
        <h3 className="text-xs font-black uppercase tracking-widest">
          Historial de ciclos
        </h3>
      </div>
      <div className="space-y-2">
        {cycles.map((c) => {
          const net = Number(c.net_profit ?? 0)
          const positive = net >= 0
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50"
            >
              <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black truncate">{c.name}</p>
                <p className="text-[9px] text-slate-400">
                  {formatDate(c.started_at)} → {formatDate(c.closed_at)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[8px] font-black uppercase text-slate-400">
                  Neto
                </p>
                <p
                  className={`text-xs font-black tabular-nums ${
                    positive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {positive ? "+" : ""}
                  {formatMoney(net)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* =========================================================
   MODALES
   ========================================================= */

function ModalShell({
  children,
  onClose,
  title,
  icon: Icon,
  disabled,
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
  icon: typeof Plus
  disabled?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[180]"
    >
      <div
        className="absolute inset-0 bg-slate-950/70"
        onClick={() => !disabled && onClose()}
      />
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-premium"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-bloom"
              style={{
                background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
              }}
            >
              <Icon className="text-white" size={18} />
            </div>
            <h3 className="text-base font-black tracking-tight">{title}</h3>
          </div>
          <button
            onClick={() => !disabled && onClose()}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function OpenCycleModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const suggested = useMemo(() => suggestNextCycleName(), [])
  const [name, setName] = useState(suggested)
  const [newLot, setNewLot] = useState("")
  const [openingOverride, setOpeningOverride] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  // Auto-detección del costo actual del inventario al montar el modal.
  // Si la query devuelve algo > 0, lo mostramos como sugerencia con un
  // CTA "Usar este monto" para que el admin no tenga que escribirlo a mano.
  const [autoCost, setAutoCost] = useState<number | null>(null)
  const [autoLoading, setAutoLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setAutoLoading(true)
    estimateCurrentInventoryCost()
      .then((v) => {
        if (alive) setAutoCost(v)
      })
      .finally(() => {
        if (alive) setAutoLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Si el admin no escribió override, la BD lo calcula sola. Pero queremos
  // mostrar en el resumen visual lo que se va a registrar.
  const willUseOpening = (() => {
    const manual = parseFloat(openingOverride)
    if (Number.isFinite(manual) && manual >= 0) return manual
    return autoCost ?? 0
  })()
  const newLotNum = parseFloat(newLot) || 0
  const investmentPreview = willUseOpening + newLotNum

  const applyAuto = () => {
    if (autoCost !== null) setOpeningOverride(autoCost.toFixed(2))
  }

  const submit = async () => {
    if (!name.trim()) return toast.error("Pon un nombre al ciclo")
    setBusy(true)
    const tid = toast.loading("Abriendo ciclo...")
    try {
      await openCycle({
        name: name.trim(),
        newLotCost: newLotNum,
        openingInventoryCost:
          openingOverride.trim() === "" ? null : parseFloat(openingOverride),
        notes: notes.trim() || null,
      })
      toast.success("Ciclo abierto ✨", { id: tid })
      await onDone()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo abrir", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Abrir nuevo ciclo" icon={PlayCircle} onClose={onClose} disabled={busy}>
      {/* Banner auto-detección */}
      {!autoLoading && autoCost !== null && autoCost > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-2xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/15 p-3 flex items-start gap-3"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-bloom shrink-0"
            style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
          >
            <Wand2 className="text-white" size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
              Detectamos tu inventario
            </p>
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-snug">
              Tu stock actual vale aproximadamente{" "}
              <strong className="tabular-nums">{formatMoney(autoCost)}</strong>
              . Lo usamos como inversión inicial salvo que escribas otra cifra.
            </p>
            {openingOverride.trim() === "" ? (
              <p className="text-[9px] text-primary/80 mt-1 italic">
                ✓ Aplicado automáticamente
              </p>
            ) : (
              <button
                type="button"
                onClick={applyAuto}
                className="text-[9px] font-black uppercase tracking-widest text-primary mt-1 hover:underline"
              >
                Restaurar valor detectado
              </button>
            )}
          </div>
        </motion.div>
      )}

      <div className="space-y-3">
        <Field
          label="Nombre del ciclo"
          value={name}
          onChange={setName}
          placeholder="Junio 2026"
          hint="Se sugiere el mes actual. Cámbialo si quieres."
        />
        <Field
          label="Costo del lote nuevo (opcional)"
          value={newLot}
          onChange={setNewLot}
          placeholder="0"
          type="number"
          prefix="$"
          hint="Lo que pagaste por la mercancía nueva que metes en este ciclo."
        />
        <Field
          label={
            autoCost !== null && autoCost > 0
              ? "Inventario heredado (auto-detectado)"
              : "Inventario heredado (opcional)"
          }
          value={openingOverride}
          onChange={setOpeningOverride}
          placeholder={
            autoCost !== null && autoCost > 0
              ? `Auto: ${formatMoney(autoCost)}`
              : "0"
          }
          type="number"
          prefix="$"
          hint="Vacío = se calcula solo con tu stock actual × costo."
        />
        <Field
          label="Notas (opcional)"
          value={notes}
          onChange={setNotes}
          placeholder="Compras de temporada, etc."
        />
      </div>

      {/* Resumen claro de qué se va a registrar */}
      <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
          Inversión inicial registrada
        </p>
        <div className="flex justify-between text-[11px] font-bold text-slate-500">
          <span>Inventario heredado</span>
          <span className="tabular-nums">{formatMoney(willUseOpening)}</span>
        </div>
        <div className="flex justify-between text-[11px] font-bold text-slate-500">
          <span>+ Lote nuevo</span>
          <span className="tabular-nums">{formatMoney(newLotNum)}</span>
        </div>
        <div className="flex justify-between pt-1.5 mt-1.5 border-t border-slate-200 dark:border-slate-700">
          <span className="text-xs font-black">Total inversión</span>
          <span className="text-base font-black text-primary tabular-nums">
            {formatMoney(investmentPreview)}
          </span>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full h-11 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
        Abrir ciclo
      </button>
    </ModalShell>
  )
}

function InjectModal({
  cycleId,
  onClose,
  onDone,
}: {
  cycleId: string
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [amount, setAmount] = useState("")
  const [desc, setDesc] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const a = parseFloat(amount)
    if (!a || a <= 0) return toast.error("Monto inválido")
    setBusy(true)
    const tid = toast.loading("Registrando capital...")
    try {
      await addCapitalInjection({
        cycleId,
        amount: a,
        description: desc.trim() || null,
      })
      toast.success("Capital inyectado", { id: tid })
      await onDone()
    } catch (e: any) {
      toast.error(e?.message ?? "Error", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Inyectar capital" icon={ArrowDownCircle} onClose={onClose} disabled={busy}>
      <div className="space-y-3">
        <Field
          label="Monto"
          value={amount}
          onChange={setAmount}
          type="number"
          prefix="$"
          placeholder="0.00"
        />
        <Field
          label="Descripción"
          value={desc}
          onChange={setDesc}
          placeholder="p. ej. Reabastecer lote, ahorros, préstamo"
        />
      </div>
      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full h-11 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
        style={{ background: "linear-gradient(135deg,#10b981,#34d399)" }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowDownCircle size={14} />}
        Registrar
      </button>
    </ModalShell>
  )
}

function ExpenseModal({
  cycleId,
  onClose,
  onDone,
}: {
  cycleId: string
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].id)
  const [desc, setDesc] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const a = parseFloat(amount)
    if (!a || a <= 0) return toast.error("Monto inválido")
    setBusy(true)
    const tid = toast.loading("Registrando gasto...")
    try {
      await addExpense({
        cycleId,
        amount: a,
        category,
        description: desc.trim() || null,
        occurredOn: date,
      })
      toast.success("Gasto registrado", { id: tid })
      await onDone()
    } catch (e: any) {
      toast.error(e?.message ?? "Error", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title="Registrar gasto" icon={Receipt} onClose={onClose} disabled={busy}>
      <div className="space-y-3">
        <div>
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
            Categoría
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`h-10 rounded-xl text-[10px] font-black uppercase tracking-tight transition-colors ${
                  c.id === category
                    ? "bg-primary text-white shadow-bloom"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <Field
          label="Monto"
          value={amount}
          onChange={setAmount}
          type="number"
          prefix="$"
          placeholder="0.00"
        />
        <Field
          label="Fecha"
          value={date}
          onChange={setDate}
          type="date"
        />
        <Field
          label="Descripción (opcional)"
          value={desc}
          onChange={setDesc}
          placeholder="p. ej. recibo CFE julio"
        />
      </div>
      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full h-11 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
        style={{ background: "linear-gradient(135deg,#ef4444,#f43f5e)" }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
        Registrar gasto
      </button>
    </ModalShell>
  )
}

function CloseCycleModal({
  cycle,
  snapshot,
  onClose,
  onDone,
}: {
  cycle: InventoryCycle
  snapshot: CycleSnapshot
  onClose: () => void
  onDone: () => void | Promise<void>
}) {
  const [closing, setClosing] = useState(
    String(snapshot.current_inventory_cost.toFixed(2))
  )
  const [openNext, setOpenNext] = useState(true)
  const [nextName, setNextName] = useState(suggestNextCycleName(cycle.name))
  const [busy, setBusy] = useState(false)

  // Re-cálculo en vivo del costo de inventario remanente, por si las
  // ventas/movimientos cambiaron desde que se generó el snapshot. Si la
  // query devuelve algo válido, se usa como sugerencia editable.
  const [liveCost, setLiveCost] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    estimateCurrentInventoryCost().then((v) => {
      if (alive && v !== null) {
        setLiveCost(v)
        setClosing(v.toFixed(2))
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const closingNum = parseFloat(closing) || 0
  const netFinal = snapshot.revenue - snapshot.cogs - snapshot.expenses

  const submit = async () => {
    setBusy(true)
    const tid = toast.loading("Cerrando ciclo...")
    try {
      const r = await closeCycle({
        cycleId: cycle.id,
        closingInventoryCost: closingNum,
        openNextName: openNext ? nextName.trim() : null,
      })
      toast.success(
        r.next_cycle_id
          ? "Ciclo cerrado y siguiente abierto ✨"
          : "Ciclo cerrado",
        { id: tid }
      )
      await onDone()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cerrar", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell title={`Cerrar "${cycle.name}"`} icon={StopCircle} onClose={onClose} disabled={busy}>
      {/* Resumen */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3 mb-3 space-y-1.5">
        <Row label="Inversión activa" value={formatMoney(snapshot.total_investment)} />
        <Row label="Cobrado total" value={formatMoney(snapshot.revenue)} accent="primary" />
        <Row label="Costo de lo vendido" value={`- ${formatMoney(snapshot.cogs)}`} />
        <Row label="Gastos operativos" value={`- ${formatMoney(snapshot.expenses)}`} />
        <div className="border-t border-slate-200 dark:border-slate-700 my-1.5" />
        <Row
          label="Ganancia neta"
          value={formatMoney(netFinal)}
          accent={netFinal >= 0 ? "emerald" : "rose"}
          big
        />
        {snapshot.break_even_at && (
          <p className="text-[9px] text-emerald-600 mt-1 flex items-center gap-1">
            <Trophy size={9} /> Break-even alcanzado:{" "}
            {formatDate(snapshot.break_even_at)}
          </p>
        )}
      </div>

      <Field
        label="Costo del inventario que queda"
        value={closing}
        onChange={setClosing}
        type="number"
        prefix="$"
        hint={
          liveCost !== null
            ? `Auto-calculado en vivo: ${formatMoney(liveCost)}. Edítalo si haces ajuste manual.`
            : "Este monto se hereda al siguiente ciclo como inversión inicial."
        }
      />

      <label className="flex items-center gap-2 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={openNext}
          onChange={(e) => setOpenNext(e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-xs font-bold">Abrir siguiente ciclo de inmediato</span>
      </label>
      {openNext && (
        <Field
          label="Nombre del siguiente ciclo"
          value={nextName}
          onChange={setNextName}
          placeholder="Julio 2026"
          className="mt-2"
        />
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 w-full h-11 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
        style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
        Cerrar definitivamente
      </button>
    </ModalShell>
  )
}

function Row({
  label,
  value,
  accent = "slate",
  big,
}: {
  label: string
  value: string
  accent?: "slate" | "primary" | "emerald" | "rose"
  big?: boolean
}) {
  const c = {
    slate: "text-slate-700 dark:text-slate-200",
    primary: "text-primary",
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
  }[accent]
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="font-bold text-slate-500">{label}</span>
      <span className={`font-black tabular-nums ${c} ${big ? "text-base" : ""}`}>
        {value}
      </span>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  prefix,
  hint,
  className = "",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  prefix?: string
  hint?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full h-11 ${
            prefix ? "pl-8" : "pl-3"
          } pr-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 dark:text-slate-100`}
        />
      </div>
      {hint && (
        <p className="text-[9px] text-slate-400 mt-1 italic">{hint}</p>
      )}
    </div>
  )
}

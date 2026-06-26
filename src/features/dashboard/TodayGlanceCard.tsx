import { useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Truck from "lucide-react/dist/esm/icons/truck"
import Receipt from "lucide-react/dist/esm/icons/receipt"
import Wallet from "lucide-react/dist/esm/icons/wallet"
import Cake from "lucide-react/dist/esm/icons/cake"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right"
import Sun from "lucide-react/dist/esm/icons/sun"
import Sparkles from "lucide-react/dist/esm/icons/sparkles"

import { getTodayGlance, type TodayGlance } from "./todayGlanceService"
import { formatMoney } from "../../lib/format"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"

/**
 * "Tu día en 1 vistazo" — card-hero que aparece al inicio del Dashboard.
 *
 * Diseño: una sola tarjeta amplia con header con saludo dinámico y debajo
 * 4 mini-bloques scrolleables horizontal (Entregas, Comprobantes, Saldos,
 * Cumpleaños). Cada mini-bloque navega a su sección al hacer tap.
 *
 * Filosofía: que Mari NO tenga que abrir 5 pestañas a las 8am para entender
 * qué hay que hacer hoy.
 */

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Buenos días"
  if (h < 19) return "Buenas tardes"
  return "Buenas noches"
}

function navigateTo(section: string) {
  window.dispatchEvent(
    new CustomEvent("app:navigate", { detail: { tab: section } }),
  )
}

export default function TodayGlanceCard() {
  const [data, setData] = useState<TodayGlance | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useDebouncedCallback(() => {
    getTodayGlance()
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, 500)

  useEffect(() => {
    setLoading(true)
    getTodayGlance()
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  // Realtime: cualquier cambio en deliveries/sales/proofs invalida.
  useRealtimeSubscription("delivery_notes", refresh)
  useRealtimeSubscription("payment_proofs", refresh)
  useRealtimeSubscription("sales", refresh)

  const stats = useMemo(() => {
    if (!data) return { d: 0, du: 0, p: 0, ds: 0, b: 0 }
    return {
      d: data.deliveries.length,
      du: data.deliveries.filter((x) => x.is_urgent).length,
      p: data.proofs.length,
      ds: data.dueSales.length,
      b: data.birthdays.length,
    }
  }, [data])

  // Si no hay nada que hacer, omite la card por completo (no ensucia el panel).
  const isQuietDay =
    !loading && data && stats.d === 0 && stats.p === 0 && stats.ds === 0 && stats.b === 0

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 h-40 animate-pulse" />
    )
  }
  if (isQuietDay) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 p-5 flex items-center gap-3"
      >
        <span className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-2xl">
          ☀️
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300 font-black">
            {greeting()}
          </p>
          <p className="text-sm font-black text-slate-800 dark:text-slate-100">
            Día despejado. Sin pendientes urgentes ✨
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-amber-50/40 to-pink-50/40 dark:from-slate-900/60 dark:via-amber-500/5 dark:to-pink-500/5 overflow-hidden"
      aria-label="Tu día en un vistazo"
    >
      {/* Header con saludo + total a cobrar hoy */}
      <header className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/50">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-widest font-black text-amber-600 dark:text-amber-300 flex items-center gap-1">
            <Sun size={11} /> Hoy
          </p>
          <h3 className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
            {greeting()}, Mari{" "}
            <Sparkles
              size={14}
              className="inline -mt-1 text-amber-500 dark:text-amber-300"
            />
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Lo importante de hoy en un solo bloque
          </p>
        </div>
        {(data?.cash_to_collect_today ?? 0) > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-[9px] uppercase tracking-widest font-black text-emerald-700 dark:text-emerald-300">
              A cobrar
            </p>
            <p className="text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatMoney(data?.cash_to_collect_today ?? 0)}
            </p>
            <p className="text-[9px] text-slate-400">en camino</p>
          </div>
        )}
      </header>

      {/* Mini-bloques scrolleables */}
      <div className="overflow-x-auto scroll-container-ios">
        <div className="flex gap-2 px-3 py-3 min-w-min">
          <GlanceTile
            tone="sky"
            icon={Truck}
            big={stats.d}
            label="Entregas"
            sub={stats.du > 0 ? `${stats.du} urgentes` : "Sin urgencias"}
            onClick={() => navigateTo("entregas")}
            disabled={stats.d === 0}
          />
          <GlanceTile
            tone="violet"
            icon={Receipt}
            big={stats.p}
            label="Comprobantes"
            sub={stats.p > 0 ? "por revisar" : "Al día"}
            onClick={() => navigateTo("pendientes")}
            disabled={stats.p === 0}
          />
          <GlanceTile
            tone="amber"
            icon={Wallet}
            big={stats.ds}
            label="Saldos"
            sub={
              stats.ds > 0
                ? `${formatMoney(
                    data?.dueSales.reduce((s, x) => s + x.balance, 0) ?? 0,
                  )} por cobrar`
                : "Sin pendientes"
            }
            onClick={() => navigateTo("pendientes")}
            disabled={stats.ds === 0}
          />
          <GlanceTile
            tone="rose"
            icon={Cake}
            big={stats.b}
            label="Cumpleaños"
            sub={
              stats.b > 0
                ? (data?.birthdays[0]?.full_name ?? "").split(" ")[0] +
                  (stats.b > 1 ? ` y ${stats.b - 1} más` : "")
                : "Hoy nadie"
            }
            onClick={() => navigateTo("usuarios")}
            disabled={stats.b === 0}
          />
        </div>
      </div>

      {/* Detalle expandible si hay ≥1 entrega urgente */}
      <AnimatePresence>
        {stats.du > 0 && data && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-slate-100 dark:border-slate-800/50 px-4 py-3 bg-rose-50/50 dark:bg-rose-500/5"
          >
            <p className="text-[9px] uppercase tracking-widest font-black text-rose-700 dark:text-rose-300 mb-2">
              ⚠️ Pendientes de ayer o más
            </p>
            <ul className="space-y-1.5">
              {data.deliveries
                .filter((d) => d.is_urgent)
                .slice(0, 3)
                .map((d) => (
                  <li
                    key={d.id}
                    className="text-[11px] text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      <span className="font-black">
                        {d.customer_name ?? "Cliente"}
                      </span>
                      {d.delivery_zone ? (
                        <span className="text-slate-500"> · {d.delivery_zone}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-rose-700 dark:text-rose-300 font-black tabular-nums">
                      {formatMoney(d.amount_to_collect)}
                    </span>
                  </li>
                ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

/* ───────── Tile auxiliar ───────── */

type TileTone = "sky" | "violet" | "amber" | "rose"

const TILE_TONE: Record<
  TileTone,
  { bg: string; ring: string; icon: string; text: string }
> = {
  sky: {
    bg: "bg-sky-50 dark:bg-sky-500/10",
    ring: "ring-sky-200 dark:ring-sky-500/30",
    icon: "text-sky-600 dark:text-sky-300",
    text: "text-sky-700 dark:text-sky-200",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-500/10",
    ring: "ring-violet-200 dark:ring-violet-500/30",
    icon: "text-violet-600 dark:text-violet-300",
    text: "text-violet-700 dark:text-violet-200",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-500/10",
    ring: "ring-amber-200 dark:ring-amber-500/30",
    icon: "text-amber-600 dark:text-amber-300",
    text: "text-amber-700 dark:text-amber-200",
  },
  rose: {
    bg: "bg-rose-50 dark:bg-rose-500/10",
    ring: "ring-rose-200 dark:ring-rose-500/30",
    icon: "text-rose-600 dark:text-rose-300",
    text: "text-rose-700 dark:text-rose-200",
  },
}

function GlanceTile({
  tone,
  icon: Icon,
  big,
  label,
  sub,
  onClick,
  disabled,
}: {
  tone: TileTone
  icon: typeof Truck
  big: number
  label: string
  sub: string
  onClick: () => void
  disabled?: boolean
}) {
  const t = TILE_TONE[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${big}`}
      className={`shrink-0 w-[150px] rounded-2xl px-3 py-2.5 text-left transition-all ring-1 ${t.bg} ${t.ring} ${
        disabled
          ? "opacity-55 cursor-default"
          : "hover:scale-[1.02] active:scale-[0.97]"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Icon size={16} className={t.icon} />
        {!disabled && (
          <ChevronRight size={12} className="text-slate-400 dark:text-slate-500" />
        )}
      </div>
      <p className={`text-2xl font-black tabular-nums leading-none ${t.text}`}>
        {big}
      </p>
      <p className="text-[9px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-400 mt-1">
        {label}
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
        {sub}
      </p>
    </button>
  )
}

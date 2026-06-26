import { useEffect, useState, useMemo } from "react"
import { motion } from "framer-motion"
import Trophy from "lucide-react/dist/esm/icons/trophy"
import Lock from "lucide-react/dist/esm/icons/lock"
import Crown from "lucide-react/dist/esm/icons/crown"
import Calendar from "lucide-react/dist/esm/icons/calendar"
import Flame from "lucide-react/dist/esm/icons/flame"
import Award from "lucide-react/dist/esm/icons/award"

import { useAuth } from "../../lib/useAuth"
import {
  listLoyaltyRules,
  fetchMyEvents,
  fetchMyBalance,
  type LoyaltyRule,
  type LoyaltyEvent,
  type LoyaltyBalance,
} from "./loyaltyService"
import { useUserPrefs } from "../../lib/userPrefs"
import { formatRelative } from "../../lib/format"
import { supabase } from "../../lib/supabase"
import PageHeader from "../../components/ui/PageHeader"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"

/**
 * Mis Trofeos — página del cliente que muestra:
 *
 *   1. Grid de logros (bloqueados/desbloqueados) — uno por loyalty_rule.
 *      Visual: badge gigante con emoji + label + descripción. Tap muestra
 *      cuándo lo desbloqueó.
 *   2. Calendario tipo GitHub (52 semanas × 7 días) con la actividad
 *      del último año. Cada cuadrito = una compra/evento de loyalty.
 *   3. Top 10 anónimo del mes — leaderboard sano (nombre enmascarado:
 *      "K***a · 1,200 pts").
 *
 * Estética: dark-mode-friendly, sin emojis cringe (los emojis salen de
 * las propias reglas configuradas por Mari).
 */

interface TrophyEntry {
  rule: LoyaltyRule
  /** Cuántas veces se ha "ganado" esta regla (0 = bloqueada) */
  count: number
  firstAt: string | null
  lastAt: string | null
}

export default function MyTrophiesPage() {
  const { email } = useAuth()
  const prefs = useUserPrefs()
  const [rules, setRules] = useState<LoyaltyRule[]>([])
  const [events, setEvents] = useState<LoyaltyEvent[]>([])
  const [balance, setBalance] = useState<LoyaltyBalance | null>(null)
  const [top10, setTop10] = useState<{ key: string; points: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [rs, evs, bal, top] = await Promise.all([
          listLoyaltyRules().catch(() => []),
          email ? fetchMyEvents(email, 200).catch(() => []) : Promise.resolve([]),
          email ? fetchMyBalance(email).catch(() => null) : Promise.resolve(null),
          loadTop10(),
        ])
        if (cancelled) return
        setRules(rs)
        setEvents(evs)
        setBalance(bal)
        setTop10(top)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [email])

  const trophies = useMemo<TrophyEntry[]>(() => {
    return rules.map((r) => {
      const matches = events.filter((e) => e.action_key === r.action_key)
      const sorted = matches.sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      )
      return {
        rule: r,
        count: matches.length,
        firstAt: sorted[0]?.created_at ?? null,
        lastAt: sorted[sorted.length - 1]?.created_at ?? null,
      }
    })
  }, [rules, events])

  const unlocked = trophies.filter((t) => t.count > 0).length
  const totalLifetime = balance?.lifetime_earned ?? 0
  const streak = prefs.dailyLoginStreak ?? 0

  if (loading) {
    return (
      <div className="p-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (!email) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <EmptyStateIllustration variant="no-orders" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Inicia sesión para ver tus trofeos y tu progreso.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-[920px] mx-auto p-3 sm:p-5 pb-24 space-y-5">
      <PageHeader
        icon={Trophy}
        iconTone="amber"
        title="Mis trofeos"
        subtitle={`${unlocked} de ${trophies.length} desbloqueados · ${totalLifetime} pts ganados en total`}
      />

      {/* Hero pequeño con tres mini-stats */}
      <section className="grid grid-cols-3 gap-2">
        <MiniStat
          icon={Trophy}
          tone="amber"
          label="Trofeos"
          value={`${unlocked}/${trophies.length}`}
        />
        <MiniStat
          icon={Flame}
          tone="rose"
          label="Racha"
          value={`${streak} d`}
        />
        <MiniStat
          icon={Award}
          tone="emerald"
          label="Lifetime"
          value={`${totalLifetime}`}
        />
      </section>

      {/* Grid de trofeos */}
      <section>
        <h3 className="text-[11px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-400 mb-2">
          Logros
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {trophies.map((t) => (
            <TrophyTile key={t.rule.action_key} entry={t} />
          ))}
        </div>
      </section>

      {/* Calendario tipo GitHub */}
      <section>
        <h3 className="text-[11px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
          <Calendar size={11} /> Tu año en actividad
        </h3>
        <ActivityCalendar events={events} />
      </section>

      {/* Top 10 anónimo */}
      <section>
        <h3 className="text-[11px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
          <Crown size={11} /> Top 10 del mes
        </h3>
        {top10.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic text-center py-4">
            Sé la primera en aparecer este mes 👀
          </p>
        ) : (
          <ol className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {top10.map((p, i) => {
              const isMe = email && p.key === maskEmail(email)
              return (
                <li
                  key={`${p.key}-${i}`}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    isMe ? "bg-amber-50 dark:bg-amber-500/10" : ""
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center text-[11px] font-black tabular-nums shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">
                    {p.key}
                    {isMe && (
                      <span className="ml-1 text-[9px] uppercase tracking-widest font-black text-amber-700 dark:text-amber-300">
                        · tú
                      </span>
                    )}
                  </span>
                  <span className="text-[12px] font-black tabular-nums text-amber-700 dark:text-amber-300">
                    {p.points} pts
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        <p className="text-[9px] text-slate-400 italic text-center mt-2">
          Nombres anónimos para proteger privacidad
        </p>
      </section>
    </div>
  )
}

/* ─────────── Helpers ─────────── */

async function loadTop10(): Promise<{ key: string; points: number }[]> {
  // Sumamos puntos de events del mes actual agrupado por customer_email.
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  firstOfMonth.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from("loyalty_events")
    .select("customer_email, delta")
    .gte("created_at", firstOfMonth.toISOString())
    .gt("delta", 0)
    .limit(5000)
  if (error || !Array.isArray(data)) return []
  const agg = new Map<string, number>()
  for (const r of data as any[]) {
    const e = String(r.customer_email || "").toLowerCase()
    if (!e) continue
    agg.set(e, (agg.get(e) ?? 0) + Number(r.delta || 0))
  }
  return Array.from(agg.entries())
    .map(([email, points]) => ({ key: maskEmail(email), points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
}

function maskEmail(email: string): string {
  const [user] = email.split("@")
  if (!user) return "***"
  if (user.length <= 2) return `${user[0]}*`
  return `${user[0]}***${user.slice(-1)}`
}

/* ─────────── Sub-componentes ─────────── */

function MiniStat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Trophy
  tone: "amber" | "rose" | "emerald"
  label: string
  value: string
}) {
  const TONE = {
    amber: "from-amber-50 to-amber-100/40 dark:from-amber-500/10 dark:to-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-500/30",
    rose: "from-rose-50 to-rose-100/40 dark:from-rose-500/10 dark:to-rose-500/5 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-500/30",
    emerald:
      "from-emerald-50 to-emerald-100/40 dark:from-emerald-500/10 dark:to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30",
  }
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-3 ${TONE[tone]}`}
    >
      <Icon size={14} />
      <p className="text-xl font-black tabular-nums mt-1 leading-none">
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-widest font-black mt-0.5 opacity-70">
        {label}
      </p>
    </div>
  )
}

function TrophyTile({ entry }: { entry: TrophyEntry }) {
  const locked = entry.count === 0
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`relative rounded-2xl border p-3 aspect-square flex flex-col items-center justify-center text-center ${
        locked
          ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 opacity-60"
          : "border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-500/15 dark:to-amber-500/5 shadow-sm shadow-amber-200/40 dark:shadow-amber-900/20"
      }`}
    >
      {locked && (
        <Lock
          size={10}
          className="absolute top-1.5 right-1.5 text-slate-400"
        />
      )}
      {entry.count > 1 && (
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black tabular-nums">
          ×{entry.count}
        </span>
      )}
      <div className="text-3xl mb-1 grayscale-0">
        {entry.rule.emoji || (locked ? "🔒" : "🏆")}
      </div>
      <p
        className={`text-[10px] font-black uppercase tracking-widest leading-tight ${
          locked
            ? "text-slate-500 dark:text-slate-400"
            : "text-amber-700 dark:text-amber-300"
        }`}
      >
        {entry.rule.label}
      </p>
      <p className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight line-clamp-2">
        {locked
          ? entry.rule.description ?? "Bloqueado"
          : entry.lastAt
          ? formatRelative(entry.lastAt)
          : "Desbloqueado"}
      </p>
    </motion.div>
  )
}

/* ─────────── Calendario tipo GitHub ─────────── */

function ActivityCalendar({ events }: { events: LoyaltyEvent[] }) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const weeks = 52

  // Mapear events por YYYY-MM-DD → count
  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) {
      if (e.delta <= 0) continue
      const k = e.created_at.slice(0, 10)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [events])

  // 52 weeks * 7 days = 364 días hacia atrás desde hoy
  const cells: { date: Date; count: number }[][] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const week: { date: Date; count: number }[] = []
    for (let d = 6; d >= 0; d--) {
      const date = new Date(today)
      date.setDate(date.getDate() - (w * 7 + d))
      const key = date.toISOString().slice(0, 10)
      week.push({ date, count: byDay.get(key) ?? 0 })
    }
    cells.push(week)
  }

  const intensity = (n: number) => {
    if (n === 0) return "bg-slate-100 dark:bg-slate-800/60"
    if (n === 1) return "bg-emerald-200 dark:bg-emerald-500/40"
    if (n === 2) return "bg-emerald-400 dark:bg-emerald-500/60"
    if (n <= 4) return "bg-emerald-600 dark:bg-emerald-500/80"
    return "bg-emerald-800 dark:bg-emerald-400"
  }

  const totalDays = Array.from(byDay.values()).length

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-3 overflow-x-auto scroll-container-ios">
      <div className="flex gap-[2px]">
        {cells.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[2px]">
            {week.map((cell) => (
              <div
                key={cell.date.toISOString()}
                title={`${cell.date.toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                })} · ${cell.count} eventos`}
                className={`w-[10px] h-[10px] rounded-sm ${intensity(
                  cell.count,
                )}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span>{totalDays} días con actividad este año</span>
        <span className="flex items-center gap-1">
          Menos
          <span className="w-[10px] h-[10px] rounded-sm bg-slate-200 dark:bg-slate-700" />
          <span className="w-[10px] h-[10px] rounded-sm bg-emerald-300 dark:bg-emerald-500/50" />
          <span className="w-[10px] h-[10px] rounded-sm bg-emerald-500 dark:bg-emerald-500/70" />
          <span className="w-[10px] h-[10px] rounded-sm bg-emerald-700 dark:bg-emerald-400" />
          Más
        </span>
      </div>
    </div>
  )
}

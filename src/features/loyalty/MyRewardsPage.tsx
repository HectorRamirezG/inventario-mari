/**
 * MyRewardsPage — Vista cliente "Mis premios y logros".
 *
 * Visión escaparate del progreso del cliente:
 *  - HERO con puntos actuales + valor en pesos + lifetime ganado
 *  - Progreso a VIP (si auto_vip_enabled): barra gasto mensual vs threshold
 *  - LOGROS: grid de milestones desbloqueados/pendientes derivados de
 *    datos del cliente (compras, reseñas, puntos). NO requiere tabla
 *    nueva — todo se calcula de lo que ya existe en BD.
 *  - REGLAS DE PUNTOS: explica cómo ganar más (lee loyalty_rules
 *    activas del catálogo).
 *  - BOTÓN a histórico → abre LoyaltyDrawer.
 *
 * Solo se muestra si rule.loyalty_enabled. Si no, redirige a tienda.
 */
import { useCallback, useEffect, useState } from "react"
import { useNavigate, Navigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Trophy,
  Sparkles,
  Crown,
  Award,
  Star,
  ShoppingBag,
  History,
  Zap,
  Lock,
  Share2,
} from "lucide-react"
import toast from "react-hot-toast"

import { useAuth } from "../../lib/useAuth"
import { useBusinessRules } from "../settings/businessRulesService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import { useMonthlySpent } from "../../lib/useMonthlySpent"
import { useUserPrefs } from "../../lib/userPrefs"
import { useMyLoyaltyBalance, listLoyaltyRules } from "./loyaltyService"
import type { LoyaltyRule } from "./loyaltyService"
import { supabase } from "../../lib/supabase"
import { formatMoney } from "../../lib/format"
import PageHeader from "../../components/ui/PageHeader"
import Skeleton from "../../components/ui/Skeleton"
import LoyaltyDrawer from "./LoyaltyDrawer"

/* ────────────── Logros derivados (calculados de BD) ────────────── */

interface DerivedAchievement {
  id: string
  emoji: string
  title: string
  caption: string
  unlocked: boolean
  /** Progreso 0..1 para los no desbloqueados. Opcional. */
  progress?: number
}

interface ClientStats {
  totalOrders: number
  totalReviews: number
  lifetimePoints: number
  monthlySpent: number
  pendingReviews: number
  /** Días consecutivos abriendo la app (de userPrefs). */
  loginStreak: number
  /** Total de wishes que el cliente ha pedido. */
  totalWishes: number
}

function buildAchievements(s: ClientStats, vipThreshold: number): DerivedAchievement[] {
  return [
    {
      id: "first_purchase",
      emoji: "🎁",
      title: "Primera compra",
      caption: "Hiciste tu primer pedido",
      unlocked: s.totalOrders >= 1,
    },
    {
      id: "five_purchases",
      emoji: "🛍️",
      title: "Cliente fiel",
      caption: "5 pedidos completados",
      unlocked: s.totalOrders >= 5,
      progress: Math.min(1, s.totalOrders / 5),
    },
    {
      id: "first_review",
      emoji: "⭐",
      title: "Tu primera reseña",
      caption: "Compartiste tu opinión",
      unlocked: s.totalReviews >= 1,
    },
    {
      id: "five_reviews",
      emoji: "📝",
      title: "Crítica experta",
      caption: "5 reseñas publicadas",
      unlocked: s.totalReviews >= 5,
      progress: Math.min(1, s.totalReviews / 5),
    },
    {
      id: "hundred_points",
      emoji: "💯",
      title: "100 puntos",
      caption: "Sigue ganando premios",
      unlocked: s.lifetimePoints >= 100,
      progress: Math.min(1, s.lifetimePoints / 100),
    },
    {
      id: "vip_unlocked",
      emoji: "👑",
      title: vipThreshold > 0 ? `VIP (gasto ≥ ${formatMoney(vipThreshold)})` : "VIP automático",
      caption:
        vipThreshold > 0
          ? "Aplicas precio mayoreo automático"
          : "Habla con Beauty's Me para activarlo",
      unlocked: vipThreshold > 0 && s.monthlySpent >= vipThreshold,
      progress: vipThreshold > 0 ? Math.min(1, s.monthlySpent / vipThreshold) : undefined,
    },
    {
      id: "ten_purchases",
      emoji: "💎",
      title: "Cliente diamante",
      caption: "10 pedidos completados",
      unlocked: s.totalOrders >= 10,
      progress: Math.min(1, s.totalOrders / 10),
    },
    /* ─── Logros nuevos basados en data existente ─── */
    {
      id: "streak_week",
      emoji: "🔥",
      title: "Semana sin faltar",
      caption: "7 días seguidos visitando",
      unlocked: s.loginStreak >= 7,
      progress: Math.min(1, s.loginStreak / 7),
    },
    {
      id: "streak_month",
      emoji: "👑",
      title: "Constante",
      caption: "30 días seguidos visitando",
      unlocked: s.loginStreak >= 30,
      progress: Math.min(1, s.loginStreak / 30),
    },
    {
      id: "first_wish",
      emoji: "💌",
      title: "Pediste tu primer deseo",
      caption: "Mari te escucha — sigue contándole qué buscas",
      unlocked: s.totalWishes >= 1,
    },
    {
      id: "social_butterfly",
      emoji: "🦋",
      title: "Social butterfly",
      caption: "3 reseñas + 1 deseo + 1 compra",
      unlocked: s.totalReviews >= 3 && s.totalWishes >= 1 && s.totalOrders >= 1,
    },
    {
      id: "five_hundred_points",
      emoji: "🌟",
      title: "500 puntos lifetime",
      caption: "Coleccionista pro",
      unlocked: s.lifetimePoints >= 500,
      progress: Math.min(1, s.lifetimePoints / 500),
    },
  ]
}

export default function MyRewardsPage() {
  const { email, session } = useAuth()
  const navigate = useNavigate()
  const bRules = useBusinessRules()
  const { balance } = useMyLoyaltyBalance()
  const { spent: monthlySpent } = useMonthlySpent(email, 30)
  const { prefs } = useUserPrefs()

  const [stats, setStats] = useState<ClientStats | null>(null)
  const [rules, setRules] = useState<LoyaltyRule[]>([])
  const [loading, setLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!email) return
    setLoading(true)
    try {
      // Stats del cliente: pedidos, reseñas, deseos. Best-effort en parallel.
      const [salesRes, reviewsRes, wishesRes, rulesRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id", { count: "exact", head: true })
          .ilike("customer_email", email.trim())
          .neq("status", "cancelled"),
        supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .ilike("customer_email", email.trim()),
        supabase
          .from("wishes")
          .select("id", { count: "exact", head: true })
          .ilike("customer_email", email.trim()),
        listLoyaltyRules().catch(() => []),
      ])

      setStats({
        totalOrders: salesRes.count ?? 0,
        totalReviews: reviewsRes.count ?? 0,
        lifetimePoints: balance?.lifetime_earned ?? 0,
        monthlySpent,
        pendingReviews: 0, // calculado solo si Mari lo necesita despues
        loginStreak: prefs.dailyLoginStreak ?? 0,
        totalWishes: wishesRes.count ?? 0,
      })
      setRules(rulesRes.filter((r) => r.enabled))
    } finally {
      setLoading(false)
    }
  }, [email, balance?.lifetime_earned, monthlySpent, prefs.dailyLoginStreak])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime: actualiza cuando llegan eventos de loyalty/sales/reviews.
  const debounced = useDebouncedCallback(refresh, 800)
  useRealtimeSubscription("loyalty_events" as any, debounced, {
    enabled: !!email,
  })
  useRealtimeSubscription("sales", debounced, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })
  useRealtimeSubscription("reviews", debounced, {
    enabled: !!email,
    match: (row: any) =>
      row?.customer_email?.toLowerCase() === email?.toLowerCase(),
  })

  // Si la regla está apagada, no mostramos esta página: ir a tienda.
  if (!bRules.loyalty_enabled) {
    return <Navigate to="/" replace />
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: "/mis-premios" }} />
  }

  const points = balance?.points ?? 0
  const lifetimeEarned = balance?.lifetime_earned ?? 0
  const pesoPorPunto = bRules.loyalty_peso_por_punto || 1
  const valuePesos = points * pesoPorPunto

  const vipThreshold = bRules.auto_vip_enabled
    ? bRules.auto_vip_monthly_threshold || 0
    : 0
  const achievements = stats
    ? buildAchievements(stats, vipThreshold)
    : []
  const unlockedCount = achievements.filter((a) => a.unlocked).length

  if (loading && !stats) {
    return (
      <div className="max-w-2xl mx-auto pb-32 px-1 pt-1 space-y-4">
        <Skeleton className="h-10 w-48" rounded="md" />
        <Skeleton className="h-44 w-full" rounded="xl" />
        <Skeleton className="h-32 w-full" rounded="xl" />
        <Skeleton className="h-48 w-full" rounded="xl" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-32 px-1 pt-1 space-y-4">
      <PageHeader
        icon={Trophy}
        iconTone="amber"
        title="Mis premios"
        subtitle={
          points > 0
            ? `${points} pts ≈ ${formatMoney(valuePesos)} para tu próxima compra`
            : "Suma puntos comprando y reseñando"
        }
        right={
          <button
            onClick={() => setHistoryOpen(true)}
            aria-label="Historial"
            title="Historial de puntos"
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center press"
          >
            <History size={14} />
          </button>
        }
      />

      {/* HERO grande con puntos */}
      <RewardsHero
        points={points}
        lifetimeEarned={lifetimeEarned}
        valuePesos={valuePesos}
        minRedeem={bRules.loyalty_min_redeem || 0}
      />

      {/* Botón compartir mi link de referido. Cuando un amigo se
          registra usando ?ref=miemail, Mari ve la fuente y dispara
          manualmente el award `referral` desde el editor de reglas. */}
      {email && <ReferralShareCard email={email} />}

      {/* PROGRESO VIP (si auto_vip activo) */}
      {vipThreshold > 0 && stats && (
        <VipProgress
          currentSpent={monthlySpent}
          threshold={vipThreshold}
        />
      )}

      {/* LOGROS */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Award size={11} />
            Mis logros
          </h2>
          <span className="text-[9px] font-bold text-slate-400 tabular-nums">
            {unlockedCount}/{achievements.length}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {achievements.map((a, i) => (
            <AchievementCard key={a.id} achievement={a} index={i} />
          ))}
        </div>
      </section>

      {/* CÓMO GANAR MÁS */}
      {rules.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Zap size={11} />
              Cómo ganar más puntos
            </h2>
          </div>

          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li
                key={r.action_key}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-base">
                  {r.emoji ?? "✨"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-slate-900 dark:text-slate-100 leading-tight">
                    {r.label}
                  </p>
                  {r.description && (
                    <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 leading-snug">
                      {r.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 text-[10px] font-black tabular-nums">
                  +{r.points}
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full mt-2 h-11 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom press-hard"
          >
            <ShoppingBag size={13} /> Empezar a ganar
          </button>
        </section>
      )}

      <LoyaltyDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  )
}

/* ============================================================== */

function RewardsHero({
  points,
  lifetimeEarned,
  valuePesos,
  minRedeem,
}: {
  points: number
  lifetimeEarned: number
  valuePesos: number
  minRedeem: number
}) {
  const { prefs } = useUserPrefs()
  const streak = prefs.dailyLoginStreak
  const showStreak = streak >= 2
  // Si aún no puede canjear pero ya tiene >0, mostramos barra de
  // progreso al primer canje. Si ya puede, mostramos "¡Listo para canjear!"
  const canRedeem = minRedeem > 0 && points >= minRedeem
  const showProgress = minRedeem > 0 && points > 0 && points < minRedeem
  const progressPct = showProgress
    ? Math.min(100, Math.round((points / minRedeem) * 100))
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-orange-400 to-pink-500 text-white p-5 shadow-bloom"
    >
      {/* Orbes decorativos */}
      <span className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/20 blur-2xl pointer-events-none" />
      <span className="absolute -bottom-16 -left-8 w-44 h-44 rounded-full bg-white/10 blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={16} />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-90">
            Tus puntos
          </p>
          {showStreak && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/25 backdrop-blur text-[9px] font-black tabular-nums">
              🔥 {streak} días seguidos
            </span>
          )}
        </div>
        <p className="text-5xl font-black tabular-nums leading-none">
          {points}
        </p>
        <p className="text-[12px] font-bold opacity-90 mt-1">
          ≈ {formatMoney(valuePesos)} en tu próxima compra
        </p>
        {lifetimeEarned > points && (
          <p className="text-[10px] font-bold opacity-75 mt-1 flex items-center gap-1">
            <Sparkles size={10} /> {lifetimeEarned} ganados de toda la vida
          </p>
        )}

        {/* Barra de progreso al primer canje. */}
        {showProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] font-bold mb-1">
              <span className="opacity-90">
                Te faltan {minRedeem - points} pts para canjear
              </span>
              <span className="opacity-80 tabular-nums">
                {points}/{minRedeem}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/25 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full bg-white rounded-full"
              />
            </div>
          </div>
        )}

        {canRedeem && (
          <p className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/25 backdrop-blur text-[10px] font-black uppercase tracking-widest">
            ✨ ¡Listos para canjear!
          </p>
        )}
      </div>
    </motion.div>
  )
}

function VipProgress({
  currentSpent,
  threshold,
}: {
  currentSpent: number
  threshold: number
}) {
  const pct = Math.min(100, (currentSpent / threshold) * 100)
  const isVip = currentSpent >= threshold
  const remaining = Math.max(0, threshold - currentSpent)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-2xl border p-4 overflow-hidden ${
        isVip
          ? "bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-500/15 dark:to-fuchsia-500/15 border-violet-200 dark:border-violet-500/30"
          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isVip
              ? "bg-violet-200 text-violet-700 dark:bg-violet-500/30 dark:text-violet-200"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
          }`}
        >
          <Crown size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-[10px] font-black uppercase tracking-widest ${
              isVip
                ? "text-violet-700 dark:text-violet-300"
                : "text-slate-500"
            }`}
          >
            {isVip ? "Eres VIP ✨" : "Progreso a VIP"}
          </p>
          <p className="text-[14px] font-black text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
            {formatMoney(currentSpent)}{" "}
            <span className="text-[11px] font-bold opacity-60">
              / {formatMoney(threshold)}
            </span>
          </p>
        </div>
      </div>

      <div className="relative h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`absolute inset-y-0 left-0 rounded-full ${
            isVip
              ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
              : "bg-gradient-to-r from-amber-400 to-orange-500"
          }`}
        />
      </div>

      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-2 leading-snug">
        {isVip
          ? "Aplicas precio mayoreo automático en todas tus compras este mes."
          : `Te faltan ${formatMoney(remaining)} gastados este mes para activar el precio VIP.`}
      </p>
    </motion.div>
  )
}

function AchievementCard({
  achievement,
  index,
}: {
  achievement: DerivedAchievement
  index: number
}) {
  const { unlocked, emoji, title, caption, progress } = achievement
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.04, 0.2) }}
      className={`relative rounded-2xl p-3 border transition-all overflow-hidden ${
        unlocked
          ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border-amber-200/60 dark:border-amber-500/30"
          : "bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-700/50"
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 ${
            unlocked
              ? "bg-amber-100 dark:bg-amber-500/20"
              : "bg-slate-200 dark:bg-slate-700"
          }`}
        >
          {unlocked ? emoji : <Lock size={14} className="text-slate-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-[11px] font-black leading-tight ${
              unlocked
                ? "text-slate-900 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {title}
          </p>
          <p className="text-[9px] font-bold opacity-70 leading-snug mt-0.5 line-clamp-2">
            {caption}
          </p>
          {!unlocked && typeof progress === "number" && progress > 0 && (
            <div className="mt-2 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
      {unlocked && (
        <span className="absolute top-1.5 right-1.5 text-[8px]" aria-hidden>
          <Star size={10} className="fill-amber-400 text-amber-400" />
        </span>
      )}
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * Tarjeta de referido: cliente comparte un link con su email
 * embebido como ?ref=. Cuando una amiga se registra usando ese
 * link, Mari ve el origen y otorga manualmente los puntos vía
 * el editor de reglas (regla `referral`).
 * ───────────────────────────────────────────────────────────── */

function ReferralShareCard({ email }: { email: string }) {
  const handleShare = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://beautysme.app"
    const ref = encodeURIComponent(email.toLowerCase())
    const url = `${origin}/?ref=${ref}`
    const text = `¡Compra en Beauty's Me! Yo ya soy clienta y te lo recomiendo 💖\n${url}`
    try {
      const { shareText } = await import("../../lib/share")
      const r = await shareText({ title: "Beauty's Me", text })
      if (r === "copied") {
        toast.success("Tu link de invitación se copió al portapapeles")
      } else if (r === "shared") {
        toast.success("¡Compartido! Cuando tu amiga compre, gana puntos 💎")
      }
    } catch {
      toast.error("No se pudo compartir")
    }
  }

  return (
    <motion.button
      type="button"
      onClick={handleShare}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-2xl p-3 flex items-center gap-3 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-bloom press-hard"
    >
      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
        <Share2 size={16} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[11px] font-black uppercase tracking-widest opacity-90">
          Invita a una amiga
        </p>
        <p className="text-[10px] font-bold opacity-90 leading-snug">
          Comparte tu link · cuando compre, ambas ganan puntos
        </p>
      </div>
      <span className="shrink-0 text-[10px] font-black opacity-80">→</span>
    </motion.button>
  )
}

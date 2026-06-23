import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users,
  RefreshCw,
  Crown,
  ShoppingBag,
  Eye,
  Search,
  Mail,
  Phone,
  MessageCircle,
  Clock,
  Smartphone,
  ExternalLink,
  Shield,
} from "lucide-react"
import Fuse from "fuse.js"

import PageHeader from "../../components/ui/PageHeader"
import TabBar from "../../components/ui/TabBar"
import KpiCard from "../../components/ui/KpiCard"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import Skeleton from "../../components/ui/Skeleton"
import VipBadge from "../../components/ui/VipBadge"
import { formatDateTime, formatMoney } from "../../lib/format"
import { isVipCustomer } from "../../lib/vipStatus"
import { useBusinessRules } from "../settings/businessRulesService"
import {
  listAllUsers,
  listVisitors,
  type RegisteredUser,
  type Visitor,
} from "./usersService"

type Tab = "registrados" | "anonimos"

const TABS = [
  { id: "registrados" as const, label: "Registrados", icon: Users },
  { id: "anonimos" as const, label: "Anónimos", icon: Eye },
]

function timeAgo(iso: string | null): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return `hace ${Math.floor(d / 30)} mes${Math.floor(d / 30) === 1 ? "" : "es"}`
}

function deviceFromUA(ua: string | null): string {
  if (!ua) return "Desconocido"
  if (/iPhone|iPad|iPod/.test(ua)) return "iPhone/iPad"
  if (/Android/.test(ua)) return "Android"
  if (/Mac OS/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows"
  if (/Linux/.test(ua)) return "Linux"
  return "Web"
}

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>("registrados")
  const [users, setUsers] = useState<RegisteredUser[]>([])
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErrMsg(null)
    try {
      const [u, v] = await Promise.all([listAllUsers(300), listVisitors(300, false)])
      setUsers(u)
      setVisitors(v)
    } catch (e: any) {
      setErrMsg(e?.message ?? "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Fuzzy search por tab activo
  const fuseUsers = useMemo(
    () =>
      new Fuse(users, {
        keys: ["full_name", "email", "phone"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [users],
  )
  const fuseVisitors = useMemo(
    () =>
      new Fuse(visitors, {
        keys: ["session_id", "user_agent", "converted_user_email"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [visitors],
  )

  const filteredUsers = useMemo(() => {
    const q = search.trim()
    if (!q) return users
    return fuseUsers.search(q).map((r: { item: any }) => r.item)
  }, [users, search, fuseUsers])
  const filteredVisitors = useMemo(() => {
    const q = search.trim()
    if (!q) return visitors
    return fuseVisitors.search(q).map((r: { item: any }) => r.item)
  }, [visitors, search, fuseVisitors])

  // KPIs
  const kpis = useMemo(() => {
    const buyers = users.filter((u) => u.orders > 0).length
    const dormant = users.filter((u) => u.orders === 0).length
    const totalSpent = users.reduce((s, u) => s + Number(u.total_spent || 0), 0)
    const anonUnique = visitors.length
    return { buyers, dormant, totalSpent, anonUnique }
  }, [users, visitors])

  return (
    <div className="relative max-w-5xl mx-auto pb-32 px-3 pt-1">
      <span className="deco-orb deco-orb-pink top-0 -left-16 w-64 h-64" />
      <span className="deco-orb deco-orb-amber top-32 -right-16 w-72 h-72" />

      <PageHeader
        icon={Users}
        iconTone="primary"
        title="Usuarios"
        subtitle={`${users.length} registrados · ${visitors.length} visitantes`}
        right={
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refrescar"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center text-primary press disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <KpiCard label="Han comprado" value={kpis.buyers} tone="success" icon={<ShoppingBag size={9} />} />
        <KpiCard label="Solo registrados" value={kpis.dormant} tone="warn" icon={<Clock size={9} />} />
        <KpiCard label="Anónimos únicos" value={kpis.anonUnique} tone="primary" icon={<Eye size={9} />} />
        <KpiCard label="Ventas totales" value={formatMoney(kpis.totalSpent)} tone="default" icon={<Crown size={9} />} />
      </div>

      {/* Tabs */}
      <div className="mb-3">
        <TabBar
          tabs={TABS}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
          layoutId="users-tab"
        />
      </div>

      {/* Buscador */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "registrados" ? "Buscar nombre, email, teléfono..." : "Buscar dispositivo, email..."}
          className="w-full h-11 pl-10 pr-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[12px] font-bold outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 text-slate-900 dark:text-slate-100"
        />
      </div>

      {errMsg && (
        <div className="mb-3 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3">
          <p className="text-[11px] font-black text-rose-700 dark:text-rose-300">
            {errMsg.includes("does not exist") || errMsg.includes("404") || errMsg.includes("PGRST")
              ? "Falta correr supabase/users_and_visitors.sql en el SQL Editor"
              : errMsg}
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {tab === "registrados" ? (
          <motion.div
            key="registrados"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {loading && filteredUsers.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" rounded="xl" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <EmptyStateIllustration
                variant="no-orders"
                title="Sin usuarios"
                subtitle={search ? "Sin coincidencias" : "Nadie se ha registrado todavía"}
              />
            ) : (
              <ul className="space-y-2">
                {filteredUsers.map((u: RegisteredUser) => (
                  <UserRow key={u.id} user={u} />
                ))}
              </ul>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="anonimos"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {loading && filteredVisitors.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" rounded="xl" />
                ))}
              </div>
            ) : filteredVisitors.length === 0 ? (
              <EmptyStateIllustration
                variant="no-orders"
                title="Sin visitantes anónimos"
                subtitle={search ? "Sin coincidencias" : "Nadie ha entrado sin sesión todavía"}
              />
            ) : (
              <ul className="space-y-2">
                {filteredVisitors.map((v: Visitor) => (
                  <VisitorRow key={v.id} visitor={v} />
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function UserRow({ user }: { user: RegisteredUser }) {
  const rules = useBusinessRules()
  const isAdmin = user.role === "admin"
  const isStaff = user.role === "staff"
  const hasBought = user.orders > 0
  // VIP heurística: role explícito o gasto mensual o lifetime points.
  const isVip = isVipCustomer(rules, {
    role: user.role,
    monthlySpent: user.total_spent, // best-effort: usamos total_spent global
    lifetimePoints: user.lifetime_earned,
  })
  const initials = (user.full_name || user.email)
    .split(/\s+|@/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <li className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 p-3 flex items-center gap-3">
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center font-black text-sm">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        {isVip && (
          <span className="absolute -top-1 -right-1 pointer-events-none">
            <VipBadge size={12} title={`${user.full_name || user.email} es VIP`} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
            {user.full_name || user.email.split("@")[0]}
          </p>
          {isAdmin && (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-primary/15 text-primary flex items-center gap-0.5">
              <Shield size={8} /> Admin
            </span>
          )}
          {isStaff && (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              Staff
            </span>
          )}
          {isVip && !isAdmin && !isStaff && (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center gap-0.5 shadow-sm">
              ★ VIP
            </span>
          )}
          {!hasBought && (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Sin comprar
            </span>
          )}
        </div>
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
          <Mail size={9} /> {user.email}
          {user.phone && (
            <>
              <span className="mx-1 text-slate-300">·</span>
              <Phone size={9} /> {user.phone}
            </>
          )}
        </p>
        <p className="text-[9px] text-slate-400 mt-0.5">
          Registrado {timeAgo(user.created_at)}
          {user.last_sign_in_at && ` · Último login ${timeAgo(user.last_sign_in_at)}`}
        </p>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 tabular-nums">
          {formatMoney(Number(user.total_spent) || 0)}
        </span>
        <span className="text-[9px] text-slate-400">
          {user.orders} {user.orders === 1 ? "compra" : "compras"}
        </span>
        {(user.loyalty_points ?? 0) > 0 && (
          <span
            className="mt-1 text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 flex items-center gap-0.5"
            title={`Puntos disponibles · Total ganado: ${user.lifetime_earned ?? 0}`}
          >
            🏆 {user.loyalty_points} pts
          </span>
        )}
        {user.phone && (
          <a
            href={`https://wa.me/${String(user.phone).replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 h-6 px-2 rounded-lg bg-emerald-500 text-white text-[9px] font-black flex items-center gap-1 press"
            title="WhatsApp"
          >
            <MessageCircle size={9} /> WA
          </a>
        )}
      </div>
    </li>
  )
}

function VisitorRow({ visitor }: { visitor: Visitor }) {
  const device = deviceFromUA(visitor.user_agent)
  const lastPath = visitor.pages_viewed?.[0]?.path ?? null
  const converted = !!visitor.converted_user_email
  return (
    <li className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800/60 p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        converted ? "bg-emerald-500" : "bg-slate-400"
      } text-white`}>
        <Eye size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 flex items-center gap-1">
            <Smartphone size={10} /> {device}
          </p>
          {converted && (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              Convertido → {visitor.converted_user_email}
            </span>
          )}
        </div>
        <p className="text-[10px] font-mono text-slate-400 truncate">
          {visitor.session_id}
        </p>
        {lastPath && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1">
            <ExternalLink size={9} /> {lastPath}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 tabular-nums">
          {visitor.total_visits}× visitas
        </span>
        <span className="text-[9px] text-slate-400">
          {timeAgo(visitor.last_seen_at)}
        </span>
      </div>
    </li>
  )
}

import { useEffect, useMemo, useState } from "react"
import { Toaster } from "react-hot-toast"
import { motion, AnimatePresence } from "framer-motion"
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom"

import {
  Sparkles,
  Calendar,
  Package,
  ShoppingCart,
  Bookmark,
  Tag,
  TrendingUp,
  Settings as SettingsIcon,
  LogOut,
  LogIn,
  ScanLine,
  BookmarkPlus,
  Zap,
  Plus,
  Command,
  Store,
  Receipt as ReceiptIcon,
  User as UserIcon,
} from "lucide-react"

import InventoryPage from "./features/inventory/InventoryPage"
import PricingPage from "./features/pricing/PricingPage"
import DashboardPage from "./features/dashboard/DashboardPage"
import SalesPage from "./features/sales/SalesPage"
import ApartadosPage from "./features/apartados/ApartadosPage"
import SettingsPage from "./features/settings/SettingsPage"
import LoginPage from "./features/auth/LoginPage"
import PublicTicketPage from "./features/public/PublicTicketPage"
import ClientShopPage from "./features/client/ClientShopPage"
import ClientOrdersPage from "./features/client/ClientOrdersPage"
import CyclesPage from "./features/cycles/CyclesPage"

import ThemeToggle from "./components/ui/ThemeToggle"
import CommandPalette from "./components/ui/CommandPalette"
import ActionHub, { type HubAction } from "./components/ui/ActionHub"
import NotificationBell from "./components/ui/NotificationBell"
import ConnectionBanner from "./components/ui/ConnectionBanner"
import UserProfileDrawer from "./components/ui/UserProfileDrawer"
import ReviewProofDrawer from "./components/ui/ReviewProofDrawer"
import WhatsAppSupportFab from "./components/ui/WhatsAppSupportFab"

import { useGlobalShortcuts } from "./lib/useGlobalShortcuts"
import { useTheme } from "./lib/useTheme"
import { useAuth, isStaffOrAdmin } from "./lib/useAuth"
import { useRealtimeNotifications } from "./lib/useRealtime"
import { useMyAvatar } from "./lib/useMyAvatar"

// ──────────────────────────────────────────────────────────────────
// Menús del shell admin/staff. Etiquetas más cortas y orientadas a acción.
// ──────────────────────────────────────────────────────────────────
type AdminSection =
  | "hoy"
  | "catalogo"
  | "caja"
  | "pendientes"
  | "ciclos"
  | "calculadora"
  | "ajustes"

const ADMIN_MENU: {
  id: AdminSection
  label: string
  icon: typeof Calendar
  adminOnly?: boolean
}[] = [
  { id: "hoy", label: "Hoy", icon: Calendar },
  { id: "catalogo", label: "Catálogo", icon: Package },
  { id: "caja", label: "Caja", icon: ShoppingCart },
  { id: "pendientes", label: "Pendientes", icon: Bookmark },
  { id: "ciclos", label: "Ciclos", icon: TrendingUp, adminOnly: true },
  { id: "calculadora", label: "Calculadora", icon: Tag, adminOnly: true },
]

/* ============================================================== */
/* ROOT                                                            */
/* ============================================================== */
export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: "1rem",
            fontWeight: 700,
            fontSize: "12px",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
          },
        }}
      />
      <ThemeMount />
      <ConnectionBanner />
      <Routes>
        {/* Públicas (sin login) */}
        <Route path="/ticket/:token" element={<PublicTicketPage />} />
        <Route path="/login" element={<LoginRoute />} />

        {/* Admin / staff */}
        <Route path="/admin/*" element={<AdminGate />} />

        {/* Por defecto: tienda (cliente o anónimo). Sin login. */}
        <Route path="/*" element={<ShopShell />} />
      </Routes>
    </BrowserRouter>
  )
}

/** Pequeño wrapper para inicializar el tema (solo monta el hook). */
function ThemeMount() {
  useTheme()
  return null
}

/* ============================================================== */
/* LOGIN                                                           */
/* ============================================================== */
function LoginRoute() {
  const { loading, session, role } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenSpinner />
  if (session) {
    const target = isStaffOrAdmin(role) ? "/admin" : "/"
    const from = (location.state as any)?.from ?? target
    return <Navigate to={from} replace />
  }
  return <LoginPage />
}

/* ============================================================== */
/* ADMIN GATE  — protege /admin/*                                   */
/* ============================================================== */
function AdminGate() {
  const { loading, session, role } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!session) {
    return <Navigate to="/login" replace state={{ from: "/admin" }} />
  }
  if (!isStaffOrAdmin(role)) {
    return <Navigate to="/" replace />
  }
  return <AdminShell />
}

function FullScreenSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full"
      />
    </div>
  )
}

/* ============================================================== */
/* ADMIN SHELL (rail desktop + dock móvil)                          */
/* ============================================================== */
function AdminShell() {
  const [section, setSection] = useState<AdminSection>("hoy")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hubOpen, setHubOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [proofId, setProofId] = useState<string | null>(null)
  const [apartadoBadge, setApartadoBadge] = useState(0)
  const { role, signOut, fullName, email } = useAuth()
  const avatarUrl = useMyAvatar()
  const isAdmin = role === "admin"

  // Listener global para abrir el drawer de comprobante desde notificaciones
  // y desde el deep link ?proof=xxx
  useEffect(() => {
    const onOpenProof = (e: any) => {
      const id = e?.detail?.proofId
      if (id) setProofId(id)
    }
    window.addEventListener("mari:open-proof", onOpenProof)
    const onOpenProfile = () => setProfileOpen(true)
    window.addEventListener("mari:open-profile", onOpenProfile)
    // Lectura inicial de la URL ?proof=xxx (caso: click desde notif que cambia URL)
    const params = new URLSearchParams(window.location.search)
    const initial = params.get("proof")
    if (initial) setProofId(initial)
    return () => {
      window.removeEventListener("mari:open-proof", onOpenProof)
      window.removeEventListener("mari:open-profile", onOpenProfile)
    }
  }, [])

  useGlobalShortcuts()
  useRealtimeNotifications()

  const visibleMenu = useMemo(
    () => ADMIN_MENU.filter((m) => !m.adminOnly || isAdmin),
    [isAdmin]
  )

  useEffect(() => {
    if (!isAdmin && (section === "calculadora" || section === "ciclos")) setSection("caja")
  }, [isAdmin, section])

  useEffect(() => {
    const navHandler = (e: any) => {
      const t = e.detail?.tab as string
      const legacy: Record<string, AdminSection> = {
        dashboard: "hoy",
        inventario: "catalogo",
        ventas: "caja",
        apartados: "pendientes",
        precios: "calculadora",
        ciclos: "ciclos",
        settings: "ajustes",
      }
      const next = (legacy[t] ?? t) as AdminSection
      if (ADMIN_MENU.some((m) => m.id === next) || next === "ajustes") {
        setSection(next)
        if (next === "pendientes") setApartadoBadge(0)
      }
    }
    const kbdHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((p) => !p)
      }
    }
    const badgeHandler = () => setApartadoBadge((c) => c + 1)
    window.addEventListener("app:navigate", navHandler)
    window.addEventListener("keydown", kbdHandler)
    window.addEventListener("mari:apartado-new", badgeHandler)
    return () => {
      window.removeEventListener("app:navigate", navHandler)
      window.removeEventListener("keydown", kbdHandler)
      window.removeEventListener("mari:apartado-new", badgeHandler)
    }
  }, [])

  const hubActions: HubAction[] = [
    {
      id: "new-sale",
      label: "Venta rápida",
      caption: "Cobrar ahora",
      icon: Zap,
      accent: "linear-gradient(135deg,#e6007e,#a855f7)",
      onClick: () => setSection("caja"),
    },
    {
      id: "scan",
      label: "Escanear",
      caption: "Código de barras",
      icon: ScanLine,
      accent: "linear-gradient(135deg,#3b82f6,#06b6d4)",
      onClick: () => {
        setSection("caja")
        setTimeout(
          () => window.dispatchEvent(new CustomEvent("sales:open-scanner")),
          200
        )
      },
    },
    {
      id: "new-product",
      label: "Nuevo producto",
      caption: "Agregar al catálogo",
      icon: Plus,
      accent: "linear-gradient(135deg,#10b981,#34d399)",
      onClick: () => {
        setSection("catalogo")
        setTimeout(
          () => window.dispatchEvent(new CustomEvent("products:new")),
          200
        )
      },
    },
    {
      id: "apartado",
      label: "Cobrar abono",
      caption: "Registrar pago",
      icon: BookmarkPlus,
      accent: "linear-gradient(135deg,#f59e0b,#fb923c)",
      onClick: () => setSection("pendientes"),
    },
  ]

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row bg-white dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* ─── RAIL DESKTOP (vertical, 80px) ─── */}
      <aside className="hidden md:flex md:flex-col w-20 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-100 dark:border-slate-800 py-4">
        <div className="flex items-center justify-center mb-6">
          <Link
            to="/admin"
            onClick={() => setSection("hoy")}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-bloom"
            style={{
              background: "linear-gradient(135deg,#e6007e 0%, #a855f7 100%)",
            }}
            aria-label="Mari"
          >
            <Sparkles className="text-white" size={20} />
          </Link>
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-2">
          {visibleMenu.map((m) => {
            const Icon = m.icon
            const active = section === m.id
            const showBadge = m.id === "pendientes" && apartadoBadge > 0
            return (
              <button
                key={m.id}
                onClick={() => {
                  setSection(m.id)
                  if (m.id === "pendientes") setApartadoBadge(0)
                }}
                className={`group relative flex flex-col items-center gap-1 py-2.5 rounded-2xl transition-all ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
                title={m.label}
              >
                <div className="relative">
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  {showBadge && (
                    <motion.span
                      key={apartadoBadge}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center"
                    >
                      {apartadoBadge}
                    </motion.span>
                  )}
                </div>
                <span className="text-[9px] font-black uppercase tracking-tight">
                  {m.label}
                </span>
                {active && (
                  <motion.span
                    layoutId="rail-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-primary"
                  />
                )}
              </button>
            )
          })}
        </nav>

        <div className="flex flex-col items-center gap-2 px-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setSection("ajustes")}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
              section === "ajustes"
                ? "bg-primary/10 text-primary"
                : "bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
            title={fullName ?? email ?? "Ajustes"}
            aria-label="Ajustes"
          >
            <SettingsIcon size={18} />
          </button>
          <ThemeToggle />
          <button
            onClick={() => signOut()}
            className="w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* ─── COLUMNA PRINCIPAL ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header móvil */}
        <header className="md:hidden z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-4 py-2 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shadow-bloom shrink-0"
                style={{
                  background: "linear-gradient(135deg,#e6007e,#a855f7)",
                }}
              >
                <Sparkles className="text-white" size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[8px] uppercase tracking-widest text-slate-400 font-black leading-none">
                  Hola
                </p>
                <p className="text-xs font-black truncate">
                  {fullName?.split(" ")[0] ?? email?.split("@")[0] ?? "Mari"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPaletteOpen(true)}
                aria-label="Buscar / comandos"
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <Command size={14} />
              </button>
              <NotificationBell />
              <ThemeToggle />
              <button
                onClick={() => setProfileOpen(true)}
                aria-label="Mi perfil"
                className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon size={14} className="text-white" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Header desktop */}
        <header className="hidden md:flex z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-6 py-3 shrink-0 items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black leading-none mb-0.5">
              {role === "admin" ? "Administradora" : "Equipo Mari"}
            </p>
            <h1 className="text-xl font-black tracking-tight leading-none">
              Hola, {fullName?.split(" ")[0] ?? email?.split("@")[0] ?? "Mari"}{" "}
              <span className="text-primary">✨</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Command size={13} />
              <span>Buscar comandos...</span>
              <kbd className="text-[9px] font-black uppercase tracking-widest bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                ⌘K
              </kbd>
            </button>
            <NotificationBell />
            <button
              onClick={() => setProfileOpen(true)}
              aria-label="Mi perfil"
              className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-sm active:scale-90 transition-transform"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
              title={fullName ?? email ?? "Mi perfil"}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={16} className="text-white" />
              )}
            </button>
          </div>
        </header>

        {/* ─── CONTENIDO ─── */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-container-ios bg-slate-50/30 dark:bg-slate-950/50">
          <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="pb-24 md:pb-12"
              >
                {section === "hoy" && <DashboardPage />}
                {section === "catalogo" && <InventoryPage />}
                {section === "caja" && <SalesPage />}
                {section === "pendientes" && <ApartadosPage />}
                {section === "ciclos" && isAdmin && <CyclesPage />}
                {section === "calculadora" && isAdmin && <PricingPage />}
                {section === "ajustes" && <SettingsPage />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* ─── DOCK MÓVIL (delgado, pegado al borde) ─── */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800 shadow-[0_-8px_30px_-15px_rgba(230,0,126,0.25)]">
          <div className="relative h-12 flex items-center justify-around pb-safe">
            {visibleMenu.slice(0, 2).map((m) => (
              <DockButton
                key={m.id}
                active={section === m.id}
                onClick={() => {
                  setSection(m.id)
                  if (m.id === "pendientes") setApartadoBadge(0)
                }}
                icon={m.icon}
                label={m.label}
                badge={m.id === "pendientes" ? apartadoBadge : 0}
              />
            ))}

            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setHubOpen(true)}
              aria-label="Acciones rápidas"
              className="relative -mt-7 w-[52px] h-[52px] rounded-full text-white flex items-center justify-center shadow-[0_10px_30px_-8px_rgba(230,0,126,0.5)]"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            >
              <Plus size={22} strokeWidth={3} />
              <motion.span
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                className="absolute inset-0 rounded-full -z-10"
                style={{
                  background: "linear-gradient(135deg,#e6007e,#a855f7)",
                }}
              />
            </motion.button>

            {visibleMenu.slice(2, 4).map((m) => (
              <DockButton
                key={m.id}
                active={section === m.id}
                onClick={() => {
                  setSection(m.id)
                  if (m.id === "pendientes") setApartadoBadge(0)
                }}
                icon={m.icon}
                label={m.label}
                badge={m.id === "pendientes" ? apartadoBadge : 0}
              />
            ))}
          </div>
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ActionHub open={hubOpen} onClose={() => setHubOpen(false)} actions={hubActions} />
      <UserProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ReviewProofDrawer
        open={!!proofId}
        proofId={proofId}
        onClose={() => {
          setProofId(null)
          // Limpia ?proof= de la URL si está ahí
          if (typeof window !== "undefined") {
            const u = new URL(window.location.href)
            if (u.searchParams.has("proof")) {
              u.searchParams.delete("proof")
              window.history.replaceState({}, "", u.toString())
            }
          }
        }}
        onReviewed={() => {
          // Notifica a las tabs activas para refrescar listados
          window.dispatchEvent(new CustomEvent("mari:apartado-refresh"))
        }}
      />
    </div>
  )
}

function DockButton({
  active,
  onClick,
  icon: Icon,
  label,
  badge = 0,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 h-full relative active:scale-90 transition-all ${
        active ? "text-primary" : "text-slate-400 dark:text-slate-500"
      }`}
    >
      {active && (
        <motion.div
          layoutId="dock-active"
          className="absolute inset-x-2 inset-y-1 bg-primary/10 dark:bg-primary/15 rounded-2xl -z-10"
          transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
        />
      )}
      <div className="relative">
        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
        {badge > 0 && (
          <motion.span
            key={badge}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-1 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center"
          >
            {badge}
          </motion.span>
        )}
      </div>
      <span className="text-[9px] font-black uppercase tracking-tight mt-0.5">
        {label}
      </span>
    </button>
  )
}

/* ============================================================== */
/* SHOP SHELL (cliente + anónimo)                                   */
/* ============================================================== */

const SHOP_TABS = [
  { to: "/", label: "Tienda", icon: Store, requiresAuth: false },
  { to: "/mis-pedidos", label: "Mis pedidos", icon: ReceiptIcon, requiresAuth: true },
] as const

function ShopShell() {
  const { session, role, fullName, email } = useAuth()
  const avatarUrl = useMyAvatar()
  const isLogged = !!session
  const loc = useLocation()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)

  const showAdminLink = isLogged && isStaffOrAdmin(role)

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* HEADER */}
      <header className="z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-pink-50 dark:border-slate-800 px-4 py-2 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0 active:scale-95 transition-transform">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center shadow-bloom shrink-0"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            >
              <Sparkles className="text-white" size={16} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black tracking-tighter leading-none">
                Mari <span className="text-primary">Beauty</span>
              </h1>
              <p className="text-[8px] uppercase tracking-widest text-slate-400 leading-tight mt-0.5">
                {isLogged
                  ? `Hola, ${fullName?.split(" ")[0] ?? email?.split("@")[0]}`
                  : "Catálogo · sin compromiso"}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {isLogged && <NotificationBell />}
            <ThemeToggle />
            {showAdminLink && (
              <Link
                to="/admin"
                className="hidden sm:flex items-center gap-1 px-3 h-9 rounded-xl bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/15"
                title="Panel administrativo"
              >
                <SettingsIcon size={11} /> Panel
              </Link>
            )}
            {isLogged ? (
              <button
                onClick={() => setProfileOpen(true)}
                aria-label="Mi perfil"
                className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
                title={fullName ?? email ?? "Mi perfil"}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={14} className="text-white" />
                )}
              </button>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest shadow-bloom active:scale-95"
              >
                <LogIn size={11} /> Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-container-ios">
        <div className="max-w-3xl mx-auto px-4 py-4 pb-20">
          <Routes>
            <Route path="/" element={<ClientShopPage />} />
            <Route
              path="/mis-pedidos"
              element={
                isLogged ? (
                  <ClientOrdersPage />
                ) : (
                  <Navigate
                    to="/login"
                    replace
                    state={{ from: "/mis-pedidos" }}
                  />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      {/* DOCK CLIENTE (delgado, pegado al borde) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-pink-50 dark:border-slate-800 shadow-[0_-8px_30px_-15px_rgba(230,0,126,0.18)]">
        <div className="relative h-12 flex items-center justify-around max-w-md mx-auto pb-safe">
            {SHOP_TABS.map((t) => {
              const active = loc.pathname === t.to
              const Icon = t.icon
              const blocked = t.requiresAuth && !isLogged
              return (
                <Link
                  key={t.to}
                  to={blocked ? `/login` : t.to}
                  state={blocked ? { from: t.to } : undefined}
                  className={`flex flex-col items-center justify-center flex-1 h-full relative active:scale-90 transition-all ${
                    active ? "text-primary" : "text-slate-400"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="client-dock"
                      className="absolute inset-x-2 inset-y-1 bg-primary/10 rounded-2xl -z-10"
                    />
                  )}
                  <div className="relative">
                    <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                    {blocked && (
                      <span className="absolute -top-1 -right-2 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">
                    {t.label}
                  </span>
                </Link>
              )
            })}
            {showAdminLink && (
              <Link
                to="/admin"
                className="flex flex-col items-center justify-center flex-1 h-full text-primary active:scale-90"
                title="Ir al panel"
              >
                <UserIcon size={18} />
                <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">
                  Panel
                </span>
              </Link>
            )}
        </div>
      </nav>

      <UserProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* FAB de soporte WhatsApp (cliente / anon) */}
      <WhatsAppSupportFab bottomOffset={64} />
    </div>
  )
}

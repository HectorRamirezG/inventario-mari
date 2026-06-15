import { useEffect, useState } from "react"
import { Toaster } from "react-hot-toast"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import {
  BrowserRouter, Routes, Route, Navigate, Link, useLocation,
} from "react-router-dom"

import {
  LayoutDashboard,
  Package,
  Tag,
  ShoppingCart,
  Sparkles,
  Bookmark,
  Plus,
  Command,
  Settings as SettingsIcon,
  LogOut,
  Loader2,
  ScanLine,
  BookmarkPlus,
  Zap,
  Receipt as ReceiptIcon,
  Store,
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
import ThemeToggle from "./components/ui/ThemeToggle"
import CommandPalette from "./components/ui/CommandPalette"
import ActionHub, { type HubAction } from "./components/ui/ActionHub"
import { useGlobalShortcuts } from "./lib/useGlobalShortcuts"
import { useTheme } from "./lib/useTheme"
import { useAuth, isStaffOrAdmin } from "./lib/useAuth"

type Tab = "dashboard" | "inventario" | "ventas" | "apartados" | "precios" | "settings"

const TABS = [
  { id: "dashboard", label: "Inicio", icon: LayoutDashboard, adminOnly: false },
  { id: "inventario", label: "Stock", icon: Package, adminOnly: false },
  { id: "ventas", label: "Ventas", icon: ShoppingCart, adminOnly: false },
  { id: "apartados", label: "Apartados", icon: Bookmark, adminOnly: false },
  { id: "precios", label: "Precios", icon: Tag, adminOnly: true }, // sólo admin ve márgenes/costos
] as const

/**
 * Punto de entrada — define rutas públicas (/ticket/:token, /login) y
 * la app autenticada con bifurcación por rol (admin/staff vs client).
 */
export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: "1rem", fontWeight: "bold", fontSize: "12px" },
        }}
      />
      <Routes>
        <Route path="/ticket/:token" element={<PublicTicketPage />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/*" element={<AuthGate />} />
      </Routes>
    </BrowserRouter>
  )
}

/** Si ya hay sesión → manda a "/". Si no → muestra login. */
function LoginRoute() {
  const { loading, session } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (session) return <Navigate to="/" replace />
  return <LoginPage />
}

/** Bifurca según rol. */
function AuthGate() {
  const { loading, session, role } = useAuth()
  useTheme()
  if (loading) return <FullScreenSpinner />
  if (!session) return <Navigate to="/login" replace />
  if (isStaffOrAdmin(role)) return <AdminShell />
  return <ClientShell />
}

function FullScreenSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <Loader2 className="text-primary animate-spin" size={28} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ADMIN / STAFF SHELL (la app completa de siempre + ActionHub)        */
/* ------------------------------------------------------------------ */
function AdminShell() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hubOpen, setHubOpen] = useState(false)
  const { role, signOut, fullName } = useAuth()
  const isAdmin = role === "admin"
  // useTheme se llama para aplicar el tema al cargar
  useTheme()
  useGlobalShortcuts()

  // Filtra tabs según rol
  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin)

  // Si cajera intenta entrar a tab admin (por shortcut), la mandamos a ventas
  useEffect(() => {
    if (!isAdmin && tab === "precios") setTab("ventas")
  }, [isAdmin, tab])

  useEffect(() => {
    const navHandler = (e: any) => {
      const t = e.detail?.tab
      if (TABS.some(x => x.id === t)) setTab(t)
    }
    window.addEventListener("app:navigate", navHandler)

    // Cmd/Ctrl+K abre la paleta
    const kbdHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen(p => !p)
      }
    }
    window.addEventListener("keydown", kbdHandler)

    return () => {
      window.removeEventListener("app:navigate", navHandler)
      window.removeEventListener("keydown", kbdHandler)
    }
  }, [])

  // Construye las acciones del Action Hub central
  const hubActions: HubAction[] = [
    {
      id: "new-sale",
      label: "Venta rápida",
      caption: "Cobrar ahora",
      icon: Zap,
      accent: "linear-gradient(135deg,#e6007e,#a855f7)",
      onClick: () => setTab("ventas"),
    },
    {
      id: "scan",
      label: "Escanear",
      caption: "Código de barras",
      icon: ScanLine,
      accent: "linear-gradient(135deg,#3b82f6,#06b6d4)",
      onClick: () => {
        setTab("ventas")
        // dispara apertura del scanner desde SalesPage
        setTimeout(() => window.dispatchEvent(new CustomEvent("sales:open-scanner")), 200)
      },
    },
    {
      id: "new-product",
      label: "Nuevo producto",
      caption: "Agregar al inventario",
      icon: Plus,
      accent: "linear-gradient(135deg,#10b981,#34d399)",
      onClick: () => {
        setTab("inventario")
        setTimeout(() => window.dispatchEvent(new CustomEvent("products:new")), 200)
      },
    },
    {
      id: "apartado",
      label: "Apartado",
      caption: "Registrar abono",
      icon: BookmarkPlus,
      accent: "linear-gradient(135deg,#f59e0b,#fb923c)",
      onClick: () => setTab("apartados"),
    },
  ]

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
      {/* HEADER */}
      <header className="z-50 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl border-b border-pink-50 dark:border-slate-800 px-4 py-2 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 shrink-0"
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shadow-bloom"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            >
              <Sparkles className="text-white" size={16} />
            </div>
            <h1 className="text-base font-black tracking-tighter italic">
              Mari <span className="text-primary not-italic">Inv</span>
            </h1>
            {role && (
              <span
                className={`hidden sm:inline-flex ml-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                  isAdmin
                    ? "bg-primary/10 text-primary"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {role}
              </span>
            )}
          </motion.div>

          {/* NAV HORIZONTAL EN DESKTOP */}
          <nav className="hidden md:flex flex-1 justify-center">
            <LayoutGroup id="desktop-nav">
              <div className="flex bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-full p-1">
                {visibleTabs.map(t => {
                  const active = tab === t.id
                  const Icon = t.icon
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`relative px-4 py-1.5 rounded-full flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tight transition-colors ${
                        active ? "text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="desktop-pill"
                          className="absolute inset-0 rounded-full shadow-bloom"
                          style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                        />
                      )}
                      <Icon size={12} className="relative z-10" />
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </LayoutGroup>
          </nav>

          {/* Acciones derecha (siempre visibles, móvil + desktop) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Paleta de comandos"
              className="hidden md:inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 transition-colors"
              title="Comandos (⌘K)"
            >
              <Command size={13} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                K
              </span>
            </button>

            {/* Móvil: ícono compacto */}
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Paleta de comandos"
              className="md:hidden w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
            >
              <Command size={14} />
            </button>

            <button
              onClick={() => setTab("settings")}
              aria-label="Configuración"
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                tab === "settings"
                  ? "bg-primary/10 text-primary"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
              }`}
              title={fullName ?? "Configuración"}
            >
              <SettingsIcon size={14} />
            </button>

            <ThemeToggle />

            <button
              onClick={() => signOut()}
              aria-label="Cerrar sesión"
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              title="Cerrar sesión"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="flex-1 overflow-y-auto scroll-container-ios bg-slate-50/30 dark:bg-slate-950/30">
        <div className="w-full max-w-7xl mx-auto px-4 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="pb-28"
            >
              {tab === "dashboard" && <DashboardPage />}
              {tab === "inventario" && <InventoryPage />}
              {tab === "ventas" && <SalesPage />}
              {tab === "apartados" && <ApartadosPage />}
              {tab === "precios" && isAdmin && <PricingPage />}
              {tab === "settings" && <SettingsPage />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* DOCK MÓVIL con Action Hub central */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-safe">
        <div className="relative mx-3 mb-3 h-16 rounded-3xl bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border border-white/40 dark:border-slate-700/50 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.2)] flex items-center justify-around">
          <LayoutGroup id="mobile-dock">
            {/* Mitad izquierda: 2 tabs */}
            {visibleTabs.slice(0, 2).map((t) => (
              <DockButton
                key={t.id}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
                icon={t.icon}
                label={t.label}
              />
            ))}

            {/* CENTRO: Action Hub */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setHubOpen(true)}
              aria-label="Acciones rápidas"
              className="relative -mt-7 w-16 h-16 rounded-full text-white flex items-center justify-center shadow-bloom"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            >
              <Plus size={26} strokeWidth={3} />
              <motion.span
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                className="absolute inset-0 rounded-full"
                style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
              />
            </motion.button>

            {/* Mitad derecha: 2 tabs (o 1 + precios admin) */}
            {visibleTabs.slice(2, 4).map((t) => (
              <DockButton
                key={t.id}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
                icon={t.icon}
                label={t.label}
              />
            ))}
          </LayoutGroup>
        </div>
      </nav>

      {/* COMMAND PALETTE */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* ACTION HUB */}
      <ActionHub open={hubOpen} onClose={() => setHubOpen(false)} actions={hubActions} />
    </div>
  )
}

function DockButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 h-full relative active:scale-90 transition-all ${
        active ? "text-primary" : "text-slate-400"
      }`}
    >
      {active && (
        <motion.div
          layoutId="active-pill"
          className="absolute inset-x-2 inset-y-1 bg-primary/10 rounded-2xl -z-10"
        />
      )}
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">
        {label}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* CLIENT SHELL (cliente self-shopping)                                */
/* ------------------------------------------------------------------ */

const CLIENT_TABS = [
  { to: "/", label: "Tienda", icon: Store },
  { to: "/mis-pedidos", label: "Mis pedidos", icon: ReceiptIcon },
] as const

function ClientShell() {
  const { signOut, fullName } = useAuth()
  const loc = useLocation()

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
      <header className="z-50 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl border-b border-pink-50 dark:border-slate-800 px-4 py-2 shrink-0">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shadow-bloom"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            >
              <Sparkles className="text-white" size={16} />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter">
                Mari <span className="text-primary">Beauty</span>
              </h1>
              <p className="text-[8px] uppercase tracking-widest text-slate-400">
                Cliente · {fullName?.split(" ")[0]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => signOut()}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scroll-container-ios">
        <div className="max-w-md mx-auto px-4 py-4">
          <Routes>
            <Route path="/" element={<ClientShopPage />} />
            <Route path="/mis-pedidos" element={<ClientOrdersPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
        <div className="relative mx-3 mb-3 h-14 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-white/40 dark:border-slate-700/50 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.2)] flex items-center justify-around max-w-md mx-auto">
          {CLIENT_TABS.map((t) => {
            const active = loc.pathname === t.to
            const Icon = t.icon
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex flex-col items-center justify-center flex-1 h-full relative active:scale-90 transition-all ${
                  active ? "text-primary" : "text-slate-400"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">
                  {t.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

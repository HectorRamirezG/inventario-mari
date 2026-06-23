import { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react"
import { Toaster, toast } from "react-hot-toast"
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
  Package,
  Settings as SettingsIcon,
  LogOut,
  LogIn,
  ScanLine,
  BookmarkPlus,
  Plus,
  Command,
  Store,
  Receipt as ReceiptIcon,
  User as UserIcon,
  LifeBuoy,
  Heart,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Home,
} from "lucide-react"

import InventoryPage from "./features/inventory/InventoryPage"
import LoginPage from "./features/auth/LoginPage"
import PublicTicketPage from "./features/public/PublicTicketPage"
import PublicDeliveryNotePage from "./features/delivery/PublicDeliveryNotePage"
import ClientShopPage from "./features/client/ClientShopPage"

const ClientHomePage = lazy(() => import("./features/client/ClientHomePage"))
const PricingPage = lazy(() => import("./features/pricing/PricingPage"))
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"))
const SalesPage = lazy(() => import("./features/sales/SalesPage"))
const ApartadosPage = lazy(() => import("./features/apartados/ApartadosPage"))
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"))
const BusinessRulesPage = lazy(() => import("./features/settings/BusinessRulesPage"))
const UsersPage = lazy(() => import("./features/users/UsersPage"))
const ClientOrdersPage = lazy(() => import("./features/client/ClientOrdersPage"))
const MyReportsPage = lazy(() => import("./features/client/MyReportsPage"))
const MyWishesPage = lazy(() => import("./features/wishes/MyWishesPage"))
const WishAdminPage = lazy(() => import("./features/wishes/WishAdminPage"))
const StoriesAdminPage = lazy(() => import("./features/stories/StoriesAdminPage"))
const ReviewsAdminPage = lazy(() => import("./features/reviews/ReviewsAdminPage"))
const CyclesPage = lazy(() => import("./features/cycles/CyclesPage"))
const SupportPage = lazy(() => import("./features/support/SupportPage"))

import ThemeToggle from "./components/ui/ThemeToggle"
import CartHeaderButton from "./components/ui/CartHeaderButton"
import ClientSearchModal from "./components/ui/ClientSearchModal"
import CommandPalette from "./components/ui/CommandPalette"
import KeyboardHelpDialog from "./components/ui/KeyboardHelpDialog"
import ActionHub, { type HubAction } from "./components/ui/ActionHub"
import NotificationBell from "./components/ui/NotificationBell"
import ConnectionBanner from "./components/ui/ConnectionBanner"
import CriticalStockBanner from "./components/ui/CriticalStockBanner"
import UserProfileDrawer from "./components/ui/UserProfileDrawer"
import ReviewProofDrawer from "./components/ui/ReviewProofDrawer"
import WhatsAppSupportFab from "./components/ui/WhatsAppSupportFab"
import InstallPrompt from "./components/ui/InstallPrompt"
import ErrorBoundary from "./components/ui/ErrorBoundary"
import PwaUpdatePrompt from "./components/ui/PwaUpdatePrompt"
import PullToRefresh from "./components/ui/PullToRefresh"
import ScrollToTopButton from "./components/ui/ScrollToTopButton"
import SignOutOverlay from "./components/ui/SignOutOverlay"

import { useGlobalShortcuts } from "./lib/useGlobalShortcuts"
import { useTheme } from "./lib/useTheme"
import { useAuth, isStaffOrAdmin } from "./lib/useAuth"
import { useRealtimeNotifications } from "./lib/useRealtime"
import {
  runAdminChecks,
  runClientChecks,
} from "./features/notifications/notificationChecks"
import { registerPushSW } from "./lib/pushNative"
import { useMyAvatar } from "./lib/useMyAvatar"
import { useSidebarCounts } from "./lib/useSidebarCounts"
import { preloadBusinessRules, useBusinessRules } from "./features/settings/businessRulesService"
import { applyAccent, applyForceDark } from "./lib/applyTheme"
import { useVisitorTracking } from "./lib/useVisitorTracking"
import { applyMotionLevel } from "./lib/applyMotion"
import { useUserPrefs, isDarkScheduleNow } from "./lib/userPrefs"
import { prefetchSection } from "./lib/useNavPrefetch"

// ──────────────────────────────────────────────────────────────────
// Menús del shell admin/staff. Etiquetas más cortas y orientadas a acción.
// Las definiciones viven en `lib/adminNav.ts` (catálogo único compartido
// entre sidebar, dock, ActionHub y CommandPalette).
// ──────────────────────────────────────────────────────────────────
import {
  ADMIN_SECTIONS,
  sidebarSections,
  dockSections,
  visibleSections,
  type AdminSection,
  type AdminSectionEntry,
} from "./lib/adminNav"

/** Saludo segun la hora del dia. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Buen día"
  if (h < 19) return "Buenas tardes"
  return "Buenas noches"
}

const ADMIN_MENU = ADMIN_SECTIONS // alias para retrocompat de search/dispatcher

/* ============================================================== */
/* ROOT                                                            */
/* ============================================================== */
export default function App() {
  return (
    <ErrorBoundary scope="app:root">
      <BrowserRouter>
        <Toaster
          position="top-center"
          gutter={10}
          toastOptions={{
            duration: 3200,
            style: {
              borderRadius: "1.25rem",
              fontWeight: 700,
              fontSize: "12.5px",
              color: "#0f172a",
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              padding: "10px 16px",
              boxShadow:
                "0 20px 50px -15px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.05)",
              maxWidth: "380px",
            },
            success: {
              iconTheme: { primary: "#10b981", secondary: "#ecfdf5" },
              style: {
                borderLeft: "4px solid #10b981",
                paddingLeft: "12px",
              },
            },
            error: {
              iconTheme: { primary: "#ef4444", secondary: "#fef2f2" },
              style: {
                borderLeft: "4px solid #ef4444",
                paddingLeft: "12px",
              },
            },
            loading: {
              iconTheme: { primary: "#e6007e", secondary: "#fff0f7" },
              style: {
                borderLeft: "4px solid #e6007e",
                paddingLeft: "12px",
              },
            },
          }}
        />
        <ThemeMount />
        <ConnectionBanner />
        <InstallPrompt />
        <PwaUpdatePrompt />
        <KeyboardHelpMount />
        <VisitorTrackingMount />
        <ScrollToTopButton />
        <SignOutOverlay />
        <Routes>
          {/* Públicas (sin login) */}
          <Route path="/ticket/:token" element={<PublicTicketPage />} />
          <Route path="/comanda/:token" element={<PublicDeliveryNotePage />} />
          <Route path="/login" element={<LoginRoute />} />

          {/* Admin / staff */}
          <Route path="/admin/*" element={<AdminGate />} />

          {/* Por defecto: tienda (cliente o anónimo). Sin login. */}
          <Route path="/*" element={<ShopShell />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

/** Pequeño wrapper para inicializar el tema (solo monta el hook). */
function ThemeMount() {
  useTheme()
  const rules = useBusinessRules()
  const { prefs } = useUserPrefs()
  useEffect(() => {
    // Pre-carga las políticas de negocio en caché para que los services
    // síncronos (getBusinessRules) las tengan disponibles al instante.
    preloadBusinessRules().catch(() => {})
  }, [])
  // Aplica accent color + force dark cada vez que las reglas cambian.
  // Estos efectos viven aquí porque deben correr ANTES de que cualquier
  // componente decida su estilo (CSS vars son globales en :root).
  useEffect(() => {
    applyAccent(rules.theme_accent)
  }, [rules.theme_accent])
  useEffect(() => {
    applyForceDark(rules.force_dark_mode)
  }, [rules.force_dark_mode])
  // Intensidad de animación — atributo data-motion en <html>.
  useEffect(() => {
    applyMotionLevel(prefs.motion)
  }, [prefs.motion])
  // Dark schedule: cada minuto evalúa si toca dark según horario.
  // El force_dark_mode del admin sigue ganando por encima de esto.
  useEffect(() => {
    if (!prefs.darkSchedule) return
    const check = () => {
      if (rules.force_dark_mode) return // admin manda
      const shouldDark = isDarkScheduleNow(prefs)
      const root = document.documentElement
      if (shouldDark && root.dataset.theme !== "dark") {
        root.dataset.theme = "dark"
        root.style.colorScheme = "dark"
      } else if (!shouldDark && root.dataset.themeForced !== "1") {
        // Restaura preferencia individual leyendo localStorage
        const saved = localStorage.getItem("mari-theme") ?? "system"
        const effective =
          saved === "dark" || saved === "light"
            ? saved
            : window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light"
        root.dataset.theme = effective
        root.style.colorScheme = effective
      }
    }
    check()
    const id = window.setInterval(check, 60_000)
    return () => window.clearInterval(id)
  }, [prefs.darkSchedule, prefs.darkStart, prefs.darkEnd, prefs, rules.force_dark_mode])
  return null
}

/** Cheatsheet único global con tecla `?` y evento `app:open-shortcuts`.
 *  Reemplaza al viejo ShortcutsCheatsheet duplicado. */
function KeyboardHelpMount() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const isTyping = () => {
      const t = document.activeElement as HTMLElement | null
      if (!t) return false
      return (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable
      )
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isTyping()) return
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener("app:open-shortcuts", onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("app:open-shortcuts", onOpen)
    }
  }, [])
  return <KeyboardHelpDialog open={open} onClose={() => setOpen(false)} />
}

/** Trackea visita anónima/logueada en BD para que Mari vea quién entra.
 *  Best-effort: si la RPC no existe, silencia. */
function VisitorTrackingMount() {
  useVisitorTracking()
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
    <>
      {/* Barra de progreso superior estilo Linear/YouTube */}
      <motion.div
        initial={{ width: "0%", opacity: 0.9 }}
        animate={{ width: ["0%", "70%", "92%"] }}
        transition={{ duration: 2.4, ease: "easeOut", times: [0, 0.4, 1] }}
        className="fixed top-0 left-0 h-[3px] bg-gradient-to-r from-primary via-fuchsia-500 to-violet-500 z-[9999] rounded-r-full shadow-[0_0_12px_rgba(230,0,126,0.45)]"
      />
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full"
        />
      </div>
    </>
  )
}

/**
 * Loader liviano para Suspense de secciones internas (admin / cliente).
 * NO ocupa toda la pantalla — solo pinta una barra de progreso arriba
 * y mantiene el shell visible debajo. Evita el "flash blanco" que
 * causaba `FullScreenSpinner` entre cada cambio de sección.
 *
 * Se usa cuando ya estamos dentro del shell autenticado y solo cambia
 * el módulo (Dashboard → Caja → etc).
 */
function InlineSectionLoader() {
  return (
    <motion.div
      initial={{ width: "0%", opacity: 0.85 }}
      animate={{ width: ["0%", "65%", "88%"] }}
      transition={{ duration: 1.6, ease: "easeOut", times: [0, 0.4, 1] }}
      className="fixed top-0 left-0 h-[2px] bg-gradient-to-r from-primary via-fuchsia-500 to-violet-500 z-[9999] rounded-r-full shadow-[0_0_8px_rgba(230,0,126,0.35)]"
    />
  )
}

/* ============================================================== */
/* ADMIN SHELL (rail desktop + dock móvil)                          */
/* ============================================================== */
function AdminShell() {
  const [section, setSection] = useState<AdminSection>("hoy")
  // Para page transitions con direccion: ref con la seccion previa.
  const prevSectionRef = useRef<AdminSection>("hoy")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hubOpen, setHubOpen] = useState(false)
  // helpOpen state eliminado — el cheatsheet ahora es global vía
  // KeyboardHelpMount en el root. Los disparadores locales hacen
  // dispatch del evento "app:open-shortcuts".
  // Easter egg: contador de taps sobre el logo. A los 7, dispara confetti
  // + mensaje especial. Se resetea automáticamente al pasar 1.5s sin taps.
  const [logoTaps, setLogoTaps] = useState(0)
  const logoTapResetRef = useRef<number | null>(null)
  const { prefs: userPrefs, set: setUserPref } = useUserPrefs()
  const [profileOpen, setProfileOpen] = useState(false)
  const [proofId, setProofId] = useState<string | null>(null)
  const [apartadoBadge, setApartadoBadge] = useState(0)
  // Sidebar desktop: modo compacto (icon-only 80px) o expandido (label 232px).
  // Persiste en localStorage para respetar la preferencia entre sesiones.
  // Atajo "[" toggle (ver useGlobalShortcuts más abajo).
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("admin_sidebar_expanded") === "1"
  })
  useEffect(() => {
    try {
      localStorage.setItem(
        "admin_sidebar_expanded",
        sidebarExpanded ? "1" : "0",
      )
    } catch {
      /* storage bloqueado en modo privado: degradar a sesión actual */
    }
  }, [sidebarExpanded])
  const { role, signOut, fullName, email, session } = useAuth()
  const avatarUrl = useMyAvatar()
  // Contadores globales para badges del sidebar (apartados/soporte/wishes/reviews).
  // Se refresca al cambiar tabs y cuando algún módulo dispara eventos broadcast.
  const sidebarCounts = useSidebarCounts()
  const rules = useBusinessRules()
  const isAdmin = role === "admin"

  // Calculamos la direccion del slide ANTES de actualizar el ref.
  // Si vamos "adelante" en el menu (de Catalogo a Pendientes p.ej) => +1
  // Si vamos "atras" => -1
  const sectionOrder = ADMIN_MENU.map((m) => m.id) as AdminSection[]
  const prevIdx = sectionOrder.indexOf(prevSectionRef.current)
  const curIdx = sectionOrder.indexOf(section)
  const slideDir = curIdx >= prevIdx ? 1 : -1
  // Actualizamos el ref para el proximo render
  useEffect(() => {
    prevSectionRef.current = section
  }, [section])

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

  // Alertas at-load: comprobantes sin revisar, apartados sin movimiento,
  // stock bajo, comandas no abiertas, meta del día, etc. Se evalúan al
  // cargar y al cambiar de rol/sesión. Usan checkpoints en localStorage
  // para no spammear.
  //
  // Lo lanzamos en `requestIdleCallback` para que NO compita con la
  // interacción inicial (TTI). Si el browser no lo soporta, fallback a
  // setTimeout 1.5s.
  useEffect(() => {
    if (!session) return
    // Asegura que el service worker esté listo para push del SO
    registerPushSW().catch(() => {})

    const runChecks = () => {
      if (isAdmin) {
        runAdminChecks()
      } else if (email) {
        runClientChecks(email)
      }
    }

    let cancelId: number | undefined
    const ric: any =
      typeof window !== "undefined" && (window as any).requestIdleCallback
    if (ric) {
      cancelId = ric(runChecks, { timeout: 3000 })
      return () => {
        const cic: any =
          typeof window !== "undefined" && (window as any).cancelIdleCallback
        if (cancelId != null && cic) cic(cancelId)
      }
    } else {
      const t = setTimeout(runChecks, 1500)
      return () => clearTimeout(t)
    }
  }, [session, isAdmin, email])

  const visibleMenu = useMemo(
    () => sidebarSections(rules, isAdmin),
    [rules, isAdmin]
  )
  // Ref espejo para que los listeners globales (bindeados una sola vez)
  // siempre vean el visibleMenu más reciente sin re-bindearse.
  const visibleMenuRef = useRef(visibleMenu)
  useEffect(() => {
    visibleMenuRef.current = visibleMenu
  }, [visibleMenu])

  const dockMenu = useMemo(
    () => dockSections(rules, isAdmin),
    [rules, isAdmin]
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
        soporte: "soporte",
        incidencias: "soporte",
        sugerencias: "sugerencias",
        deseos: "sugerencias",
        wishes: "sugerencias",
        stories: "stories",
        historias: "stories",
        resenias: "resenias",
        reseñas: "resenias",
        reviews: "resenias",
        reglas: "reglas",
        settings: "ajustes",
      }
      const next = (legacy[t] ?? t) as AdminSection
      if (ADMIN_SECTIONS.some((m) => m.id === next)) {
        setSection(next)
        if (next === "pendientes") setApartadoBadge(0)
      }
    }
    const kbdHandler = (e: KeyboardEvent) => {
      // Helper para gatear si el usuario está escribiendo (input/textarea/CE).
      const isTyping = () => {
        const tag = (e.target as HTMLElement | null)?.tagName
        const editable = (e.target as HTMLElement | null)?.isContentEditable
        return tag === "INPUT" || tag === "TEXTAREA" || !!editable
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((p) => !p)
      }
      // "[" colapsa/expande el sidebar desktop (ignora si estás escribiendo)
      if (e.key === "[" && !(e.metaKey || e.ctrlKey || e.altKey)) {
        if (isTyping()) return
        e.preventDefault()
        setSidebarExpanded((v) => !v)
      }
      // "?" abre la hoja de atajos (siempre y cuando no estés escribiendo).
      // El cheatsheet vive globalmente en KeyboardHelpMount; aquí solo
      // disparamos el evento para evitar dos listeners superpuestos.
      if (e.key === "?" && !(e.metaKey || e.ctrlKey || e.altKey)) {
        if (isTyping()) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("app:open-shortcuts"))
      }
      // "n" abre el ActionHub (nuevo / quick add) — gmail-style
      if (
        e.key.toLowerCase() === "n" &&
        !(e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
      ) {
        if (isTyping()) return
        e.preventDefault()
        setHubOpen((v) => !v)
      }
      // "g" + tecla → goto sección (gmail-style). "g h" = Hoy, etc.
      // Detectamos el "g" inicial y dejamos un timeout corto para el
      // siguiente tecleo. Si en 1.2s no llega nada o llega tecla inválida,
      // se cancela.
      if (
        e.key.toLowerCase() === "g" &&
        !(e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
      ) {
        if (isTyping()) return
        e.preventDefault()
        // Guardamos un flag temporal en window para el siguiente keydown.
        ;(window as any).__mariGotoArmed = true
        setTimeout(() => {
          ;(window as any).__mariGotoArmed = false
        }, 1200)
        return
      }
      if (
        (window as any).__mariGotoArmed === true &&
        !(e.metaKey || e.ctrlKey || e.altKey)
      ) {
        if (isTyping()) {
          ;(window as any).__mariGotoArmed = false
          return
        }
        const map: Record<string, AdminSection> = {
          h: "hoy",
          c: "caja",
          p: "pendientes",
          i: "catalogo", // i de "inventario"
          s: "soporte",
          w: "sugerencias", // w de "wishes"
          r: "resenias",
          y: "ciclos", // y de "cycles"
          u: "usuarios", // u de "usuarios"
          a: "ajustes",
        }
        const target = map[e.key.toLowerCase()]
        ;(window as any).__mariGotoArmed = false
        if (target && visibleMenuRef.current.some((m) => m.id === target)) {
          e.preventDefault()
          setSection(target)
          if (target === "pendientes") setApartadoBadge(0)
          return
        }
      }
      // Atajos numéricos 1..9 → saltar a sección N del sidebar.
      // Solo si NO se está escribiendo y sin modificadores (evita romper ⌘1 nativos).
      if (
        /^[1-9]$/.test(e.key) &&
        !(e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
      ) {
        if (isTyping()) return
        const idx = Number(e.key) - 1
        const target = visibleMenuRef.current[idx]
        if (target) {
          e.preventDefault()
          setSection(target.id)
          if (target.id === "pendientes") setApartadoBadge(0)
        }
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

  // ─── ActionHub (+) ───
  // Combina ACCIONES RÁPIDAS (escanear, nuevo producto, nueva variante)
  // con TODAS las secciones del catálogo (filtradas por reglas + rol).
  // Una sola fuente de verdad = consistente con sidebar/dock/palette.
  const hubActions: HubAction[] = useMemo(() => {
    const quickActions: HubAction[] = [
      {
        id: "scan",
        label: "Escanear",
        caption: "Código de barras al carrito",
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
        id: "new-variant",
        label: "Nueva variante",
        caption: "Elige un producto del catálogo",
        icon: Package,
        accent: "linear-gradient(135deg,#8b5cf6,#ec4899)",
        onClick: () => {
          setSection("catalogo")
          setTimeout(
            () =>
              window.dispatchEvent(
                new CustomEvent("products:pick-for-variant")
              ),
            200
          )
        },
      },
      {
        id: "apartado",
        label: "Cobrar abono",
        caption: "Registrar pago de un apartado",
        icon: BookmarkPlus,
        accent: "linear-gradient(135deg,#f59e0b,#fb923c)",
        onClick: () => setSection("pendientes"),
      },
    ]

    // Todas las secciones disponibles como tarjetas en el hub.
    const sectionActions: HubAction[] = visibleSections(rules, isAdmin).map(
      (s) => ({
        id: s.id,
        label: s.label,
        caption: s.caption,
        icon: s.icon,
        accent: s.accent,
        onClick: () => {
          setSection(s.id)
          if (s.id === "pendientes") setApartadoBadge(0)
        },
      })
    )

    return [...quickActions, ...sectionActions]
  }, [rules, isAdmin])

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row bg-white dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* ─── RAIL DESKTOP (vertical: 80px compacto / 232px expandido) ───
          - Scrollable cuando el menú excede la altura disponible
          - Toggle con botón + atajo "["
          - Agrupa pinned (principales) y resto bajo divider sutil
          - Tooltips ricos al hover en modo compacto */}
      <aside
        className={`hidden md:flex md:flex-col shrink-0 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-r border-slate-100 dark:border-slate-800 transition-[width] duration-200 ease-out ${
          sidebarExpanded ? "w-[232px]" : "w-20"
        }`}
      >
        {/* Header del rail: logo + toggle. NO scrollea. */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-4">
          <Link
            to="/admin"
            onClick={(e) => {
              // Easter egg: 7 taps en el logo = confetti + mensaje sorpresa.
              // No bloqueamos navegación; solo contamos el evento.
              setLogoTaps((prev) => {
                const next = prev + 1
                if (logoTapResetRef.current) {
                  window.clearTimeout(logoTapResetRef.current)
                }
                logoTapResetRef.current = window.setTimeout(
                  () => setLogoTaps(0),
                  1500,
                )
                if (next === 7) {
                  e.preventDefault()
                  // Carga lazy para no bloquear el render normal
                  import("./lib/confetti").then(({ fireConfetti }) =>
                    fireConfetti({ count: 140, duration: 2600 }),
                  )
                  toast.success("¡Mari eres una crack! 💖✨", { duration: 4000 })
                  return 0
                }
                return next
              })
              if (logoTaps + 1 < 7) {
                setSection("hoy")
              }
            }}
            className="bg-brand relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-bloom shrink-0"
            aria-label="Beauty's Me"
            title={`Beauty's Me${logoTaps > 0 ? ` (${logoTaps}/7)` : ""}`}
          >
            <Sparkles className="text-white" size={20} />
            {/* Mood emoji elegido por Mari (esquina superior derecha del logo).
                Solo se muestra si el emoji NO es vacío. */}
            {userPrefs.moodEmoji && (
              <span
                aria-hidden
                className="absolute -top-1.5 -right-1.5 text-base select-none pointer-events-none drop-shadow"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
              >
                {userPrefs.moodEmoji}
              </span>
            )}
          </Link>
          {sidebarExpanded && (
            <button
              type="button"
              onClick={() => {
                // En expandido permite cambiar el mood cíclicamente
                const moods = ["✨", "😎", "🔥", "💪", "🌸", "🌙", "🎀", "💖", "☀️"]
                const i = moods.indexOf(userPrefs.moodEmoji)
                const next = moods[(i + 1) % moods.length]
                setUserPref("moodEmoji", next)
              }}
              className="min-w-0 flex-1 text-left press"
              title="Cambiar mood"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">
                Beauty's
              </p>
              <p className="text-sm font-black italic text-slate-900 dark:text-slate-100 leading-tight flex items-center gap-1.5">
                Me Admin <span className="text-base">{userPrefs.moodEmoji}</span>
              </p>
            </button>
          )}
          <button
            onClick={() => setSidebarExpanded((v) => !v)}
            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center shrink-0 press"
            aria-label={sidebarExpanded ? "Colapsar menú" : "Expandir menú"}
            title={`${sidebarExpanded ? "Colapsar" : "Expandir"} ( [ )`}
          >
            {sidebarExpanded ? (
              <ChevronsLeft size={14} />
            ) : (
              <ChevronsRight size={14} />
            )}
          </button>
        </div>

        {/* Quick action: buscar / Command Palette.
            En compacto solo el icono; en expandido pinta hint del shortcut. */}
        <button
          onClick={() => setPaletteOpen(true)}
          className={`mx-2 mb-2 shrink-0 flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors press ${
            sidebarExpanded ? "px-3 py-2 justify-start" : "h-10 justify-center"
          }`}
          title="Buscar (⌘K)"
        >
          <Search size={14} className="shrink-0" />
          {sidebarExpanded && (
            <>
              <span className="text-[11px] font-bold flex-1 text-left">
                Buscar
              </span>
              <kbd className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                ⌘K
              </kbd>
            </>
          )}
        </button>

        {/* Nav scrollable */}
        <nav
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2 custom-scrollbar"
          aria-label="Navegación principal"
        >
          {(() => {
            const pinned = visibleMenu.filter((m) => m.pin)
            const extra = visibleMenu.filter((m) => !m.pin)
            const renderItem = (m: AdminSectionEntry, idx: number) => {
              const Icon = m.icon
              const active = section === m.id
              // Badge dinámico por sección. `pendientes` combina el contador
              // del realtime in-memory (apartadoBadge — alerta de venta nueva
              // disparada por broadcast) con el conteo de pendientes globales.
              // El resto leen del hook centralizado useSidebarCounts.
              const liveCount = (() => {
                if (m.id === "pendientes") {
                  return Math.max(apartadoBadge, sidebarCounts.pendientes)
                }
                if (m.id === "soporte") return sidebarCounts.soporte
                if (m.id === "sugerencias") return sidebarCounts.sugerencias
                if (m.id === "resenias") return sidebarCounts.resenias
                if (m.id === "catalogo") return sidebarCounts.catalogo
                return 0
              })()
              const showBadge = liveCount > 0
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setSection(m.id)
                    if (m.id === "pendientes") setApartadoBadge(0)
                  }}
                  onMouseEnter={() => prefetchSection(m.id)}
                  onTouchStart={() => prefetchSection(m.id)}
                  onFocus={() => prefetchSection(m.id)}
                  className={`group relative w-full flex items-center rounded-2xl transition-all ${
                    sidebarExpanded
                      ? "px-3 py-2.5 gap-3"
                      : "flex-col gap-1 py-2.5 justify-center"
                  } ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                  title={sidebarExpanded ? "" : m.label}
                  aria-current={active ? "page" : undefined}
                >
                  <div className="relative shrink-0">
                    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                    {showBadge && (
                      <motion.span
                        key={liveCount}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center"
                      >
                        {liveCount > 99 ? "99+" : liveCount}
                      </motion.span>
                    )}
                  </div>
                  {sidebarExpanded ? (
                    <>
                      <span className="text-xs font-bold flex-1 text-left truncate">
                        {m.label}
                      </span>
                      {/* En modo expandido: si tiene badge muestra el conteo
                          a la derecha de forma sutil; si no, atajo numérico. */}
                      {showBadge ? (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300 tabular-nums">
                          {liveCount > 99 ? "99+" : liveCount}
                        </span>
                      ) : (
                        idx < 9 && (
                          <kbd className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-primary">
                            {idx + 1}
                          </kbd>
                        )
                      )}
                    </>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-tight text-center leading-tight">
                      {m.label}
                    </span>
                  )}
                  {active && (
                    <motion.span
                      layoutId="rail-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-primary"
                    />
                  )}
                </button>
              )
            }
            return (
              <div className="flex flex-col gap-1">
                {pinned.map((m, i) => renderItem(m, i))}
                {extra.length > 0 && (
                  <>
                    <div
                      className={`my-2 ${
                        sidebarExpanded ? "px-3" : "px-2"
                      } flex items-center gap-2`}
                    >
                      {sidebarExpanded && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                          Más
                        </span>
                      )}
                      <hr className="flex-1 border-slate-200/70 dark:border-slate-700/70" />
                    </div>
                    {extra.map((m, i) =>
                      renderItem(m, pinned.length + i),
                    )}
                  </>
                )}
              </div>
            )
          })()}
        </nav>

        {/* Footer: ajustes + tema + logout. NO scrollea. */}
        <div
          className={`shrink-0 border-t border-slate-100 dark:border-slate-800 px-2 py-2 ${
            sidebarExpanded ? "flex flex-col gap-1" : "flex flex-col items-center gap-2"
          }`}
        >
          {/* Pill de usuario actual SOLO en modo expandido. Ahorra cognitive
              load — el admin sabe siempre con qué cuenta está logueado. */}
          {sidebarExpanded && (fullName || email) && (
            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left press"
              title="Mi perfil"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserIcon size={14} className="text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-tight truncate">
                  {fullName ?? "Mi cuenta"}
                </p>
                <p className="text-[9px] font-bold text-slate-400 leading-tight truncate">
                  {role === "admin" ? "Admin" : "Staff"} · {email}
                </p>
              </div>
            </button>
          )}
          <button
            onClick={() => setSection("ajustes")}
            className={`flex items-center rounded-2xl transition-colors ${
              sidebarExpanded
                ? "px-3 py-2 gap-3 w-full"
                : "w-12 h-12 justify-center"
            } ${
              section === "ajustes"
                ? "bg-primary/10 text-primary"
                : "bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
            title={fullName ?? email ?? "Ajustes"}
            aria-label="Ajustes"
          >
            <SettingsIcon size={18} className="shrink-0" />
            {sidebarExpanded && (
              <span className="text-xs font-bold flex-1 text-left truncate">
                Ajustes
              </span>
            )}
          </button>
          <div
            className={`flex ${
              sidebarExpanded ? "items-center gap-1" : "flex-col items-center gap-2"
            }`}
          >
            <ThemeToggle />
            <button
              onClick={() => signOut()}
              className={`flex items-center rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 transition-colors ${
                sidebarExpanded
                  ? "px-3 py-2 gap-3 flex-1"
                  : "w-12 h-12 justify-center"
              }`}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={18} className="shrink-0" />
              {sidebarExpanded && (
                <span className="text-xs font-bold truncate">Salir</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* ─── COLUMNA PRINCIPAL ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header móvil */}
        <header className="md:hidden z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-4 py-2 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <motion.div
                whileHover={{ rotate: [0, -10, 10, -10, 0], scale: 1.05 }}
                transition={{ duration: 0.6 }}
                className="bg-brand w-8 h-8 rounded-xl flex items-center justify-center shadow-bloom shrink-0"
              >
                <Sparkles className="text-white" size={14} />
              </motion.div>
              <div className="min-w-0">
                <p className="text-[8px] uppercase tracking-widest text-slate-400 dark:text-slate-500 font-black leading-none">
                  {greeting()}
                </p>
                <p className="text-xs font-black truncate text-slate-900 dark:text-slate-100">
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
                className="bg-brand w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-sm active:scale-90 transition-transform"
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
          <div className="min-w-0">
            {/* Breadcrumb compacto: clicable a Hoy + sección actual.
                Reemplaza al label estático "Administradora" / "Equipo Mari"
                porque el rol ya lo ves en la pill del sidebar expandido. */}
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-black leading-none mb-0.5"
            >
              <button
                onClick={() => setSection("hoy")}
                className={`transition-colors ${
                  section === "hoy"
                    ? "text-primary"
                    : "text-slate-400 hover:text-primary"
                }`}
              >
                Inicio
              </button>
              {section !== "hoy" && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">›</span>
                  <span className="text-slate-700 dark:text-slate-300 truncate max-w-[280px]">
                    {visibleMenu.find((m) => m.id === section)?.label ??
                      (section === "ajustes" ? "Ajustes" : section)}
                  </span>
                </>
              )}
            </nav>
            <h1 className="text-xl font-black tracking-tight leading-none text-slate-900 dark:text-slate-100 truncate">
              {greeting()}, {fullName?.split(" ")[0] ?? email?.split("@")[0] ?? "Mari"}{" "}
              <motion.span
                animate={{ rotate: [0, 14, -8, 14, 0], scale: [1, 1.15, 1, 1.1, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
                className="inline-block text-primary"
              >
                ✨
              </motion.span>
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
            {/* Botón discreto a la hoja de atajos. También se abre con "?" */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("app:open-shortcuts"))}
              aria-label="Ver atajos de teclado"
              title="Atajos (?)"
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center press"
            >
              <span className="text-sm font-black">?</span>
            </button>
            <NotificationBell />
            <button
              onClick={() => setProfileOpen(true)}
              aria-label="Mi perfil"
              className="bg-brand w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-sm active:scale-90 transition-transform"
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

        {/* Banner sticky de stock crítico (solo admin/staff). Se renderiza
            entre header y contenido para que sea lo primero visible cuando
            hay productos en 0. Auto-oculta si no hay stock crítico. */}
        <CriticalStockBanner />

        {/* ─── CONTENIDO ───
            En móvil el dock fijo (h-12) + safe-area + FAB sobresale ~28px
            ocupa ~110-120px del viewport. El padding-bottom calculado
            garantiza que el último elemento siempre quede visible al
            scrollear, sin que lo tape el dock. */}
        <PullToRefresh
          onRefresh={() => {
            // Cada página decide qué hacer escuchando este evento.
            window.dispatchEvent(
              new CustomEvent("mari:pull-refresh", { detail: { section } }),
            )
            // También el evento legacy de apartados que ya usan varias vistas.
            window.dispatchEvent(new CustomEvent("mari:apartado-refresh"))
            return new Promise((r) => setTimeout(r, 600))
          }}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-container-ios bg-slate-50/30 dark:bg-slate-950/50 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0"
        >
          <div className="w-full max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6">
            {/* mode="popLayout" para que la nueva sección empiece a entrar
                en cuanto se monta, sin esperar a que la anterior termine de
                salir. Esto elimina el "flash blanco" que se veía al cambiar
                de módulo. La animación es minimal: solo fade + un pequeño
                desplazamiento de 8px en el eje X según la dirección. */}
            <AnimatePresence mode="popLayout" initial={false} custom={slideDir}>
              <motion.div
                key={section}
                custom={slideDir}
                initial={{ opacity: 0, x: slideDir * 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              >
                <ErrorBoundary scope={`admin:${section}`}>
                  <Suspense fallback={<InlineSectionLoader />}>
                    {section === "hoy" && <DashboardPage />}
                    {section === "catalogo" && <InventoryPage />}
                    {section === "caja" && <SalesPage />}
                    {section === "pendientes" && <ApartadosPage />}
                    {section === "soporte" && <SupportPage />}
                    {section === "sugerencias" && <WishAdminPage />}
                    {section === "stories" && <StoriesAdminPage />}
                    {section === "resenias" && <ReviewsAdminPage />}
                    {section === "ciclos" && isAdmin && <CyclesPage />}
                    {section === "calculadora" && isAdmin && <PricingPage />}
                    {section === "usuarios" && isAdmin && <UsersPage />}
                    {section === "reglas" && isAdmin && <BusinessRulesPage />}
                    {section === "ajustes" && <SettingsPage />}
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>
        </PullToRefresh>

        {/* ─── DOCK MÓVIL (delgado, pegado al borde) ─── */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-100 dark:border-slate-800 shadow-[0_-8px_30px_-15px_rgba(230,0,126,0.25)]">
          <div className="relative h-12 flex items-center justify-around pb-safe">
            {dockMenu.slice(0, 2).map((m) => (
              <DockButton
                key={m.id}
                active={section === m.id}
                onClick={() => {
                  setSection(m.id)
                  if (m.id === "pendientes") setApartadoBadge(0)
                }}
                onPrefetch={() => prefetchSection(m.id)}
                icon={m.icon}
                label={m.label}
                badge={m.id === "pendientes" ? apartadoBadge : 0}
              />
            ))}

            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setHubOpen(true)}
              aria-label="Acciones rápidas"
              className="bg-brand relative -mt-7 w-[52px] h-[52px] rounded-full text-white flex items-center justify-center shadow-[0_10px_30px_-8px_rgba(230,0,126,0.5)]"
            >
              <Plus size={22} strokeWidth={3} />
              <motion.span
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                className="bg-brand absolute inset-0 rounded-full -z-10"
              />
            </motion.button>

            {dockMenu.slice(2, 4).map((m) => (
              <DockButton
                key={m.id}
                active={section === m.id}
                onClick={() => {
                  setSection(m.id)
                  if (m.id === "pendientes") setApartadoBadge(0)
                }}
                onPrefetch={() => prefetchSection(m.id)}
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
  onPrefetch,
  icon: Icon,
  label,
  badge = 0,
}: {
  active: boolean
  onClick: () => void
  onPrefetch?: () => void
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onTouchStart={onPrefetch}
      onFocus={onPrefetch}
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
      <motion.div
        className="relative"
        animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
        {badge > 0 && (
          <motion.span
            key={badge}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 460, damping: 18 }}
            className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-1 rounded-full bg-rose-500 text-white text-[8px] font-black flex items-center justify-center shadow-sm"
          >
            {badge}
            {/* Halo pulse para llamar la atención */}
            <span className="absolute inset-0 rounded-full bg-rose-500 -z-10 animate-ping opacity-75" />
          </motion.span>
        )}
      </motion.div>
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
  { to: "/inicio", label: "Inicio", icon: Home, requiresAuth: false },
  { to: "/", label: "Tienda", icon: Store, requiresAuth: false },
  { to: "/mis-pedidos", label: "Pedidos", icon: ReceiptIcon, requiresAuth: true },
  { to: "/mis-deseos", label: "Deseos", icon: Heart, requiresAuth: true },
  { to: "/mis-reportes", label: "Soporte", icon: LifeBuoy, requiresAuth: true },
] as const

function ShopShell() {
  const { session, role, fullName, email } = useAuth()
  const avatarUrl = useMyAvatar()
  const isLogged = !!session
  const loc = useLocation()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const rules = useBusinessRules()

  // Atajo "/" para abrir el search (estilo GitHub / YouTube). NO interfiere
  // con escritura porque chequea isEditable target.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      e.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const showAdminLink = isLogged && isStaffOrAdmin(role)

  return (
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* HEADER */}
      <header className="z-50 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border-b border-pink-50 dark:border-slate-800 px-4 py-2 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 min-w-0 active:scale-95 transition-transform">
            <div className="bg-brand w-9 h-9 rounded-2xl flex items-center justify-center shadow-bloom shrink-0">
              <Sparkles className="text-white" size={16} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black tracking-tighter leading-none">
                <span className="text-primary">Beauty's Me</span>
              </h1>
              <p className="text-[8px] uppercase tracking-widest text-slate-400 leading-tight mt-0.5">
                {isLogged
                  ? `Hola, ${fullName?.split(" ")[0] ?? email?.split("@")[0]}`
                  : "Catálogo · sin compromiso"}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {/* Búsqueda universal — abre el modal con input y atajos */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar (/)"
              title="Buscar (/)"
              className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary flex items-center justify-center active:scale-95 transition-all"
            >
              <Search size={14} />
            </button>
            {/* Carrito persistente — visible desde cualquier página del shop
                en cuanto el cliente tenga items. Reemplaza al FAB flotante. */}
            <CartHeaderButton />
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
                className="bg-brand w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center shadow-sm active:scale-90 transition-transform"
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
      <PullToRefresh
        onRefresh={() => {
          window.dispatchEvent(new CustomEvent("mari:pull-refresh", { detail: { section: "shop" } }))
          return new Promise((r) => setTimeout(r, 600))
        }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-container-ios pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        <div className="max-w-3xl mx-auto px-4 py-4">
          <ErrorBoundary scope="shop">
            <Suspense fallback={<InlineSectionLoader />}>
              <Routes>
                <Route path="/" element={<ClientShopPage />} />
                <Route path="/inicio" element={<ClientHomePage />} />
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
                <Route
                  path="/mis-reportes"
                  element={
                    isLogged ? (
                      <MyReportsPage />
                    ) : (
                      <Navigate
                        to="/login"
                        replace
                        state={{ from: "/mis-reportes" }}
                      />
                    )
                  }
                />
                <Route
                  path="/mis-deseos"
                  element={
                    isLogged ? (
                      <MyWishesPage />
                    ) : (
                      <Navigate
                        to="/login"
                        replace
                        state={{ from: "/mis-deseos" }}
                      />
                    )
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </PullToRefresh>

      {/* DOCK CLIENTE (delgado, pegado al borde) */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-pink-50 dark:border-slate-800 shadow-[0_-8px_30px_-15px_rgba(230,0,126,0.18)]">
        <div className="relative h-12 flex items-center justify-around max-w-md mx-auto pb-safe">
            {SHOP_TABS.map((t) => {
              const visible =
                t.to !== "/mis-deseos" || rules.wishes_enabled
              if (!visible) return null
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

      {/* Modal de búsqueda universal — se abre desde el header o con "/" */}
      <ClientSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* FAB de soporte WhatsApp (cliente / anon) */}
      <WhatsAppSupportFab bottomOffset={64} />
    </div>
  )
}

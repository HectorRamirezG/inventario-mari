import { useEffect, useRef, useState, useMemo, useDeferredValue, memo, lazy, Suspense } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useSearchParams, useLocation } from "react-router-dom"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import Fuse from "fuse.js"
import {
  Search,
  Package,
  Loader2,
  X,
  Plus,
  Minus,
  Receipt,
  ArrowRight,
  Mail,
  Phone,
  User as UserIcon,
  Sparkles,
  Maximize2,
  LayoutGrid,
  List,
  Heart,
  Star,
  Share2,
  Eye,
  ShoppingBag,
  Trash2,
  Gift,
  ArrowUpDown,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney } from "../../lib/format"
import { imageThumbnail, imageAvatar } from "../../lib/imageTransform"
import { useAuth } from "../../lib/useAuth"
import { fetchMyProfile } from "../profile/profileService"
import { sound } from "../../lib/sound"
import { haptic } from "../../lib/sound"
import { useWishlist } from "../../lib/useWishlist"
import { useLongPress } from "../../lib/useLongPress"
import VariantImageCarousel from "../../components/ui/VariantImageCarousel"
import ProductLightbox, { type LightboxSlide } from "../../components/ui/ProductLightbox"
import Skeleton from "../../components/ui/Skeleton"
import BarcodeScanner from "../../components/ui/BarcodeScanner"
import WishlistHeart from "../../components/ui/WishlistHeart"
import Toggle from "../../components/ui/Toggle"
import OnboardingTour from "../../components/ui/OnboardingTour"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import { getCategoryVisual } from "../../components/ui/CategoryIcon"
import AbandonedCartBanner from "../../components/ui/AbandonedCartBanner"
import QuickGlance from "../../components/ui/QuickGlance"
import { useCartPersist, clearPersistedCart, type PersistedCartLine } from "../../lib/useCartPersist"
import { useLocalStorageState } from "../../lib/useLocalStorageState"
import { buildGiftNotes } from "../../lib/giftNotes"
import {
  notifyCartChanged,
  CART_OPEN_EVENT,
} from "../../lib/useCartSummary"
import type { BuySheetProduct } from "./BuySheet"
import SupportModal from "../support/SupportModal"
import ShippingEstimator from "./ShippingEstimator"
import SavedAddressesSelector from "./SavedAddressesSelector"
import {
  useTierThresholds,
  tierForQty,
  priceForTier,
  type TierThresholds,
} from "../pricing/tierPricingService"
import {
  resolveThresholds,
  tierForLine,
  piecesToNextTierForLine,
} from "../pricing/tierResolver"
import {
  useShippingConfig,
  calcShipping,
} from "../pricing/shippingService"
import { getBusinessRules, useBusinessRules, isWithinBusinessHours } from "../settings/businessRulesService"
import { notifyAdmins } from "../notifications/notificationsService"
import WishesDrawer from "../wishes/WishesDrawer"
import ReviewsDrawer from "../reviews/ReviewsDrawer"
import {
  useMyLoyaltyBalance,
  spendLoyaltyPoints,
} from "../loyalty/loyaltyService"
import { useMonthlySpent } from "../../lib/useMonthlySpent"
import { fireConfetti } from "../../lib/confetti"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import { preloadOnIdle } from "../../lib/preloadOnIdle"
import {
  useActiveBundles,
  type Bundle,
} from "../bundles/bundlesService"
import {
  useCoupons,
  validateCouponWithUsage,
  couponMarkerForNotes,
  type ValidatedCoupon,
} from "../promos/couponService"
import {
  computePresale,
  formatPresaleCountdown,
} from "../products/presaleService"

// Loader único del BuySheet — se reutiliza para el lazy() y para el
// preload-on-hover/idle desde los botones "+" de cada tarjeta.
const loadBuySheet = () => import("./BuySheet")
const BuySheet = lazy(loadBuySheet)
const preloadBuySheet = () => preloadOnIdle(loadBuySheet)

// Lazy del wizard de paquetes: solo carga si el cliente toca un paquete.
const BundleWizard = lazy(() => import("../bundles/BundleWizard"))

// Estructura mínima del catálogo público
interface PublicVariant {
  id: string
  product_id: string
  variant_name: string
  stock: number
  price_menudeo: number | null
  price_medio: number | null
  price_mayoreo: number | null
  price: number | null
  image_url: string | null
  image_urls: string[] | null
  /** Costo por unidad para calcular profit al insertar sale_items.
   *  cost_override de la variante o, si no, cost del producto padre. */
  cost?: number
  /** Overrides de umbrales por variante (cascada). */
  tier_umbral_medio?: number | null
  tier_umbral_mayoreo?: number | null
  /** Preventa POR VARIANTE (rework 2026-07-01). */
  presale_active?: boolean | null
  presale_price?: number | null
  presale_discount_pct?: number | null
  presale_ends_at?: string | null
  presale_note?: string | null
}

interface PublicProduct {
  id: string
  name: string
  category: string | null
  image_url: string | null
  created_at?: string | null
  variants: PublicVariant[]
  /** Conteo de reseñas publicadas (>=0). Calculado en loadCatalog. */
  review_count?: number
  /** Promedio de rating (1–5). 0 si no hay reseñas. */
  avg_rating?: number
  /** Overrides de umbrales por producto (cascada). */
  tier_umbral_medio?: number | null
  tier_umbral_mayoreo?: number | null
  // NOTA: los campos presale_* a nivel producto están deprecados desde
  // el rework 2026-07-01. La preventa vive por variante.
}

interface CartLine {
  variant_id: string
  product_id: string
  product_name: string
  variant_name: string
  image_url: string | null
  unit_price: number
  qty: number
  stock: number
  /** Costo unitario congelado al agregar al carrito. Necesario para
   *  que sale_items.cost_snapshot/profit reflejen la realidad. */
  cost: number
  /** True si esta línea es preventa (stock=0 al apartar). Se respeta
   *  el `unit_price` original (no se reprice por tier ni por volumen). */
  is_preorder?: boolean
}

interface GuestInfo {
  name: string
  email: string
  phone: string
  address: string
  locationUrl: string
}

const GUEST_KEY = "mari_guest_v1"

function loadGuest(): GuestInfo {
  try {
    return {
      name: "",
      email: "",
      phone: "",
      address: "",
      locationUrl: "",
      ...JSON.parse(localStorage.getItem(GUEST_KEY) ?? "{}"),
    }
  } catch {
    return { name: "", email: "", phone: "", address: "", locationUrl: "" }
  }
}

function saveGuest(g: GuestInfo) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(g))
  } catch {
    /* noop */
  }
}

/**
 * Catálogo público de Mari. Funciona SIN login (anónimo) y con login
 * (cliente). El anónimo proporciona nombre + email + teléfono al apartar;
 * los datos se guardan en localStorage para no pedirlos de nuevo.
 */
export default function ClientShopPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { email: authEmail, fullName: authName, session, user } = useAuth()
  const isLogged = !!session
  const thresholds = useTierThresholds()
  const shippingCfg = useShippingConfig()
  const [isForeign, setIsForeign] = useState(false)
  /** Modo regalo: 3 estados que se pasan a sales.notes con prefijo. */
  const [giftMode, setGiftMode] = useState(false)
  const [giftRecipient, setGiftRecipient] = useState("")
  const [giftMessage, setGiftMessage] = useState("")

  // Layout switcher persistente
  type ViewMode = "focus" | "grid" | "list"
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid"
    const saved = localStorage.getItem("mari_shop_view") as ViewMode | null
    return saved && ["focus", "grid", "list"].includes(saved) ? saved : "grid"
  })
  useEffect(() => {
    try {
      localStorage.setItem("mari_shop_view", viewMode)
    } catch {
      /* noop */
    }
  }, [viewMode])

  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  // Lee `?q=` del URL al inicializar para que el search del header pueda
  // navegar a `/?q=texto` y el catálogo lo aplique de inmediato.
  const [q, setQ] = useState(() => searchParams.get("q") ?? "")
  // Debounce automatico del search para no recomputar fuse en cada tecla.
  const deferredQ = useDeferredValue(q)
  // Filtros persistentes — sobreviven a refresh / cierre de pestaña
  // para que el cliente no tenga que reconfigurar su vista cada vez.
  const [sortBy, setSortBy] = useLocalStorageState<
    "newest" | "price_asc" | "price_desc" | "name"
  >("mari:shop:sortBy", "newest")
  const [categoryFilter, setCategoryFilter] = useLocalStorageState<string>(
    "mari:shop:categoryFilter",
    "all",
  )
  const [cart, setCart] = useState<CartLine[]>([])
  useCartPersist(cart as PersistedCartLine[])
  const [openCart, setOpenCart] = useState(false)

  // Notificar al header (CartHeaderButton) cada vez que cambia el carrito.
  // El custom event `mari:cart-changed` re-sincroniza el badge sin tener
  // que esperar a un `storage` event (que no se dispara en mismo tab).
  useEffect(() => {
    notifyCartChanged()
  }, [cart])

  // Escuchar petición externa de abrir el carrito (header → cualquier
  // ruta del shop puede pedir que se abra el drawer). Si llegamos a esta
  // página vía `navigate("/", { state: { openCart: true } })`, también
  // lo abrimos.
  useEffect(() => {
    const handler = () => setOpenCart(true)
    window.addEventListener(CART_OPEN_EVENT, handler)
    return () => window.removeEventListener(CART_OPEN_EVENT, handler)
  }, [])

  // Backup: si llegamos con state.openCart=true desde otra página (el
  // CartHeaderButton lo manda), abrimos el drawer al montar. Esto cubre
  // la race condition donde el CustomEvent llega antes de que estemos
  // escuchando.
  useEffect(() => {
    if ((location.state as { openCart?: boolean } | null)?.openCart) {
      setOpenCart(true)
      // Limpiar el state para que un refresh no re-abra el drawer
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [openGuestForm, setOpenGuestForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [guest, setGuest] = useState<GuestInfo>(() => loadGuest())

  /**
   * Cuando el cliente está LOGUEADO y tiene perfil con datos, los usamos
   * para AUTO-LLENAR los campos del guest que aún están vacíos. NO
   * sobreescribimos lo que el cliente ya escribió a mano — sólo rellenamos
   * los huecos. De ese modo cuando va a comprar no necesita re-escribir
   * teléfono ni dirección si ya los tiene en su perfil.
   */
  useEffect(() => {
    if (!session || !user?.id) return
    let alive = true
    ;(async () => {
      try {
        const profile = await fetchMyProfile(user.id)
        if (!alive || !profile) return
        setGuest((prev) => ({
          name: prev.name || profile.full_name || authName || "",
          email: prev.email || profile.email || authEmail || "",
          phone: prev.phone || profile.phone || "",
          address: prev.address || profile.address || "",
          locationUrl: prev.locationUrl || profile.location_url || "",
        }))
      } catch {
        /* silencio: profile puede no existir aún */
      }
    })()
    return () => {
      alive = false
    }
  }, [session, user?.id, authName, authEmail])

  // Reglas de negocio (reactivas a cambios del admin en tiempo real)
  const bRules = useBusinessRules()
  const shopOpen = isWithinBusinessHours(bRules)

  // Bottom Sheet de compra (estilo Shein): se abre con el botón "+" de la card.
  // `preselectedVariant` es estado (no ref) porque el sheet lo lee para
  // hacer scrollIntoView + highlight de esa variante al abrir.
  const [buySheetProduct, setBuySheetProduct] = useState<PublicProduct | null>(null)
  const [buySheetPreselectedVariant, setBuySheetPreselectedVariant] = useState<string | null>(null)

  // Wizard de paquetes: lo abre el cliente al tocar un bundle.
  const { bundles: activeBundles } = useActiveBundles()
  const [activeBundle, setActiveBundle] = useState<Bundle | null>(null)

  // Lightbox fullscreen (clic en imagen de la card)
  const [lightboxProduct, setLightboxProduct] = useState<PublicProduct | null>(null)
  const [lightboxStartVariant, setLightboxStartVariant] = useState<string | null>(null)

  // Centro de soporte (cliente logueado o invitado)
  const [openSupport, setOpenSupport] = useState(false)
  const [openWishes, setOpenWishes] = useState(false)
  /** Producto activo para abrir el drawer de reseñas. */
  const [reviewsFor, setReviewsFor] = useState<{
    id: string
    name: string
    image: string | null
  } | null>(null)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [onlyWishlist, setOnlyWishlist] = useState(false)
  const wishlist = useWishlist()
  const catalogReloadRef = useRef<(() => void) | null>(null)

  // Si el usuario está logueado, prellena con sus datos
  useEffect(() => {
    if (isLogged && authEmail) {
      setGuest((g) => ({
        ...g,
        email: g.email || authEmail,
        name: g.name || authName || authEmail.split("@")[0],
      }))
    }
  }, [isLogged, authEmail, authName])

  useEffect(() => {
    let alive = true
    const loadCatalog = async () => {
      // Select "extendido" con todos los campos nuevos (preventa por
      // variante, overrides de tier). Si la migración correspondiente
      // aún no corrió en Supabase, hacemos fallback silencioso al select
      // básico. Así el catálogo siempre carga aunque la BD esté
      // parcialmente migrada.
      const VARIANT_SELECT_FULL =
        "id,product_id,variant_name,sku,stock,price,price_menudeo,price_medio,price_mayoreo,image_url,image_urls,cost_override,tier_umbral_medio,tier_umbral_mayoreo,presale_active,presale_price,presale_discount_pct,presale_ends_at,presale_note"
      const VARIANT_SELECT_BASIC =
        "id,product_id,variant_name,sku,stock,price,price_menudeo,price_medio,price_mayoreo,image_url,image_urls,cost_override"
      const PRODUCT_SELECT_FULL =
        "id,name,category,image_url,created_at,cost,tier_umbral_medio,tier_umbral_mayoreo"
      const PRODUCT_SELECT_BASIC =
        "id,name,category,image_url,created_at,cost"

      // Intento robusto: si el select con las columnas nuevas falla por
      // "column does not exist", reintentamos con el básico. Cubre el
      // caso donde la migración SQL aún no se ha corrido en Supabase.
      // Casts a `any` porque Supabase genera tipos dinámicos por select
      // string y los dos paths tienen shapes distintas.
      let prods: any[] = []
      {
        const q: any = await supabase
          .from("products")
          .select(PRODUCT_SELECT_FULL)
          .eq("is_active", true)
          .order("name")
        if (q.error && /column .* does not exist/i.test(q.error.message)) {
          const fallback: any = await supabase
            .from("products")
            .select(PRODUCT_SELECT_BASIC)
            .eq("is_active", true)
            .order("name")
          prods = fallback.data ?? []
          if (typeof console !== "undefined") {
            console.warn(
              "[ClientShop] products: columnas nuevas faltan — corre migración 20260702 en Supabase.",
            )
          }
        } else {
          prods = q.data ?? []
        }
      }

      let vars: any[] = []
      {
        const q: any = await supabase
          .from("variants")
          .select(VARIANT_SELECT_FULL)
          .eq("is_active", true)
        if (q.error && /column .* does not exist/i.test(q.error.message)) {
          const fallback: any = await supabase
            .from("variants")
            .select(VARIANT_SELECT_BASIC)
            .eq("is_active", true)
          vars = fallback.data ?? []
          if (typeof console !== "undefined") {
            console.warn(
              "[ClientShop] variants: columnas nuevas faltan — corre migraciones 20260702 y 20260703 en Supabase.",
            )
          }
        } else {
          vars = q.data ?? []
        }
      }

      // Stats de reseñas publicadas para enriquecer las cards del catálogo.
      // Tolerante: si la tabla aún no existe, ignoramos silenciosamente.
      const { data: reviewsRaw } = await supabase
        .from("reviews")
        .select("product_id,rating")
        .eq("status", "published")
        .limit(5000)
      if (!alive) return
      // Mapa product.id → cost para resolver el costo de cada variante.
      // Variante sin cost_override hereda el cost del producto padre.
      const productCost = new Map<string, number>(
        ((prods ?? []) as any[]).map((p) => [p.id, Number(p.cost) || 0]),
      )
      const byProduct: Record<string, PublicVariant[]> = {}
      ;(vars ?? []).forEach((v: any) => {
        if (!byProduct[v.product_id]) byProduct[v.product_id] = []
        const cost =
          v.cost_override != null && Number(v.cost_override) > 0
            ? Number(v.cost_override)
            : productCost.get(v.product_id) ?? 0
        byProduct[v.product_id].push({
          ...v,
          image_url: v.image_url ?? null,
          image_urls: v.image_urls ?? null,
          cost,
        } as PublicVariant)
      })
      // Agregamos count + sum por product_id (1 pase, O(n)).
      const reviewAgg: Record<string, { count: number; sum: number }> = {}
      for (const r of (reviewsRaw ?? []) as any[]) {
        const k = r.product_id
        if (!k) continue
        if (!reviewAgg[k]) reviewAgg[k] = { count: 0, sum: 0 }
        reviewAgg[k].count += 1
        reviewAgg[k].sum += Number(r.rating) || 0
      }
      setProducts(
        (prods ?? []).map((p: any) => {
          const agg = reviewAgg[p.id]
          return {
            ...(p as Omit<PublicProduct, "variants">),
            image_url: p.image_url ?? null,
            variants: byProduct[p.id] ?? [],
            review_count: agg?.count ?? 0,
            avg_rating: agg && agg.count > 0 ? agg.sum / agg.count : 0,
          }
        }),
      )
      setLoading(false)
    }
    catalogReloadRef.current = loadCatalog
    loadCatalog()
    return () => {
      alive = false
      catalogReloadRef.current = null
    }
  }, [])

  // Realtime via hub multiplex: el callback debounced delega en el
  // loader vivo registrado en el ref.
  const triggerCatalogReload = useDebouncedCallback(() => {
    catalogReloadRef.current?.()
  }, 800)
  useRealtimeSubscription("products", triggerCatalogReload)
  useRealtimeSubscription("variants", triggerCatalogReload)

  // Si llegamos con `?p=PRODUCT_ID` (típicamente desde la HomePage),
  // abrimos el BuySheet en cuanto el catálogo esté cargado. Después
  // limpiamos el query param para no re-abrir al refrescar.
  useEffect(() => {
    const requestedId = searchParams.get("p")
    if (!requestedId) return
    preloadBuySheet()
    if (products.length === 0) return
    const match = products.find((p) => p.id === requestedId)
    if (match) {
      setBuySheetPreselectedVariant(match.variants[0]?.id ?? null)
      setBuySheetProduct(match)
    }
    const next = new URLSearchParams(searchParams)
    next.delete("p")
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, searchParams])

  // Si llegamos con `?reorder=SALE_ID` (desde "Reordenar" en /mis-pedidos),
  // cargamos los items de esa venta y los agregamos al carrito actual.
  // Limpia el query al terminar para no re-disparar al refrescar.
  useEffect(() => {
    const reorderId = searchParams.get("reorder")
    if (!reorderId) return
    if (products.length === 0) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("variant_id,product_id,qty")
        .eq("sale_id", reorderId)
      if (cancelled) return
      if (error || !data || data.length === 0) {
        toast.error("No pudimos recuperar los productos de ese pedido")
      } else {
        let added = 0
        let missing = 0
        // Agrupamos por product_id para usar addBatchToCart por producto
        const byProduct: Record<string, { variantId: string; qty: number }[]> = {}
        for (const it of data as any[]) {
          if (!it.product_id) continue
          if (!byProduct[it.product_id]) byProduct[it.product_id] = []
          byProduct[it.product_id].push({
            variantId: it.variant_id,
            qty: Math.max(1, Number(it.qty) || 1),
          })
        }
        for (const [pid, lines] of Object.entries(byProduct)) {
          const p = products.find((pp) => pp.id === pid)
          if (!p) {
            missing += lines.length
            continue
          }
          addBatchToCart(p, lines)
          added += lines.length
        }
        if (added > 0) {
          toast.success(
            missing > 0
              ? `${added} productos recargados (${missing} ya no existen)`
              : `${added} productos agregados al carrito`,
            { duration: 3200 },
          )
          // Abrir el carrito automáticamente para que el cliente vea
          // todo cargado y proceda. Pequeño delay para que el toast
          // alcance a renderizar antes de que el drawer lo tape.
          setTimeout(() => setOpenCart(true), 250)
        } else if (missing > 0) {
          toast.error("Esos productos ya no están disponibles")
        }
      }
      const next = new URLSearchParams(searchParams)
      next.delete("reorder")
      setSearchParams(next, { replace: true })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, searchParams])

  // Si llegamos con `?variant=VARIANT_ID` (desde notif de stock_back, por
  // ejemplo), abrimos el BuySheet con esa variante pre-seleccionada. Si
  // no existe, silenciosamente limpiamos el query.
  //
  // PRIORIDAD: si también hay `?reorder=`, ese gana — significa que el
  // cliente quiere recargar un pedido entero, no ver un solo producto.
  // Esperamos a que reorder termine (limpia su query) antes de procesar
  // este. Sin esta guarda se abrían BuySheet + carrito a la vez.
  useEffect(() => {
    const requestedVariant = searchParams.get("variant")
    if (!requestedVariant) return
    if (searchParams.has("reorder")) return
    if (products.length === 0) return
    const product = products.find((p) =>
      p.variants.some((v) => v.id === requestedVariant),
    )
    if (product) {
      preloadBuySheet()
      setBuySheetPreselectedVariant(requestedVariant)
      setBuySheetProduct(product)
    } else {
      toast("Ese producto ya no está disponible", { icon: "ℹ️" })
    }
    const next = new URLSearchParams(searchParams)
    next.delete("variant")
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, searchParams])

  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      if (p.category) set.add(p.category)
    })
    return Array.from(set).sort()
  }, [products])

  const fuse = useMemo(
    () =>
      new Fuse(products, {
        keys: [
          { name: "name", weight: 0.6 },
          { name: "category", weight: 0.2 },
          { name: "variants.variant_name", weight: 0.2 },
        ],
        threshold: 0.38,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [products]
  )

  const filtered = useMemo(() => {
    const needle = deferredQ.trim()
    let out = products

    if (categoryFilter !== "all") {
      out = out.filter((p) => (p.category ?? "") === categoryFilter)
    }

    if (onlyWishlist) {
      out = out.filter((p) => wishlist.has(p.id))
    }

    if (needle.length >= 2) {
      const results = fuse.search(needle).map((r: { item: PublicProduct }) => r.item)
      const idSet = new Set(out.map((p) => p.id))
      out = results.filter((p: PublicProduct) => idSet.has(p.id))
    }

    const minPrice = (p: PublicProduct) => {
      const ps = p.variants
        .map((v) => Number(v.price_menudeo ?? v.price ?? 0))
        .filter((x) => x > 0)
      return ps.length ? Math.min(...ps) : Infinity
    }
    const arr = [...out]
    if (sortBy === "price_asc") arr.sort((a, b) => minPrice(a) - minPrice(b))
    else if (sortBy === "price_desc") arr.sort((a, b) => minPrice(b) - minPrice(a))
    else if (sortBy === "name") arr.sort((a, b) => a.name.localeCompare(b.name))
    else if (needle.length < 2)
      arr.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0
        const tb = b.created_at ? Date.parse(b.created_at) : 0
        return tb - ta
      })
    return arr
  }, [products, deferredQ, categoryFilter, sortBy, onlyWishlist, wishlist, fuse])

  // Log de búsquedas SIN resultado — alimenta el insight admin
  // "qué buscan tus clientas que no tienes". Tolerante: si la tabla
  // search_misses no existe, silenciosamente se ignora.
  useEffect(() => {
    if (filtered.length > 0) return
    const needle = deferredQ.trim()
    if (needle.length < 3) return
    // Pequeño debounce para no enviar mientras el cliente escribe.
    const t = window.setTimeout(() => {
      import("../products/searchInsightsService").then(({ logSearchMiss }) =>
        logSearchMiss(needle, {
          customerEmail: authEmail,
          categoryFilter: categoryFilter !== "all" ? categoryFilter : null,
        }),
      )
    }, 1200)
    return () => window.clearTimeout(t)
  }, [filtered.length, deferredQ, authEmail, categoryFilter])

  const handleScan = (code: string) => {
    const norm = code.trim().toLowerCase()
    const match = products.find(
      (p) =>
        p.name.toLowerCase() === norm ||
        p.variants.some((v) => v.variant_name.toLowerCase() === norm)
    )
    if (match) {
      setBuySheetPreselectedVariant(match.variants[0]?.id ?? null)
      setBuySheetProduct(match)
      setScannerOpen(false)
      sound.success()
      toast.success(match.name, { duration: 1500 })
      return true
    }
    sound.error()
    toast.error(`No encontré "${code}"`)
    return false
  }

  const totalQty = useMemo(
    () => cart.reduce((acc, c) => acc + c.qty, 0),
    [cart]
  )

  // Auto-VIP: si la regla está activa y el cliente gastó >= threshold
  // en los últimos 30 días, FORZAMOS precio mayoreo. Se calcula aquí
  // y se usa más abajo como override del cartTier natural.
  const { spent: monthlySpent } = useMonthlySpent(authEmail, 30)
  const isAutoVip =
    bRules.auto_vip_enabled &&
    !!authEmail &&
    monthlySpent >= (bRules.auto_vip_monthly_threshold || 0) &&
    (bRules.auto_vip_monthly_threshold || 0) > 0

  // Tier "de referencia" del carrito completo — calculado con umbrales
  // globales. Se muestra en el banner motivador ("estás en X tier")
  // pero YA NO se usa para repricear (rework 2026-07-01: cada variante
  // reprice con SU cantidad y SUS umbrales resueltos).
  const cartTier = useMemo(
    () => (isAutoVip ? "mayoreo" : tierForQty(totalQty, thresholds)),
    [isAutoVip, totalQty, thresholds]
  )

  // Re-calcular precios + stock FRESCO de cada línea POR VARIANTE. Cada
  // línea usa SU cantidad + SUS umbrales resueltos (cascada variante >
  // producto > global). Realtime de `variants` mantiene `products` al día,
  // así que con este pase también obtenemos `stock` actualizado.
  //
  // Auto-VIP: si el cliente califica como VIP, TODAS sus líneas se
  // fuerzan a `mayoreo` — respeta la promesa "cliente frecuente = mejor
  // precio siempre" independiente de cuánto pida de cada variante.
  const repricedCart = useMemo(
    () =>
      cart.map((c) => {
        const variant = products
          .flatMap((p) => p.variants)
          .find((v) => v.id === c.variant_id)
        if (!variant) return c
        // Preventa: precio congelado al agregar. NO se reprice por tier.
        if (c.is_preorder) {
          return { ...c, stock: variant.stock }
        }
        const productParent = products.find((p) =>
          (p.variants ?? []).some((v) => v.id === variant.id),
        )
        // Cascada de umbrales: variante > producto > global.
        const lineThresholds = resolveThresholds(
          {
            tier_umbral_medio: (variant as any).tier_umbral_medio,
            tier_umbral_mayoreo: (variant as any).tier_umbral_mayoreo,
          },
          {
            tier_umbral_medio: (productParent as any)?.tier_umbral_medio,
            tier_umbral_mayoreo: (productParent as any)?.tier_umbral_mayoreo,
          },
          thresholds,
        )
        // Tier POR VARIANTE (usa SU cantidad — no el total del carrito).
        // Auto-VIP fuerza mayoreo global.
        const lineTier = isAutoVip
          ? "mayoreo"
          : tierForLine(c.qty, lineThresholds)
        const newPrice = priceForTier(variant, lineTier)
        return {
          ...c,
          unit_price: newPrice,
          stock: variant.stock,
        }
      }),
    [cart, isAutoVip, thresholds, products]
  )

  // Subtotal (sin envío) — solo items
  const subtotalAmt = useMemo(
    () => repricedCart.reduce((acc, c) => acc + c.qty * c.unit_price, 0),
    [repricedCart]
  )

  // Envío (foráneo o local) usando la lógica centralizada
  const shippingCalc = useMemo(
    () => calcShipping(subtotalAmt, isForeign, shippingCfg),
    [subtotalAmt, isForeign, shippingCfg]
  )

  // Programa de premios: si el cliente está logueado, calculamos cuántos
  // puntos puede usar como descuento (mínimo `loyalty_min_redeem`).
  // El descuento NO puede superar el subtotal+envío.
  const { balance: myLoyalty } = useMyLoyaltyBalance()
  const [useLoyalty, setUseLoyalty] = useState(false)

  // Pack de empaque premium — cliente paga extra por envoltura bonita.
  // Solo aparece si `gift_wrap_enabled` está activo en business rules.
  const [useGiftWrap, setUseGiftWrap] = useState(false)
  const giftWrapAmount = useGiftWrap && bRules.gift_wrap_enabled
    ? Number(bRules.gift_wrap_price ?? 0)
    : 0

  // Cupón — opcional. El cliente teclea código + tap "Aplicar". Si es
  // válido, descontamos del total y guardamos el código en `sales.notes`
  // como marcador `[CUPÓN: <CODE>]` para tracking de Mari. El catálogo
  // de cupones lo edita Mari desde Reglas (CouponsEditor).
  const { coupons: availableCoupons } = useCoupons()
  const [couponInput, setCouponInput] = useState("")
  const [couponChecking, setCouponChecking] = useState(false)
  const [appliedCoupon, setAppliedCoupon] = useState<ValidatedCoupon | null>(null)
  // Si cambian los items del carrito (subtotal varía), re-evaluamos el
  // cupón aplicado para que el descuento siempre refleje el carrito real.
  // Si el cupón pasa a no aplicar (subtotal bajó del min_subtotal), lo
  // quitamos silenciosamente con toast informativo.

  // Confeti en hitos del cliente:
  //  - Cruzar 100 puntos por primera vez → dorado.
  //  - Activarse como VIP automático por primera vez → morado.
  // Tracked en localStorage por email para no repetir.
  useEffect(() => {
    if (!authEmail || !bRules.loyalty_enabled) return
    const pts = myLoyalty?.points ?? 0
    if (pts < 100) return
    const key = `mari:milestone-100pts:${authEmail.toLowerCase()}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, new Date().toISOString())
    // Confeti dorado + toast celebratorio
    fireConfetti({
      count: 90,
      colors: ["#fbbf24", "#f59e0b", "#fde047", "#fcd34d", "#ffffff"],
      duration: 1500,
    })
    toast.success("¡Cruzaste 100 puntos! 🏆 Sigue ganando premios.", {
      duration: 4200,
    })
  }, [authEmail, bRules.loyalty_enabled, myLoyalty?.points])

  useEffect(() => {
    if (!authEmail || !isAutoVip) return
    const key = `mari:milestone-vip:${authEmail.toLowerCase()}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, new Date().toISOString())
    // Confeti violeta/rosa + toast premium
    fireConfetti({
      count: 110,
      colors: ["#a855f7", "#ec4899", "#c084fc", "#f9a8d4", "#fbbf24"],
      duration: 1700,
    })
    toast.success("✨ Eres VIP — desde ahora aplica precio mayoreo automático.", {
      duration: 5000,
    })
  }, [authEmail, isAutoVip])

  const loyaltyAvailable = bRules.loyalty_enabled
    ? Math.max(0, myLoyalty?.points ?? 0)
    : 0
  const loyaltyCanRedeem =
    bRules.loyalty_enabled &&
    loyaltyAvailable >= (bRules.loyalty_min_redeem || 0) &&
    isLogged
  const loyaltyDiscount = useMemo(() => {
    if (!useLoyalty || !loyaltyCanRedeem) return 0
    const peso = bRules.loyalty_peso_por_punto || 1
    const baseTotal = subtotalAmt + shippingCalc.amount
    const maxByMoney = Math.floor(baseTotal / peso) // tope: no descontar más que el total
    const usable = Math.min(loyaltyAvailable, maxByMoney)
    return Math.max(0, usable * peso)
  }, [
    useLoyalty,
    loyaltyCanRedeem,
    loyaltyAvailable,
    bRules.loyalty_peso_por_punto,
    subtotalAmt,
    shippingCalc.amount,
  ])
  const loyaltyPointsToSpend = useMemo(() => {
    const peso = bRules.loyalty_peso_por_punto || 1
    if (loyaltyDiscount <= 0 || peso <= 0) return 0
    return Math.round(loyaltyDiscount / peso)
  }, [loyaltyDiscount, bRules.loyalty_peso_por_punto])

  // Descuento automático por volumen (regla auto_discount_*).
  // Mari decidió que este descuento se aplique TAMBIÉN al carrito del
  // cliente — antes solo se veía en el carrito admin, pero el cliente
  // se quejaba de que en realidad no existía al pagar.
  // Se aplica sobre el subtotal y solo si totalQty supera el umbral.
  // No afecta envío ni puntos: es un descuento sobre items.
  //
  // Las líneas de PREVENTA quedan FUERA: ya tienen su propio descuento
  // configurable (`preorder_discount_percent`). Aplicar también el de
  // volumen sería un doble descuento que mata margen.
  const volumeDiscount = useMemo(() => {
    if (!bRules.auto_discount_enabled) return 0
    if (totalQty < (bRules.auto_discount_min_items || 0)) return 0
    const pct = Math.max(0, Math.min(50, bRules.auto_discount_percent || 0))
    if (pct <= 0) return 0
    // Subtotal sin las líneas de preventa.
    const eligibleSubtotal = repricedCart.reduce(
      (acc, c) => (c.is_preorder ? acc : acc + c.qty * c.unit_price),
      0,
    )
    return Math.round(eligibleSubtotal * (pct / 100) * 100) / 100
  }, [
    bRules.auto_discount_enabled,
    bRules.auto_discount_min_items,
    bRules.auto_discount_percent,
    totalQty,
    repricedCart,
  ])

  // TOTAL = subtotal + envío + empaque premium − volumen − puntos − cupón
  const couponDiscount = appliedCoupon?.discount ?? 0
  const totalAmt = Math.max(
    0,
    subtotalAmt +
      shippingCalc.amount +
      giftWrapAmount -
      volumeDiscount -
      loyaltyDiscount -
      couponDiscount,
  )

  // Re-validación del cupón cuando cambia el subtotal del carrito. Si
  // el subtotal bajó del min_subtotal, removemos el cupón con toast.
  // El descuento se recalcula desde el subtotal actual (no del subtotal
  // congelado al momento de aplicar).
  useEffect(() => {
    if (!appliedCoupon) return
    if (subtotalAmt <= 0) {
      setAppliedCoupon(null)
      return
    }
    const c = appliedCoupon.coupon
    if (c.min_subtotal > 0 && subtotalAmt < c.min_subtotal) {
      setAppliedCoupon(null)
      toast(`Tu cupón ${c.code} ya no aplica · tu carrito bajó del mínimo`, {
        icon: "ℹ️",
        duration: 3000,
      })
      return
    }
    // Recalcula descuento sobre el subtotal actual.
    const newDiscount =
      c.type === "percent"
        ? Math.min(subtotalAmt, Math.round((subtotalAmt * c.amount) / 100 * 100) / 100)
        : Math.min(subtotalAmt, c.amount)
    if (Math.abs(newDiscount - appliedCoupon.discount) > 0.01) {
      setAppliedCoupon({ coupon: c, discount: newDiscount })
    }
  }, [subtotalAmt, appliedCoupon])

  // Ahorro vs menudeo (motivacional). Se calcula LINE-BY-LINE: cada
  // línea aporta al ahorro solo si su tier resuelto NO es menudeo. Así
  // el ahorro es preciso incluso cuando el carrito mezcla líneas con
  // umbrales distintos.
  const savingsVsMenudeo = useMemo(() => {
    return repricedCart.reduce((acc, c) => {
      if (c.is_preorder) return acc // preventa: ahorro ya reflejado en unit_price
      const variant = products
        .flatMap((p) => p.variants)
        .find((v) => v.id === c.variant_id)
      if (!variant) return acc
      const menudeoUnit = priceForTier(variant, "menudeo")
      const savedUnit = Math.max(0, menudeoUnit - c.unit_price)
      return acc + savedUnit * c.qty
    }, 0)
  }, [repricedCart, products])

  function priceOf(v: PublicVariant): number {
    return v.price_menudeo ?? v.price ?? v.price_medio ?? v.price_mayoreo ?? 0
  }

  /** Aplica un código de cupón al carrito. Valida client-side primero
   *  (catálogo activo + subtotal + expiración) y luego verifica usage
   *  en BD (max_uses). Si todo OK, actualiza `appliedCoupon` y toast
   *  con el descuento aplicado. */
  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase()
    if (!code) {
      toast.error("Escribe un código de cupón")
      return
    }
    if (subtotalAmt <= 0) {
      toast.error("Agrega productos primero")
      return
    }
    setCouponChecking(true)
    try {
      const result = await validateCouponWithUsage(
        code,
        subtotalAmt,
        availableCoupons,
      )
      if (!result.ok) {
        toast.error(result.reason)
        sound.error()
        return
      }
      setAppliedCoupon(result.data)
      setCouponInput("")
      toast.success(
        `Cupón ${result.data.coupon.code} aplicado · -${formatMoney(result.data.discount)}`,
        { duration: 3000 },
      )
      sound.success()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo validar el cupón")
    } finally {
      setCouponChecking(false)
    }
  }

  /** Quita el cupón aplicado. Se vuelve a permitir teclear uno nuevo. */
  function removeCoupon() {
    setAppliedCoupon(null)
    setCouponInput("")
  }

  // NOTA: hubo una funci\u00f3n `addToCart(p, v)` legacy que agregaba una
  // variante de a una. Quedaba muerta desde que migramos al BuySheet con
  // `addBatchToCart` (que es el que usan todos los botones del cat\u00e1logo).
  // Eliminada para no confundir y bajar peso del bundle.

  /** Recibe el batch del BuySheet (varias variantes con sus cantidades).
   *  Si una línea viene con `isPreorder=true`, la variante tiene preventa
   *  activa explícita (rework 2026-07-01: mecánica por variante). Ya no
   *  se aplica la preventa automática por stock=0 con block_oversell=off:
   *  cuando `block_oversell=false` permite vender sin stock a precio
   *  normal (sin descuento automático). */
  function addBatchToCart(
    p: PublicProduct,
    lines: { variantId: string; qty: number; isPreorder?: boolean }[]
  ) {
    if (lines.length === 0) return
    let added = 0
    let skipped = 0
    // Cap de seguridad para preventa/oversell sin stock físico.
    const PREORDER_CAP = 5
    // Resolvemos stock FRESCO desde `products` (no del snapshot del sheet).
    const freshVariants = products
      .flatMap((pp) => pp.variants)
      .reduce((acc, vv) => {
        acc.set(vv.id, vv)
        return acc
      }, new Map<string, PublicVariant>())
    setCart((prev) => {
      const next = [...prev]
      for (const { variantId, qty, isPreorder } of lines) {
        const fresh = freshVariants.get(variantId) ?? p.variants.find((vv) => vv.id === variantId)
        if (!fresh) continue
        const realStock = Math.max(0, Number(fresh.stock) || 0)
        const basePrice = priceOf(fresh)

        // Preventa POR VARIANTE (rework 2026-07-01). El BuySheet marca la
        // línea con isPreorder=true cuando la variante tiene la mecánica
        // activa. Verificamos usando computePresale con los campos de la
        // propia variante para consistencia.
        const variantPresale = computePresale(fresh, basePrice)
        const usesVariantPresale = !!isPreorder && variantPresale.active

        // Cap de piezas.
        //   - Preventa activa: stock si hay, PREORDER_CAP si no.
        //   - Sin stock + block_oversell=off: permite hasta PREORDER_CAP
        //     a precio normal (sin descuento auto).
        //   - Normal: cap = stock físico.
        const canOversell = !bRules.block_oversell && realStock === 0
        const cap = usesVariantPresale
          ? realStock > 0 ? realStock : PREORDER_CAP
          : canOversell
            ? PREORDER_CAP
            : realStock
        const safeQty = Math.min(qty, cap)
        if (safeQty <= 0) {
          skipped++
          continue
        }
        added += safeQty

        // Precio final: preventa por variante > menudeo normal.
        // Si es oversell sin preventa, se cobra precio normal.
        const finalPrice = usesVariantPresale
          ? variantPresale.effectivePrice
          : basePrice

        // is_preorder marca la línea para NO re-pricear por tier de volumen.
        // Solo se marca cuando la preventa por variante está activa.
        // El oversell sin preventa NO marca is_preorder (se puede escalar
        // por tier si el cliente sube la cantidad).
        const isPreorderLine = usesVariantPresale
        const ix = next.findIndex((c) => c.variant_id === variantId)
        if (ix >= 0) {
          next[ix] = {
            ...next[ix],
            qty: safeQty,
            stock: realStock,
            unit_price: finalPrice,
            cost: Number(fresh.cost) || next[ix].cost || 0,
            is_preorder: isPreorderLine,
          }
        } else {
          next.push({
            variant_id: fresh.id,
            product_id: p.id,
            product_name: p.name,
            variant_name: fresh.variant_name,
            image_url:
              (fresh.image_urls && fresh.image_urls[0]) ?? fresh.image_url ?? p.image_url,
            unit_price: finalPrice,
            cost: Number(fresh.cost) || 0,
            qty: safeQty,
            stock: realStock,
            is_preorder: isPreorderLine,
          })
        }
      }
      return next
    })
    if (added > 0) {
      sound.success()
      // Toast en bottom-center con margen sobre el dock para NO tapar el
      // botón del carrito (que vive en el header arriba) ni el dock inferior.
      toast.success(`✨ +${added} ${added === 1 ? "pieza" : "piezas"} al carrito`, {
        duration: 1600,
        position: "bottom-center",
        style: {
          marginBottom: "calc(4.25rem + env(safe-area-inset-bottom))",
          padding: "6px 12px",
          fontSize: "11.5px",
        },
      })
    }
    if (skipped > 0 && added === 0) {
      toast.error("Sin stock disponible para los tonos seleccionados.", {
        duration: 2800,
      })
    } else if (skipped > 0) {
      toast(`Algunos tonos sin stock se omitieron.`, { icon: "⚠️", duration: 2400 })
    }
    setBuySheetProduct(null)
  }

  function changeQty(variantId: string, delta: number) {
    // Haptic light antes del setState para feedback inmediato (incluso
    // si el state no cambia por tope de stock, el tap se siente).
    haptic.light()
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.variant_id !== variantId) return c
          // Stock REAL desde products (no el snapshot del carrito).
          const fresh = products
            .flatMap((p) => p.variants)
            .find((v) => v.id === variantId)
          const realStock = fresh?.stock ?? c.stock
          // Si la línea es preventa (stock=0 al apartar), permitimos hasta
          // 5 piezas como cap. Si en el ínterin llegó stock, también lo
          // permitimos hasta ese stock real (lo que sea mayor).
          const cap = c.is_preorder ? Math.max(5, realStock) : realStock
          const next = Math.max(0, Math.min(cap, c.qty + delta))
          // Si intentaba sumar y ya estaba al tope, avisamos con el stock real.
          if (delta > 0 && next === c.qty && c.qty === cap) {
            toast(
              c.is_preorder
                ? `Máximo 5 en preventa de ${c.variant_name}. Pregúntanos por mayoreo.`
                : realStock === 0
                ? `${c.variant_name} se agotó. Te avisamos cuando vuelva 💛`
                : `Ya llevas las ${realStock} piezas disponibles de ${c.variant_name} ✨`,
              { icon: "⚠️", duration: 2400 }
            )
          }
          return { ...c, qty: next, stock: realStock }
        })
        .filter((c) => c.qty > 0)
    )
  }

  /** Agrega al carrito las líneas que produjo el wizard de paquete.
   *  Cada línea ya viene con `unitPrice` que incluye el descuento del
   *  bundle distribuido proporcionalmente. Marcamos las líneas con
   *  product_name `[Paquete: X] · Producto` para que el cliente las
   *  identifique fácil en su carrito. */
  function addBundleToCart(
    lines: { variantId: string; qty: number; unitPrice: number }[],
    meta: { bundleName: string },
  ) {
    if (lines.length === 0) return
    setCart((prev) => {
      const next = [...prev]
      for (const { variantId, qty, unitPrice } of lines) {
        const variant = products
          .flatMap((p) => p.variants)
          .find((v) => v.id === variantId)
        if (!variant) continue
        const product = products.find((p) => p.id === variant.product_id)
        if (!product) continue
        const tag = `[${meta.bundleName}] ${product.name}`
        // Si ya existe la misma variante en carrito, sumamos qty pero
        // dejamos el unit_price del bundle (más bajo) para no penalizar
        // al cliente que ya había agregado la pieza.
        const ix = next.findIndex((c) => c.variant_id === variantId)
        if (ix >= 0) {
          next[ix] = {
            ...next[ix],
            qty: next[ix].qty + qty,
            unit_price: unitPrice,
            cost: Number(variant.cost) || next[ix].cost || 0,
            product_name: tag,
          }
        } else {
          next.push({
            variant_id: variant.id,
            product_id: variant.product_id,
            product_name: tag,
            variant_name: variant.variant_name,
            image_url:
              (variant.image_urls && variant.image_urls[0]) ??
              variant.image_url ??
              product.image_url,
            unit_price: unitPrice,
            cost: Number(variant.cost) || 0,
            qty,
            stock: Math.max(0, Number(variant.stock) || 0),
          })
        }
      }
      return next
    })
    sound.success()
    setOpenCart(true)
  }

  /** Inicia el proceso de apartado. Si faltan datos del invitado, abre el modal. */
  function startCheckout() {
    if (cart.length === 0) return
    // Phone es siempre útil para envíos. Si rule require_phone_to_buy
    // está activa, lo HACEMOS estricto (no se puede continuar sin él).
    // Si está apagada, mantenemos el comportamiento legacy (también lo
    // pide para no perder contactabilidad).
    const phoneRequired = bRules.require_phone_to_buy
    const needsForm =
      !guest.name.trim() ||
      !guest.email.trim() ||
      (phoneRequired ? !guest.phone.trim() : false) ||
      !guest.phone.trim()
    if (needsForm) {
      setOpenCart(false)
      setOpenGuestForm(true)
    } else {
      submitLayaway()
    }
  }

  async function submitLayaway() {
    if (cart.length === 0) return
    if (!guest.name.trim() || !guest.email.trim() || !guest.phone.trim()) {
      toast.error("Llena tus datos para apartar")
      setOpenGuestForm(true)
      return
    }

    // Rate limit: máximo 3 intentos de checkout en 60s por sesión.
    // Cubre doble-tap accidental, refrescar y volver a tap, bots.
    // Defensa server-side adicional debería existir en el RPC.
    const { rateLimit, rateLimitRetryAfterMs } = await import(
      "../../lib/rateLimit"
    )
    if (!rateLimit("client:create-sale", { max: 3, windowMs: 60_000 })) {
      const wait = Math.ceil(
        rateLimitRetryAfterMs("client:create-sale", {
          max: 3,
          windowMs: 60_000,
        }) / 1000,
      )
      toast.error(
        `Estás haciendo muchos intentos. Espera ${wait}s y vuelve a intentar.`,
        { duration: 4000 },
      )
      return
    }

    // Modo vacaciones: tienda cerrada por decisión del admin. Mensaje
    // amigable con fecha de retorno si la configuró.
    if (bRules.shop_closed_enabled) {
      let msg = bRules.shop_closed_message?.trim() || "Estamos cerrados temporalmente"
      if (bRules.shop_closed_until) {
        try {
          const d = new Date(bRules.shop_closed_until + "T00:00:00")
          msg += ` · volvemos el ${d.toLocaleDateString("es-MX", {
            day: "numeric",
            month: "long",
          })}`
        } catch {
          /* noop */
        }
      }
      toast.error(msg, { duration: 4800 })
      return
    }

    // Regla de negocio: bloquear checkout fuera de horario comercial
    if (!isWithinBusinessHours(bRules)) {
      toast.error(
        `Tienda cerrada. Volvemos a las ${bRules.business_hours_open}. Tu carrito se guarda 💛`,
        { duration: 4200 }
      )
      return
    }

    // Regla de negocio: tope de apartados pendientes simultáneos por cliente
    const rules = getBusinessRules()
    if (rules.max_layaways_enabled) {
      const { count } = await supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("customer_email", guest.email.trim().toLowerCase())
        .eq("is_layaway", true)
        .eq("status", "pending")
      if ((count ?? 0) >= rules.max_layaways_per_client) {
        toast.error(
          `Ya tienes ${count} apartados pendientes (máx. ${rules.max_layaways_per_client}). Liquida alguno para crear otro.`
        )
        return
      }
    }

    setSubmitting(true)
    const total = totalAmt
    const tid = toast.loading("Creando tu apartado...")

    // Validación previa de stock cliente-side (defensa contra cambios
    // entre el render y el envío). Si la regla `block_oversell` está
    // apagada, permitimos pre-orden y skippeamos esta validación.
    if (bRules.block_oversell) {
      // 1) Re-fetch FRESCO del stock real desde la BD, no del state local.
      //    Esto evita el bug "puedo sumar al carrito sin stock" cuando el
      //    realtime tardó o el cliente lleva rato sin scrollear.
      try {
        const ids = repricedCart.map((c) => c.variant_id)
        const { data: freshVariants } = await supabase
          .from("variants")
          .select("id,stock,variant_name")
          .in("id", ids)
        if (freshVariants) {
          const stockById = new Map<string, number>(
            (freshVariants as any[]).map((v) => [v.id, Number(v.stock) || 0]),
          )
          const missing = repricedCart.find((c) => {
            const real = stockById.get(c.variant_id)
            return real !== undefined && c.qty > real
          })
          if (missing) {
            setSubmitting(false)
            const real = stockById.get(missing.variant_id) ?? 0
            toast.error(
              real === 0
                ? `"${missing.variant_name}" se agotó mientras armabas tu carrito. Te avisamos cuando vuelva 💛`
                : `Solo quedan ${real} de "${missing.variant_name}". Ajusta tu carrito.`,
              { id: tid, duration: 4500 },
            )
            // Sincronizamos el cart con stock real para que la UI ya no permita sumar.
            setCart((prev) =>
              prev
                .map((c) => {
                  const real = stockById.get(c.variant_id)
                  if (real === undefined) return c
                  return { ...c, stock: real, qty: Math.min(c.qty, real) }
                })
                .filter((c) => c.qty > 0),
            )
            return
          }
        }
      } catch {
        // Si el fetch falla, caemos al check con state local (mismo que antes)
      }
      const insufficient = repricedCart.find((c) => c.qty > c.stock)
      if (insufficient) {
        setSubmitting(false)
        toast.error(
          `Stock insuficiente para "${insufficient.variant_name}" (quedan ${insufficient.stock}).`,
          { id: tid },
        )
        return
      }
    }

    // sale.id se mantiene fuera del try para poder hacer rollback si algo
    // falla a mitad. Si quedó algo registrado a medias, lo borramos para
    // no dejar huérfanas (Postgres RLS permite delete por public_token
    // recién creado en la misma sesión).
    let createdSaleId: string | null = null
    try {
      // Si el cliente marcó "Es un regalo", empaquetamos los datos en
      // sales.notes con el prefijo estandarizado [REGALO] para que el
      // admin lo identifique sin cambios de schema.
      const giftNotes = giftMode
        ? buildGiftNotes(giftRecipient, giftMessage, null)
        : null

      // Si pidió empaque premium, agregamos línea descriptiva al notes
      // (sigue siendo texto libre — Mari lo lee al preparar).
      const wrapNote = useGiftWrap && bRules.gift_wrap_enabled
        ? `[EMPAQUE PREMIUM +$${bRules.gift_wrap_price}] ${bRules.gift_wrap_label}`
        : null
      // Si el cliente aplicó cupón, lo marcamos en notes para que Mari
      // lo vea en el ticket y para que `countCouponUsage` lo cuente.
      const couponNote = appliedCoupon
        ? couponMarkerForNotes(
            appliedCoupon.coupon.code,
            appliedCoupon.discount,
            appliedCoupon.coupon.type,
            appliedCoupon.coupon.amount,
          )
        : null
      const combinedNotes = [giftNotes, wrapNote, couponNote].filter(Boolean).join("\n\n") || null

      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          customer_name: guest.name.trim(),
          customer_email: guest.email.trim().toLowerCase(),
          customer_phone: guest.phone.trim() || null,
          customer_address: guest.address.trim() || null,
          customer_location: guest.locationUrl.trim() || null,
          notes: combinedNotes,
          total,
          paid: 0,
          balance: total,
          is_layaway: true,
          status: "pending",
          shipping_amount: shippingCalc.amount,
          is_foreign_shipping: isForeign,
        })
        .select()
        .single()
      if (error || !sale) throw new Error(error?.message ?? "Sin id")
      createdSaleId = sale.id

      // Si el cliente eligió usar puntos, los gastamos AHORA que ya
      // tenemos el saleId. Si falla (race condition, balance insuficiente,
      // expiraron), restauramos el total al precio sin descuento para
      // no regalar el descuento sin cobrar los puntos. Mari reportaba
      // pérdida de dinero exactamente por este flujo.
      if (loyaltyPointsToSpend > 0 && guest.email) {
        const ok = await spendLoyaltyPoints(
          guest.email.trim().toLowerCase(),
          loyaltyPointsToSpend,
          `Canjeado en folio ${sale.id.slice(0, 8).toUpperCase()}`,
          sale.id,
        )
        if (!ok) {
          // Rollback del descuento: subimos total y balance al monto
          // sin puntos. Si esto también falla, registramos warning pero
          // ya el cliente recibió el mensaje, así que mejor no abortar.
          const newTotal = totalAmt + loyaltyDiscount
          await supabase
            .from("sales")
            .update({ total: newTotal, balance: newTotal })
            .eq("id", sale.id)
          toast(
            "No pudimos aplicar tus puntos (sin saldo o expiraron). El pedido quedó al precio normal.",
            { icon: "⚠️", duration: 3500 },
          )
        }
      }

      // Insertar items + descontar stock + registrar movement por cada uno.
      // Patrón canónico (mismo que `salesService.createSale`): asegura que el
      // inventario refleje la realidad en el instante que el cliente aparta.
      // FIX CRÍTICO: antes guardábamos cost_snapshot=0 y profit=0, lo que
      // destruía el cálculo de ganancia/COGS del dashboard cada vez que un
      // cliente compraba online. Ahora usamos el costo real congelado al
      // momento del carrito.
      for (const c of repricedCart) {
        const unitCost = Math.max(0, Number(c.cost) || 0)
        const profitTotal = Math.max(0, (c.unit_price - unitCost) * c.qty)
        const { error: itemErr } = await supabase.from("sale_items").insert({
          sale_id: sale.id,
          variant_id: c.variant_id,
          product_id: c.product_id,
          product_name: c.product_name,
          variant_name: c.variant_name,
          qty: c.qty,
          tier: cartTier,
          unit_price: c.unit_price,
          cost_snapshot: unitCost,
          profit: profitTotal,
          // Preserva el flag de preventa en el histórico. Necesario para
          // que TicketView muestre el badge "Preventa" al cliente y a
          // Mari en apartados/reportes.
          is_preorder: !!c.is_preorder,
        })
        if (itemErr) throw new Error(itemErr.message)

        // Descuento atómico del stock. El RPC garantiza que si dos clientes
        // toman la última pieza al mismo tiempo, solo uno se queda con ella
        // (el segundo verá el stock real). Si la regla `block_oversell` está
        // apagada, el RPC simplemente deja stock negativo (pre-orden).
        const { error: stockErr } = await supabase.rpc("decrease_variant_stock", {
          p_variant_id: c.variant_id,
          p_qty: c.qty,
        })
        if (stockErr) {
          throw new Error(
            `No pudimos reservar "${c.variant_name}": ${stockErr.message}`,
          )
        }

        // Registro del movement para historial y conciliación (Mari ve la
        // salida en "Movimientos" igual que las ventas de mostrador).
        const { error: movErr } = await supabase.from("movements").insert({
          product_id: c.product_id ?? null,
          variant_id: c.variant_id,
          type: "salida",
          quantity: c.qty,
          sale_id: sale.id,
        })
        if (movErr) {
          // No es crítico — el stock ya bajó. Solo log para depurar.
          // No revertimos para no rebotar al cliente por un movimiento
          // de historial que no afecta su pedido.
          // eslint-disable-next-line no-console
          console.warn("[client checkout] movement insert failed", movErr.message)
        }
      }

      // Persiste datos del invitado para próximas compras
      saveGuest(guest)

      // Notifica a admins (best-effort) que entró un nuevo apartado
      await notifyAdmins({
        type: "new_layaway",
        title: `Nuevo apartado de ${guest.name.trim()}`,
        body: `Total ${formatMoney(total)} · ${repricedCart.length} producto(s). Revisa Apartados.`,
        link: "/apartados",
        metadata: {
          sale_id: sale.id,
          customer_email: guest.email.trim().toLowerCase(),
          customer_name: guest.name.trim(),
          total,
          items: repricedCart.length,
        },
      })

      sound.success()
      // Toast simple — sin botón "Ver ticket" arriba. El cliente ya va
      // directo a /mis-pedidos (logueado) o /  (invitado). Si quiere
      // abrir el ticket lo hace desde su lista o el WhatsApp que Mari
      // le mande con el link público. Antes mostrábamos `toastWithAction`
      // con CTA "Ver ticket" pero Mari pidió quitarlo.
      //
      // Duración 5s + delay 280ms antes del navigate: el navigate
      // desmonta este componente y el toast top-right vivía con él. Si
      // navegamos al instante, el toast aparece menos de 100ms (parece
      // que no salió). Con 280ms le da tiempo a aparecer ANTES del cambio
      // de página, y la duración garantiza que se vea en la siguiente.
      toast.dismiss(tid)
      toast.success("¡Listo! Tu pedido está apartado ✨", { duration: 5000 })
      setCart([])
      clearPersistedCart()
      setOpenGuestForm(false)
      setOpenCart(false)
      // Reset del modo regalo para próxima compra (es por-pedido).
      setGiftMode(false)
      setGiftRecipient("")
      setGiftMessage("")
      // UX: ya NO redirigimos al ticket. El cliente queda en su lista de
      // pedidos para que vea TODO su historial (no solo el último).
      const goNext = () => {
        if (authEmail) {
          navigate("/mis-pedidos")
        } else {
          // Cliente invitado: mantiene contexto en la tienda. El toast con
          // "Apartado creado" es la confirmación. Si quiere ver el ticket,
          // el WhatsApp que Mari le mande tendrá el link público.
          navigate("/")
        }
      }
      window.setTimeout(goNext, 280)
    } catch (e: any) {
      sound.error()
      // Mensajes amigables para errores comunes (sin exponer detalles internos).
      const raw = e?.message ?? "No se pudo apartar"
      const friendly = /no pudimos reservar|stock|insufficient|negative|check constraint/i.test(raw)
        ? "Alguien se nos adelantó y se agotó una pieza. Refrescamos tu carrito — vuelve a intentar 💛"
        : /row-level security|permission|denied/i.test(raw)
        ? "No pudimos crear el apartado por permisos. Inicia sesión o avísanos por WhatsApp."
        : /network|fetch|timeout/i.test(raw)
        ? "Sin conexión estable. Verifica tu internet e intenta de nuevo."
        : raw
      toast.error(friendly, { id: tid, duration: 4500 })
      // Compensación: si la venta quedó registrada pero falló algún paso,
      // la borramos. El trigger `restock_on_sale_cancelled` (si existe)
      // o ningún trigger (en cuyo caso ya nada se descontó) deja el
      // inventario consistente.
      if (createdSaleId) {
        try {
          await supabase
            .from("sales")
            .update({ status: "cancelled" })
            .eq("id", createdSaleId)
        } catch {
          /* mejor no hacer nada que duplicar error */
        }
      }
      // Forzamos un refresh del catálogo para que el cliente vea el stock
      // real y la UI vuelva a permitirle ajustar el carrito.
      triggerCatalogReload()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {/* Saludo skeleton */}
        <div className="mb-4 space-y-2">
          <Skeleton className="h-3 w-20" rounded="full" />
          <Skeleton className="h-8 w-48" rounded="lg" />
          <Skeleton className="h-3 w-64" rounded="full" />
        </div>
        {/* Buscador */}
        <Skeleton className="h-12 w-full mb-3" rounded="xl" />
        {/* Chips de categoría (3 chips visibles) */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton
              key={`cat-${i}`}
              className="h-8 w-16 shrink-0"
              rounded="full"
            />
          ))}
        </div>
        {/* Grid de productos — skeleton fiel a ProductCardClient: foto
            cuadrada + nombre 2 líneas + chip de precio + chip tier +
            mini-thumbnails de variantes. Asi el primer paint no "salta"
            cuando llegan los productos reales. */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800/40 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700"
            >
              <div className="relative w-full aspect-square">
                <Skeleton className="w-full h-full" rounded="sm" />
                {/* Chip de wishlist (esquina) */}
                <div className="absolute top-2 right-2">
                  <Skeleton className="w-7 h-7" rounded="full" />
                </div>
              </div>
              <div className="p-2.5 space-y-1.5">
                {/* Nombre (2 líneas) */}
                <Skeleton className="h-3 w-full" rounded="full" />
                <Skeleton className="h-3 w-3/4" rounded="full" />
                {/* Precio + chip tier */}
                <div className="flex items-center justify-between gap-1 pt-1">
                  <Skeleton className="h-4 w-12" rounded="full" />
                  <Skeleton className="h-3 w-8" rounded="full" />
                </div>
                {/* Mini-thumbs de variantes */}
                <div className="flex gap-1 pt-0.5">
                  {[0, 1, 2].map((k) => (
                    <Skeleton
                      key={`v-${k}`}
                      className="w-5 h-5"
                      rounded="full"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {/* NOTA: Hero, Banner instalación, Stories, RecentlyViewedRow y
          ProductOfTheDay se MOVIERON a `ClientHomePage` (ruta /inicio)
          para alivianar la tienda. Aquí solo dejamos: aviso "cerrado",
          carrito abandonado, buscador, filtros, ordenamiento y grid. */}

      {!shopOpen && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 px-4 py-3 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center">
            <Sparkles size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-amber-900 dark:text-amber-100 leading-tight">
              Estamos cerrados
            </p>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-tight mt-0.5">
              Horario: {bRules.business_hours_open} a {bRules.business_hours_close}. Puedes seguir explorando, los pedidos se procesan mañana.
            </p>
          </div>
        </motion.div>
      )}

      {cart.length === 0 && (
        <AbandonedCartBanner
          onResume={(lines) => {
            setCart(lines as CartLine[])
            setOpenCart(true)
          }}
        />
      )}

      <div className="flex items-center gap-2 bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl h-11 px-3 mb-2 shadow-sm">
        <Search size={16} className="text-slate-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca lipstick, sombras, base..."
          className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 shrink-0"
            aria-label="Limpiar"
          >
            <X size={11} />
          </button>
        )}
        {/* NOTA: Mari pidió simplificar el header — quitamos el botón de
            escanear código de barras y el atajo de "Pídelo a Beauty's Me"
            para que solo queden Favoritos (corazón) y Compartir tienda.
            El scanner sigue accesible desde el módulo admin / paleta y
            las sugerencias (wishes) siguen disponibles en la pestaña
            "Deseos" del dock del cliente. */}
        {wishlist.count > 0 && (
          <button
            type="button"
            onClick={() => setOnlyWishlist((v) => !v)}
            aria-label="Filtrar favoritos"
            className={`relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              onlyWishlist
                ? "bg-rose-500 text-white shadow-sm"
                : "bg-rose-50 dark:bg-rose-500/15 text-rose-500"
            }`}
          >
            <Heart size={13} fill="currentColor" />
            <span className="absolute -top-1 -right-1 text-[8px] font-black tabular-nums bg-white text-rose-600 rounded-full px-1 min-w-[14px] h-[14px] flex items-center justify-center border border-rose-300">
              {wishlist.count}
            </span>
          </button>
        )}
        {/* Compartir mi wishlist por WhatsApp/share-text. Solo aparece
            cuando el cliente está viendo SOLO sus favoritos y tiene al
            menos 1. Genera un mensaje con los productos marcados +
            link al catálogo. */}
        {onlyWishlist && wishlist.count > 0 && (
          <button
            type="button"
            onClick={async () => {
              const { shareText } = await import("../../lib/share")
              const lines = products
                .filter((p) => wishlist.has(p.id))
                .slice(0, 20)
                .map((p) => {
                  const v = p.variants[0]
                  const price =
                    v?.price_menudeo ?? v?.price ?? v?.price_medio ?? 0
                  return `- ${p.name}${price ? ` — ${formatMoney(price)}` : ""}`
                })
              const text = [
                "Mi lista de deseos en Beauty's Me",
                "",
                ...lines,
                "",
                `Ver catálogo: ${window.location.origin}/`,
              ].join("\n")
              const r = await shareText({
                title: "Mi lista de deseos",
                text,
              })
              if (r === "copied") {
                toast.success("Lista copiada al portapapeles")
              }
            }}
            aria-label="Compartir mi lista de deseos"
            title="Compartir lista por WhatsApp"
            className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 hover:bg-emerald-100"
          >
            <Share2 size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            const { shareUrl } = await import("../../lib/share")
            const r = await shareUrl({
              title: "Beauty's Me",
              text: "Mira el catálogo de Beauty's Me 💖",
              url: window.location.origin + "/",
            })
            if (r === "copied") toast.success("Link copiado al portapapeles")
            // Premio: si está logueado, gana puntos por compartir.
            // Best-effort, silencioso si la regla está apagada.
            if (authEmail && (r === "shared" || r === "copied")) {
              try {
                const { awardLoyaltyPoints } = await import(
                  "../loyalty/loyaltyService"
                )
                const got = await awardLoyaltyPoints(authEmail, "share_product")
                if (got > 0) toast.success(`+${got} pts por compartir ✨`)
              } catch {
                /* noop */
              }
            }
          }}
          aria-label="Compartir tienda"
          title="Compartir tienda"
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 active:scale-95"
        >
          <Share2 size={13} />
        </button>
      </div>

      {/* Barra sticky UNIFICADA: chips de categoría + sort + view mode + contador.
          Antes eran 3 filas separadas (categorías, sort select, view switcher +
          contador). Ahora todo cabe en una fila sticky de ~44px de alto para
          maximizar el espacio "above the fold" de los productos. El sort usa
          un <select> nativo transparente sobre un icono, así en mobile abre
          el picker del sistema (rueda iOS / dropdown Android). El contador
          solo aparece cuando hay filtros activos (búsqueda, categoría o
          favoritos), porque cuando no hay filtro simplemente ves el grid. */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 pb-2 mb-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          {/* Chips de categoría scrollables horizontal */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 scroll-container-ios">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`shrink-0 px-3 h-8 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                categoryFilter === "all"
                  ? "bg-primary text-white shadow-bloom"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500"
              }`}
            >
              Todo
            </button>
            {categories.map((c) => {
              const active = categoryFilter === c
              const { Icon } = getCategoryVisual(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                    active
                      ? "bg-primary text-white shadow-bloom"
                      : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500"
                  }`}
                >
                  <Icon size={11} />
                  {c}
                </button>
              )
            })}
          </div>

          {/* Divider vertical entre chips y controles */}
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 shrink-0" />

          {/* Sort icon-only: label envuelve un <select> nativo transparente
              encima del icono. En mobile, dispara el picker del sistema
              (rueda iOS / dropdown Android nativo). Cero click-outside JS. */}
          <label
            className={`relative shrink-0 flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-colors ${
              sortBy !== "newest"
                ? "bg-primary/10 text-primary dark:bg-primary/20"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-slate-700"
            }`}
            title="Ordenar productos"
          >
            <ArrowUpDown size={13} className="pointer-events-none" aria-hidden />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Ordenar productos"
            >
              <option value="newest">Más recientes</option>
              <option value="price_asc">Precio: menor a mayor</option>
              <option value="price_desc">Precio: mayor a menor</option>
              <option value="name">Nombre A–Z</option>
            </select>
          </label>

          {/* View mode: 3 iconos compactos (Focus / Grid / List) */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5 shrink-0">
            {([
              { id: "focus", label: "Focus", icon: Maximize2 },
              { id: "grid",  label: "Grid",  icon: LayoutGrid },
              { id: "list",  label: "Lista", icon: List },
            ] as { id: ViewMode; label: string; icon: typeof List }[]).map((m) => {
              const Icon = m.icon
              const active = viewMode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  aria-label={`Vista ${m.label}`}
                  className={`relative flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                    active
                      ? "text-white"
                      : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="shop-view-pill"
                      className="bg-brand absolute inset-0 rounded-full"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  )}
                  <Icon size={11} className="relative z-10" />
                </button>
              )
            })}
          </div>
        </div>

        {/* Contador micro — SOLO cuando hay filtro activo. Cuando no hay
            filtro, el usuario ya está viendo el catálogo completo y el
            contador es ruido. */}
        {(q || categoryFilter !== "all" || onlyWishlist) && (
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5 flex items-center gap-1.5">
            <span className="tabular-nums text-slate-600 dark:text-slate-300">
              {filtered.length}
            </span>
            <span>{filtered.length === 1 ? "producto" : "productos"}</span>
            {q && (
              <span className="italic normal-case font-semibold text-slate-500 truncate">
                · "{q}"
              </span>
            )}
            {(q || categoryFilter !== "all" || onlyWishlist) && (
              <button
                type="button"
                onClick={() => {
                  setQ("")
                  setCategoryFilter("all")
                  setOnlyWishlist(false)
                }}
                className="ml-auto shrink-0 text-primary hover:underline"
              >
                Limpiar
              </button>
            )}
          </p>
        )}
      </div>

      {/* Catálogo */}
      {filtered.length === 0 ? (
        <EmptyStateIllustration
          variant={onlyWishlist ? "cart-empty" : "no-results"}
          title={
            onlyWishlist
              ? "Aún no guardas favoritos"
              : q
              ? "No encontré nada con esa búsqueda"
              : "Sin productos en esta categoría"
          }
          subtitle={
            onlyWishlist
              ? "Toca el corazón en cualquier producto para guardarlo aquí."
              : "Prueba otra palabra o quita los filtros."
          }
          cta={
            onlyWishlist ? (
              <button
                type="button"
                onClick={() => setOnlyWishlist(false)}
                className="h-10 px-4 rounded-2xl bg-primary text-white text-[10px] font-black uppercase tracking-widest"
              >
                Ver catálogo
              </button>
            ) : undefined
          }
        />
      ) : (
        <LayoutGroup id="shop-catalog">
          {/* Carrusel de PAQUETES — visible solo si hay bundles activos.
              Mari los administra desde /admin → Paquetes. Cliente tap →
              wizard de armado con slots. Respeta el viewMode del catálogo
              para integrarse visualmente (grid = scroll horizontal,
              focus/list = lista vertical). */}
          {activeBundles.length > 0 && !q && (
            <BundlesCarousel
              bundles={activeBundles}
              onOpen={(b) => setActiveBundle(b)}
              viewMode={viewMode}
            />
          )}
          <motion.div
            layout
            className={
              viewMode === "focus"
                ? "flex flex-col gap-3 stagger-list"
                : viewMode === "grid"
                ? "grid grid-cols-2 gap-3 auto-rows-fr stagger-list"
                : "flex flex-col gap-2 stagger-list"
            }
          >
            {filtered.map((p, idx) => (
              <ProductCardClient
                key={p.id}
                product={p}
                mode={viewMode}
                isFavorite={wishlist.has(p.id)}
                priority={idx === 0}
                hidePrice={bRules.hide_prices_until_login && !isLogged}
                onToggleFavorite={() => {
                  haptic.light()
                  wishlist.toggle(p.id)
                }}
                onOpenLightbox={(variantId) => {
                  setLightboxStartVariant(variantId)
                  setLightboxProduct(p)
                  // Tracking de productos recientes (cliente solo)
                  import("../../lib/useRecentViews")
                    .then(({ trackProductView }) => {
                      const v = p.variants.find((x) => x.id === variantId) ?? p.variants[0]
                      trackProductView({
                        id: p.id,
                        name: p.name,
                        image: v?.image_urls?.[0] ?? p.image_url ?? null,
                        price: v?.price_menudeo ?? v?.price ?? 0,
                      })
                    })
                    .catch(() => {})
                }}
                onOpenBuy={(variantId) => {
                  // hide_prices_until_login: si no hay sesión, redirigimos
                  // al login antes de mostrar el sheet con precio.
                  if (bRules.hide_prices_until_login && !isLogged) {
                    toast("Inicia sesión para ver precios y comprar", {
                      icon: "🔒",
                      duration: 2400,
                    })
                    navigate("/login")
                    return
                  }
                  setBuySheetPreselectedVariant(variantId)
                  setBuySheetProduct(p)
                  import("../../lib/useRecentViews")
                    .then(({ trackProductView }) => {
                      const v = p.variants.find((x) => x.id === variantId) ?? p.variants[0]
                      trackProductView({
                        id: p.id,
                        name: p.name,
                        image: v?.image_urls?.[0] ?? p.image_url ?? null,
                        price: v?.price_menudeo ?? v?.price ?? 0,
                      })
                    })
                    .catch(() => {})
                }}
                onOpenReviews={
                  bRules.reviews_enabled
                    ? () =>
                        setReviewsFor({
                          id: p.id,
                          name: p.name,
                          image:
                            p.variants[0]?.image_urls?.[0] ??
                            p.image_url ??
                            null,
                        })
                    : undefined
                }
              />
            ))}
          </motion.div>
        </LayoutGroup>
      )}

      {/* FAB carrito eliminado — ahora vive como botón en el header del
          ShopShell (CartHeaderButton), siempre visible desde cualquier
          ruta del shop. Esto evita que el cliente "pierda" el carrito al
          navegar a /mis-pedidos o /inicio. */}

      {/* FABs flotantes lado izquierdo: AHORA solo vive WhatsAppSupportFab
          (renderizado por App.tsx para todas las rutas cliente). Antes había
          dos FABs duplicados aquí (soporte LifeBuoy + corazón "Pídelo") que
          se superponían con el de WhatsApp. Movimos "Pídelo" al header y
          quitamos LifeBuoy porque ya hay WhatsApp + botón soporte en header. */}

      {/* Drawer carrito — portal a body para escapar de cualquier
          stacking context del layout cliente (dock inferior z-50 lo
          tapaba). z-[200] queda por encima de nav, header y FAB. */}
      {createPortal(
        <AnimatePresence>
          {openCart && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200]"
            >
              <div
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                onClick={() => setOpenCart(false)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28 }}
                className="absolute left-0 right-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-[2rem] pb-safe max-h-[88vh] flex flex-col shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.45)]"
              >
              {/* Handle drag visual */}
              <div className="flex justify-center pt-2 pb-1 shrink-0">
                <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>

              {/* Header limpio: t\u00edtulo + cantidad de piezas + acciones.
                  Compartir movido al header (icon) para liberar espacio
                  vertical del footer y darle m\u00e1s scroll a la lista. */}
              <div className="flex items-center justify-between px-5 pb-2.5 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-base font-black tracking-tight">Tu carrito</h3>
                  <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                    {totalQty} {totalQty === 1 ? "pieza" : "piezas"} \u00b7{" "}
                    {repricedCart.length}{" "}
                    {repricedCart.length === 1 ? "producto" : "productos"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      if (repricedCart.length === 0) return
                      const { confirmAction } = await import("../../lib/confirm")
                      const ok = await confirmAction({
                        title: "¿Vaciar tu carrito?",
                        description: `Se eliminarán ${totalQty} ${
                          totalQty === 1 ? "pieza" : "piezas"
                        } y no se podrá deshacer. ¿Seguro?`,
                        confirmLabel: "Sí, vaciar",
                        tone: "danger",
                      })
                      if (!ok) return
                      setCart([])
                      haptic.medium()
                      toast("Carrito vaciado", { icon: "🗑️", duration: 1800 })
                    }}
                    disabled={repricedCart.length === 0}
                    aria-label="Vaciar carrito"
                    title="Vaciar carrito"
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-rose-500 press disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (repricedCart.length === 0) return
                      const { shareText } = await import("../../lib/share")
                      const lines = repricedCart.map(
                        (c) =>
                          `- ${c.qty}x ${c.product_name}${c.variant_name ? ` (${c.variant_name})` : ""} = ${formatMoney(c.qty * c.unit_price)}`,
                      )
                      const tierLabel =
                        cartTier === "menudeo"
                          ? "Precio menudeo"
                          : cartTier === "medio"
                          ? "Precio medio mayoreo"
                          : "Precio mayoreo"
                      const text = [
                        `Mi carrito en Beauty's Me`,
                        ``,
                        ...lines,
                        ``,
                        `${tierLabel}`,
                        `Total: ${formatMoney(totalAmt)}`,
                        ``,
                        `Ver cat\u00e1logo: ${window.location.origin}/`,
                      ].join("\n")
                      const r = await shareText({
                        title: "Mi carrito Beauty's Me",
                        text,
                      })
                      if (r === "copied") {
                        toast.success("Carrito copiado al portapapeles")
                      }
                    }}
                    disabled={repricedCart.length === 0}
                    aria-label="Compartir carrito"
                    title="Compartir carrito"
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-primary press disabled:opacity-40"
                  >
                    <Share2 size={14} />
                  </button>
                  <button
                    onClick={() => setOpenCart(false)}
                    aria-label="Cerrar carrito"
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 press"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Lista de items: imagen + datos + qty stepper + subtotal */}
              <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2 scroll-container-ios">
                {/* Chip de auto-VIP cuando aplica */}
                {isAutoVip && totalQty > 0 && (
                  <div className="rounded-2xl border border-amber-300/60 bg-gradient-to-r from-amber-50 to-amber-100/50 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-amber-500/5 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <span className="text-base">✨</span>
                    <div>
                      <div className="font-black uppercase tracking-widest text-[9px] leading-none mb-0.5">
                        Precio VIP automático
                      </div>
                      <div className="text-[10px] font-medium opacity-90">
                        Eres cliente frecuente — aplica precio mayoreo siempre.
                      </div>
                    </div>
                  </div>
                )}
                {/* Banner de tier del carrito — SIMPLIFICADO (rework 2026-07-02).
                    Antes mostraba una barra grande "faltan X para mayoreo"
                    calculada sobre el TOTAL del carrito. Ahora cada línea
                    tiene su propio mini-progress (ver más abajo, dentro
                    del map de items). Aquí sólo dejamos el "¡mayoreo activo!"
                    cuando TODAS las líneas están en mayoreo, como celebración
                    global. Si hay mezcla, cada línea muestra su propio badge. */}
                {savingsVsMenudeo > 0 && (
                  <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/30 p-3 flex items-center gap-2">
                    <Sparkles
                      size={14}
                      className="shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                        Estás ahorrando {formatMoney(savingsVsMenudeo)}
                      </p>
                      <p className="text-[10px] font-bold text-emerald-700/80 dark:text-emerald-300/80 leading-tight">
                        Cada tono en el carrito baja de precio por su cuenta.
                      </p>
                    </div>
                  </div>
                )}

                {/* Cupón — solo aparece si hay items en el carrito y
                    Mari tiene cupones configurados. Si no hay cupones,
                    no mostramos para no confundir con un input muerto. */}
                {totalQty > 0 && availableCoupons.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-3">
                    {appliedCoupon ? (
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <Gift size={15} strokeWidth={2.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300 leading-none">
                            Cupón aplicado
                          </p>
                          <p className="text-[13px] font-black text-slate-900 dark:text-slate-100 truncate mt-0.5">
                            {appliedCoupon.coupon.code}
                          </p>
                          <p className="text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">
                            Ahorras {formatMoney(appliedCoupon.discount)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={removeCoupon}
                          aria-label="Quitar cupón"
                          className="shrink-0 w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 dark:bg-slate-700 dark:hover:bg-rose-500/20 text-slate-500 hover:text-rose-500 dark:text-slate-300 dark:hover:text-rose-300 flex items-center justify-center transition-colors press"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                          <Gift size={11} className="text-pink-500" strokeWidth={2.5} />
                          ¿Tienes un cupón?
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={couponInput}
                            onChange={(e) =>
                              setCouponInput(e.target.value.toUpperCase().replace(/\s+/g, ""))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                applyCoupon()
                              }
                            }}
                            placeholder="CODIGO"
                            maxLength={24}
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            className="flex-1 h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm font-black tracking-wider tabular-nums uppercase outline-none focus:border-primary/50 transition-colors"
                            aria-label="Código de cupón"
                          />
                          <button
                            type="button"
                            onClick={applyCoupon}
                            disabled={couponChecking || !couponInput.trim()}
                            className="h-10 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-black uppercase tracking-widest shadow-sm disabled:opacity-50 disabled:cursor-not-allowed press flex items-center gap-1.5"
                          >
                            {couponChecking ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <>
                                Aplicar
                                <ArrowRight size={11} />
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Sticky CTA mini cuando hay muchos items: el cliente no
                    tiene que scrollear hasta el fondo para apartar. */}
                {repricedCart.length > 5 && (
                  <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={startCheckout}
                      disabled={submitting}
                      className="bg-brand w-full h-9 rounded-xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      Apartar · {formatMoney(totalAmt)}
                      <ArrowRight size={12} />
                    </button>
                  </div>
                )}

                {repricedCart.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                      <ShoppingBag size={26} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                      Aún no tienes nada
                    </p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 mb-4">
                      Agrega productos del catálogo para apartar
                    </p>
                    <div className="flex flex-col items-center gap-2 w-full px-4">
                      <button
                        type="button"
                        onClick={() => setOpenCart(false)}
                        className="bg-brand h-10 px-5 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest shadow-bloom press-hard"
                      >
                        Explorar catálogo
                      </button>
                      {/* Atajo a wishlist si tiene productos guardados —
                          mata el "empty state muerto" cuando el cliente
                          tiene favoritos pero no los recordaba. */}
                      {wishlist.count > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenCart(false)
                            navigate("/wishes")
                          }}
                          className="h-9 px-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press"
                        >
                          <Heart size={11} />
                          Ver mis favoritos ({wishlist.count})
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <AnimatePresence initial={false}>
                {repricedCart.map((c) => {
                  const lineTotal = c.qty * c.unit_price
                  // Líneas de preventa pueden subir hasta 5 piezas (cap)
                  // aunque stock=0. Sin esto, el botón + queda disabled.
                  const lineCap = c.is_preorder ? 5 : c.stock
                  const canIncrement = c.is_preorder
                    ? c.qty < 5
                    : c.stock > 0 && c.qty < c.stock

                  // Progreso al siguiente tier POR VARIANTE. Usa la
                  // cascada de umbrales (variante > producto > global)
                  // y la CANTIDAD DE ESTA LÍNEA — no el total del
                  // carrito. Coherente con el rework 2026-07-01.
                  const variant = products
                    .flatMap((p) => p.variants)
                    .find((v) => v.id === c.variant_id)
                  const productParent = products.find((p) =>
                    (p.variants ?? []).some((v) => v.id === c.variant_id),
                  )
                  const lineThresholds = resolveThresholds(
                    {
                      tier_umbral_medio: (variant as any)?.tier_umbral_medio,
                      tier_umbral_mayoreo: (variant as any)?.tier_umbral_mayoreo,
                    },
                    {
                      tier_umbral_medio: (productParent as any)?.tier_umbral_medio,
                      tier_umbral_mayoreo: (productParent as any)?.tier_umbral_mayoreo,
                    },
                    thresholds,
                  )
                  const lineTier = tierForLine(c.qty, lineThresholds)
                  const nextTierInfo = c.is_preorder
                    ? null
                    : piecesToNextTierForLine(c.qty, lineThresholds)
                  // Progreso 0-1 hacia el siguiente umbral.
                  const targetForBar = nextTierInfo
                    ? nextTierInfo.tier === "medio"
                      ? lineThresholds.medio_min_qty
                      : lineThresholds.mayoreo_min_qty
                    : 0
                  const prevTargetForBar = nextTierInfo
                    ? nextTierInfo.tier === "medio"
                      ? 1
                      : lineThresholds.medio_min_qty
                    : 0
                  const progress = nextTierInfo && targetForBar > prevTargetForBar
                    ? Math.max(
                        0,
                        Math.min(
                          1,
                          (c.qty - prevTargetForBar) /
                            (targetForBar - prevTargetForBar),
                        ),
                      )
                    : 0

                  return (
                    <motion.div
                      key={c.variant_id}
                      layout
                      initial={{ opacity: 0, x: -8, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 16, scale: 0.92, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className={`flex flex-col gap-1.5 p-2.5 rounded-2xl border overflow-hidden ${
                        c.is_preorder
                          ? "bg-fuchsia-50 dark:bg-fuchsia-500/10 border-fuchsia-200 dark:border-fuchsia-500/30"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-stretch gap-3">
                      {/* Miniatura del carrito: aspect-square + object-cover
                          garantiza cuadro 1:1 aunque la imagen sea vertical/
                          horizontal. bg neutro como respaldo si la imagen
                          tarda en cargar o es transparente. Usa la versión
                          optimizada de 96px para no cargar la HD completa. */}
                      <div className="w-14 h-14 aspect-square rounded-xl bg-slate-50 dark:bg-slate-900/40 overflow-hidden flex items-center justify-center text-slate-300 shrink-0 self-center">
                        {c.image_url ? (
                          <img
                            src={imageAvatar(c.image_url) || c.image_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            width={112}
                            height={112}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package size={20} />
                        )}
                      </div>

                      {/* Datos + qty stepper */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between gap-1">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <p className="text-[12px] font-black leading-tight truncate">
                              {c.product_name}
                            </p>
                            {c.is_preorder ? (
                              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-fuchsia-500 text-white text-[8px] font-black uppercase tracking-widest leading-none">
                                <Sparkles size={8} />
                                Preventa
                              </span>
                            ) : lineTier !== "menudeo" ? (
                              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest leading-none">
                                {lineTier === "medio" ? "Medio" : "Mayoreo"}
                              </span>
                            ) : null}
                          </div>
                          {c.variant_name && (
                            <p className="text-[10px] font-bold text-slate-500 truncate">
                              {c.variant_name}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] text-slate-500 tabular-nums">
                            {formatMoney(c.unit_price)} c/u
                            {c.is_preorder && (
                              <span className="ml-1 text-fuchsia-600 dark:text-fuchsia-400 font-black">
                                · entrega luego
                              </span>
                            )}
                          </p>
                          {/* Stepper compacto */}
                          <div className="flex items-center gap-1 bg-white dark:bg-slate-700 rounded-full border border-slate-200 dark:border-slate-600 px-1 py-0.5">
                            <button
                              onClick={() => changeQty(c.variant_id, -1)}
                              aria-label="Disminuir"
                              className="relative w-8 h-8 rounded-full text-slate-500 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-600 before:absolute before:-inset-1.5 before:content-['']"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="text-xs font-black w-5 text-center tabular-nums">
                              {c.qty}
                            </span>
                            <button
                              onClick={() => changeQty(c.variant_id, 1)}
                              aria-label="Aumentar"
                              disabled={!canIncrement}
                              className="relative w-8 h-8 rounded-full text-primary flex items-center justify-center hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed before:absolute before:-inset-1.5 before:content-['']"
                              title={
                                c.is_preorder
                                  ? `Máximo ${lineCap} en preventa`
                                  : undefined
                              }
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </div>
                        {/* Guardar para después: mueve el item del
                            carrito a wishlist sin perderlo de vista.
                            Solo aparece para clientes logueados (sin
                            login el wishlist es local y se pierde al
                            borrar app/cookies). */}
                        {isLogged && !c.is_preorder && (
                          <button
                            type="button"
                            onClick={() => {
                              wishlist.toggle(c.product_id)
                              changeQty(c.variant_id, -c.qty)
                              toast(
                                "Guardado para después en tus deseos 💖",
                                { icon: "💖", duration: 2200 },
                              )
                            }}
                            className="text-[9px] font-bold text-slate-500 hover:text-rose-500 mt-1 self-start flex items-center gap-1 press"
                            title="Mover este producto a mis deseos"
                          >
                            <Heart size={10} />
                            Guardar para después
                          </button>
                        )}
                      </div>

                      {/* Subtotal por línea (alineado a la derecha) */}
                      <div className="flex flex-col items-end justify-between text-right shrink-0">
                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                          Subtotal
                        </span>
                        <span
                          className={`text-sm font-black tabular-nums ${
                            c.is_preorder
                              ? "text-fuchsia-600 dark:text-fuchsia-400"
                              : "text-primary"
                          }`}
                        >
                          {formatMoney(lineTotal)}
                        </span>
                      </div>
                      </div>

                      {/* Mini progreso al siguiente tier POR VARIANTE.
                          Solo aparece cuando esta línea puede subir de
                          tier con sus propios umbrales. Discreto: una
                          barrita fina + texto "+N para X". Se oculta si
                          la línea es preventa (preventa no participa de
                          tier). */}
                      {nextTierInfo && (
                        <div className="flex items-center gap-2 px-1">
                          <div className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <motion.div
                              className="h-full bg-emerald-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${progress * 100}%` }}
                              transition={{ duration: 0.4, ease: "easeOut" }}
                            />
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                            +{nextTierInfo.missing}{" "}
                            {nextTierInfo.tier === "medio" ? "medio" : "mayoreo"}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
                </AnimatePresence>

                {/* ─────────── OPCIONES Y DESGLOSE — dentro del scroll ───────────
                    Mari pidió que el footer no se "comiera" la lista. Antes
                    todo esto vivía abajo (sticky shrink-0) y con 1-2 items
                    ya tapaba la mitad de la pantalla. Ahora son cards al
                    final de la lista — el cliente las ve cuando scrollea
                    hasta el fin, y el footer queda mínimo (Total + CTA). */}

                {/* Switches lado a lado: envío foráneo + regalo. */}
                <div className="flex items-center gap-2 pt-2">
                  <div
                    className={`flex-1 flex items-center justify-between gap-2 px-3 h-11 rounded-xl border transition-colors ${
                      isForeign
                        ? "border-amber-300 bg-amber-50 dark:bg-amber-500/10"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <div className="text-left min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 leading-tight">
                        Envío foráneo
                      </p>
                      {isForeign && (
                        <p className="text-[9px] text-slate-500 truncate leading-tight">
                          {shippingCalc.free
                            ? "Te toca gratis"
                            : `Cargo: ${formatMoney(shippingCalc.amount)}`}
                        </p>
                      )}
                    </div>
                    <Toggle
                      checked={isForeign}
                      onChange={setIsForeign}
                      label="Envío foráneo"
                    />
                  </div>
                  <div
                    className={`flex-1 flex items-center justify-between gap-2 px-3 h-11 rounded-xl border transition-colors ${
                      giftMode
                        ? "border-fuchsia-300 bg-fuchsia-50 dark:bg-fuchsia-500/10"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <div className="text-left min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 leading-tight">
                        Regalo
                      </p>
                      {giftMode && (
                        <p className="text-[9px] text-slate-500 truncate leading-tight">
                          Con tarjeta
                        </p>
                      )}
                    </div>
                    <Toggle
                      checked={giftMode}
                      onChange={setGiftMode}
                      label="Modo regalo"
                    />
                  </div>
                </div>

                {/* Inputs de regalo (sólo cuando está activo). */}
                <AnimatePresence initial={false}>
                  {giftMode && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 pt-1">
                        <input
                          type="text"
                          value={giftRecipient}
                          onChange={(e) => setGiftRecipient(e.target.value.slice(0, 60))}
                          placeholder="Para: (nombre del afortunado)"
                          className="w-full h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none focus:border-fuchsia-400"
                        />
                        <textarea
                          value={giftMessage}
                          onChange={(e) => setGiftMessage(e.target.value.slice(0, 240))}
                          placeholder="Mensaje en la tarjeta (opcional, máx 240)"
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold outline-none focus:border-fuchsia-400 resize-none"
                        />
                        <p className="text-[8px] text-slate-400 text-right">
                          {giftMessage.length}/240
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Desglose detallado: subtotal, envío, ahorros, descuentos,
                    puntos. Va al final del scroll para que el cliente pueda
                    revisarlo sin que tape la lista. El TOTAL "vivo" se ve
                    permanentemente en el footer sticky. */}
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-3 py-2.5 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums font-bold">
                      {formatMoney(subtotalAmt)}
                    </span>
                  </div>
                  {(isForeign || shippingCalc.amount > 0) && (
                    <div className="flex justify-between text-slate-500">
                      <span>{isForeign ? "Envío foráneo" : "Envío"}</span>
                      <span
                        className={`tabular-nums font-bold ${
                          shippingCalc.free ? "text-emerald-600" : ""
                        }`}
                      >
                        {shippingCalc.amount > 0
                          ? formatMoney(shippingCalc.amount)
                          : "Gratis"}
                      </span>
                    </div>
                  )}
                  {savingsVsMenudeo > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                      <span className="flex items-center gap-1">
                        <Sparkles size={11} />
                        Ahorro {cartTier === "mayoreo" ? "mayoreo" : "medio"}
                      </span>
                      <span className="tabular-nums">
                        -{formatMoney(savingsVsMenudeo)}
                      </span>
                    </div>
                  )}
                  {volumeDiscount > 0 && (
                    <div className="flex justify-between text-fuchsia-600 dark:text-fuchsia-400 font-bold">
                      <span className="flex items-center gap-1">
                        <Sparkles size={11} />
                        Descuento por volumen ({bRules.auto_discount_percent}%)
                      </span>
                      <span className="tabular-nums">
                        -{formatMoney(volumeDiscount)}
                      </span>
                    </div>
                  )}
                  {loyaltyCanRedeem && (
                    <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                      <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold">
                        <input
                          type="checkbox"
                          checked={useLoyalty}
                          onChange={(e) => setUseLoyalty(e.target.checked)}
                          className="w-4 h-4 accent-amber-500"
                        />
                        <span>🏆 Usar mis {loyaltyAvailable} pts</span>
                      </span>
                      {useLoyalty && loyaltyDiscount > 0 && (
                        <span className="tabular-nums font-black text-amber-700 dark:text-amber-300">
                          -{formatMoney(loyaltyDiscount)}
                        </span>
                      )}
                    </label>
                  )}
                </div>
              </div>

              {/* Estimador de envío inline — el cliente captura su CP y ve
                  costo + ETA antes de comprometerse. Reduce dramáticamente
                  la pregunta "¿cuánto cuesta y cuándo llega?". hideWhenEmpty
                  lo oculta cuando Mari no ha configurado ninguna zona. */}
              {repricedCart.length > 0 && (
                <div className="px-5 pb-2 space-y-2">
                  {bRules.gift_wrap_enabled && (
                    <label className="rounded-xl border border-pink-200 dark:border-pink-500/30 bg-pink-50/70 dark:bg-pink-500/5 px-3 py-2 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useGiftWrap}
                        onChange={(e) => setUseGiftWrap(e.target.checked)}
                        className="w-4 h-4 accent-pink-500"
                      />
                      <span className="text-base">🎁</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-black text-pink-800 dark:text-pink-200 truncate">
                          {bRules.gift_wrap_label}
                        </p>
                        <p className="text-[9px] text-pink-600 dark:text-pink-300">
                          Caja + listón + tarjeta personalizada
                        </p>
                      </div>
                      <span className="text-[12px] font-black tabular-nums text-pink-700 dark:text-pink-300 shrink-0">
                        +{formatMoney(bRules.gift_wrap_price)}
                      </span>
                    </label>
                  )}
                  <ShippingEstimator compact hideWhenEmpty />
                </div>
              )}

              {/* Footer mínimo sticky: SOLO Total + CTA. Antes vivían aquí
                  switches + desglose y comían 250px del sheet. Ahora todo
                  eso bajó al scroll → la lista de items gana ~150px. */}
              <div className="px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">
                      Total a pagar
                    </p>
                    <p
                      aria-live="polite"
                      className="font-black text-xl text-primary tabular-nums leading-none"
                    >
                      {formatMoney(totalAmt)}
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold mt-1 leading-none">
                      Apartas ahora · pagas al recoger
                    </p>
                  </div>
                  <button
                    onClick={startCheckout}
                    disabled={submitting || bRules.shop_closed_enabled || repricedCart.length === 0}
                    className={`bg-brand h-11 px-4 rounded-2xl text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-bloom disabled:opacity-50 press-hard ${
                      !(submitting || bRules.shop_closed_enabled || repricedCart.length === 0)
                        ? "cta-glow"
                        : ""
                    }`}
                  >
                    <Receipt size={13} />
                    {bRules.shop_closed_enabled ? "Cerrada" : "Apartar"}
                    {!bRules.shop_closed_enabled && <ArrowRight size={12} />}
                  </button>
                </div>

                {bRules.shop_closed_enabled && (
                  <p className="text-[10px] font-bold text-violet-600 dark:text-violet-300 text-center leading-snug">
                    {bRules.shop_closed_message?.trim() ||
                      "Volvemos pronto, tu carrito se queda guardado 💜"}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body,
      )}

      {/* Formulario de invitada */}
      <AnimatePresence>
        {openGuestForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[170]"
          >
            <div
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => !submitting && setOpenGuestForm(false)}
            />
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-premium"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-brand w-10 h-10 rounded-2xl flex items-center justify-center shadow-bloom shrink-0">
                  <Sparkles className="text-white" size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    Datos para tu apartado
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Te contactaremos por WhatsApp.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <FieldInput
                  icon={UserIcon}
                  value={guest.name}
                  onChange={(v) => setGuest({ ...guest, name: v })}
                  placeholder="Tu nombre completo"
                />
                <FieldInput
                  icon={Mail}
                  value={guest.email}
                  onChange={(v) => setGuest({ ...guest, email: v })}
                  placeholder="Tu correo"
                  type="email"
                />
                <FieldInput
                  icon={Phone}
                  value={guest.phone}
                  onChange={(v) => setGuest({ ...guest, phone: v })}
                  placeholder="WhatsApp (10 dígitos)"
                  type="tel"
                />
                <SavedAddressesSelector
                  mode="picker"
                  address={guest.address}
                  onAddressChange={(v) => setGuest({ ...guest, address: v })}
                  locationUrl={guest.locationUrl}
                  onLocationUrlChange={(v) =>
                    setGuest({ ...guest, locationUrl: v })
                  }
                />
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setOpenGuestForm(false)}
                  disabled={submitting}
                  className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={submitLayaway}
                  disabled={submitting}
                  className="bg-brand flex-1 h-11 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      Apartar <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>

              <p className="text-[9px] text-center text-slate-400 mt-3">
                Total a apartar:{" "}
                <span className="font-black text-primary">
                  {formatMoney(totalAmt)}
                </span>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sheet de compra: se abre al tocar el "+" de una card.
          Lazy + Suspense para diferir el chunk hasta el primer hover/tap. */}
      <Suspense fallback={null}>
        <BuySheet
          open={!!buySheetProduct}
          product={
            buySheetProduct
              ? ({
                  id: buySheetProduct.id,
                  name: buySheetProduct.name,
                  category: buySheetProduct.category,
                  image_url: buySheetProduct.image_url,
                  // Overrides de umbrales por producto (cascada).
                  // NOTA: la preventa ya NO vive a nivel producto (rework
                  // 2026-07-01). Cada variante lleva sus propios campos
                  // presale_* que se pasan abajo en el mapeo de variantes.
                  tier_umbral_medio: buySheetProduct.tier_umbral_medio ?? null,
                  tier_umbral_mayoreo: buySheetProduct.tier_umbral_mayoreo ?? null,
                  variants: buySheetProduct.variants.map((v) => ({
                    id: v.id,
                    product_id: v.product_id,
                    variant_name: v.variant_name,
                    stock: v.stock,
                    price: priceOf(v),
                    // Precios por tier (para que effectivePrice del sheet
                    // pueda proyectar ahorros por volumen).
                    price_menudeo: v.price_menudeo ?? null,
                    price_medio: v.price_medio ?? null,
                    price_mayoreo: v.price_mayoreo ?? null,
                    // Overrides de umbrales por variante (cascada).
                    tier_umbral_medio: v.tier_umbral_medio ?? null,
                    tier_umbral_mayoreo: v.tier_umbral_mayoreo ?? null,
                    // Preventa POR VARIANTE (rework 2026-07-01).
                    presale_active: v.presale_active ?? null,
                    presale_price: v.presale_price ?? null,
                    presale_discount_pct: v.presale_discount_pct ?? null,
                    presale_ends_at: v.presale_ends_at ?? null,
                    presale_note: v.presale_note ?? null,
                    image_url:
                      (v.image_urls && v.image_urls[0]) ??
                      v.image_url ??
                      buySheetProduct.image_url,
                    // Acceso tolerante: si la columna swatch_hex no existe
                    // en BD, simplemente queda undefined y el componente
                    // no renderiza el círculo.
                    swatch_hex: (v as any).swatch_hex ?? null,
                  })),
                } as BuySheetProduct)
              : null
          }
          initialQty={
            buySheetProduct
              ? Object.fromEntries(
                  cart
                    .filter((c) => c.product_id === buySheetProduct.id)
                    .map((c) => [c.variant_id, c.qty])
                )
              : undefined
          }
          preselectedVariantId={buySheetPreselectedVariant}
          onClose={() => {
            setBuySheetProduct(null)
            setBuySheetPreselectedVariant(null)
          }}
          onConfirm={(lines) => {
            if (buySheetProduct) addBatchToCart(buySheetProduct, lines)
            setBuySheetPreselectedVariant(null)
          }}
          blockOversell={bRules.block_oversell}
          preorderDiscountPct={bRules.preorder_discount_percent}
        />
      </Suspense>

      {/* Wizard de paquetes: el cliente eligió un bundle del carrusel.
          Lazy + Suspense: solo se carga al primer tap. */}
      <Suspense fallback={null}>
        <BundleWizard
          open={!!activeBundle}
          bundle={activeBundle}
          products={products}
          onClose={() => setActiveBundle(null)}
          onConfirm={(lines, meta) => addBundleToCart(lines, meta)}
        />
      </Suspense>

      {/* Lightbox fullscreen: se abre al tocar la imagen de una card */}
      <ProductLightbox
        open={!!lightboxProduct}
        slides={
          lightboxProduct
            ? (() => {
                const out: LightboxSlide[] = []
                for (const v of lightboxProduct.variants) {
                  const imgs =
                    v.image_urls && v.image_urls.length > 0
                      ? v.image_urls
                      : v.image_url
                      ? [v.image_url]
                      : []
                  imgs.forEach((url) =>
                    out.push({ url, variantId: v.id, variantName: v.variant_name })
                  )
                }
                // Fallback al image_url del producto si no hay nada por variante
                if (out.length === 0 && lightboxProduct.image_url) {
                  out.push({
                    url: lightboxProduct.image_url,
                    variantId: lightboxProduct.variants[0]?.id ?? "",
                    variantName: lightboxProduct.variants[0]?.variant_name ?? "",
                  })
                }
                return out
              })()
            : []
        }
        startIndex={
          lightboxProduct && lightboxStartVariant
            ? Math.max(
                0,
                lightboxProduct.variants
                  .flatMap((v) =>
                    (v.image_urls && v.image_urls.length > 0
                      ? v.image_urls
                      : v.image_url
                      ? [v.image_url]
                      : []
                    ).map((url) => ({ url, variantId: v.id }))
                  )
                  .findIndex((s) => s.variantId === lightboxStartVariant)
              )
            : 0
        }
        onClose={() => {
          setLightboxProduct(null)
          setLightboxStartVariant(null)
        }}
        onOpenBuy={() => {
          if (lightboxProduct) {
            setBuySheetPreselectedVariant(lightboxStartVariant)
            setBuySheetProduct(lightboxProduct)
            setLightboxProduct(null)
          }
        }}
      />

      {/* Modal de soporte (sin sale_id porque es desde la tienda general) */}
      <SupportModal
        open={openSupport}
        saleId={null}
        customerName={guest.name || authName || null}
        onClose={() => setOpenSupport(false)}
      />

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />

      <WishesDrawer
        open={openWishes}
        onClose={() => setOpenWishes(false)}
        defaultEmail={guest.email}
      />

      {reviewsFor && bRules.reviews_enabled && (
        <ReviewsDrawer
          open={!!reviewsFor}
          onClose={() => setReviewsFor(null)}
          productId={reviewsFor.id}
          productName={reviewsFor.name}
          productImage={reviewsFor.image}
          defaultEmail={guest.email}
        />
      )}

      <OnboardingTour />
    </div>
  )
}

function FieldInput({
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <label className="relative flex items-center bg-slate-50 dark:bg-slate-800/60 rounded-2xl h-12 px-4">
      <Icon size={14} className="text-slate-400 mr-3" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100"
      />
    </label>
  )
}

/**
 * Memorizado: en el grid del cliente con 100+ productos, cualquier
 * cambio en el padre (filtros, wishlist, etc.) re-renderiza TODAS las
 * cards. Memo + comparador por id baja eso a <16ms incluso en mobile.
 */
const ProductCardClient = memo(function ProductCardClientImpl({
  product,
  mode = "grid",
  isFavorite = false,
  priority = false,
  hidePrice = false,
  onToggleFavorite,
  onOpenLightbox,
  onOpenBuy,
  onOpenReviews,
}: {
  product: PublicProduct
  mode?: "focus" | "grid" | "list"
  isFavorite?: boolean
  /** Si true, la imagen principal usa fetchPriority alta y carga eager.
   *  Sólo el primer producto del listado lo recibe para mejorar LCP. */
  priority?: boolean
  /** Si true, oculta los precios y muestra CTA "Inicia sesión".
   *  Activado por rule.hide_prices_until_login cuando !isLogged. */
  hidePrice?: boolean
  onToggleFavorite?: () => void
  onOpenLightbox: (variantId: string) => void
  onOpenBuy: (variantId: string) => void
  onOpenReviews?: () => void
}) {
  // Variante visible (sincronizada con los chips: cambia al clic en chip)
  const [selected, setSelected] = useState<string | null>(
    product.variants[0]?.id ?? null
  )
  // Reglas del negocio para decidir si mostrar stock y label de urgencia
  // personalizado al cliente.
  const rules = useBusinessRules()
  // Quick Glance: long-press abre un popover con TODAS las variantes
  // y su stock sin entrar al lightbox. Solo se activa si hay >1 variante.
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [glanceOpen, setGlanceOpen] = useState(false)
  const [glanceRect, setGlanceRect] = useState<DOMRect | null>(null)
  const longPressHandlers = useLongPress(
    () => {
      if (product.variants.length <= 1) return
      setGlanceRect(cardRef.current?.getBoundingClientRect() ?? null)
      setGlanceOpen(true)
    },
    {
      onCancel: () => setGlanceOpen(false),
      delay: 420,
      moveThreshold: 10,
    },
  )
  const variant =
    product.variants.find((v) => v.id === selected) ?? product.variants[0]
  const price =
    variant?.price_menudeo ?? variant?.price ?? variant?.price_medio ?? 0

  if (!variant) return null

  // Preventa POR VARIANTE (rework 2026-07-01). Cada tono tiene su propia
  // preventa activada por el admin. Se aplica solo si el admin la marcó
  // explícitamente en esa variante. Ya no existe preventa "automática"
  // por stock=0 + block_oversell=off.
  const variantPresale = computePresale(variant, price)
  const variantPresaleActive = variantPresale.active
  const variantPresaleCountdown = variantPresaleActive
    ? formatPresaleCountdown(variantPresale.endsAt)
    : null

  // Reglas de stock (rework 2026-07-01):
  //   - Preventa activa en variante → botón habilitado, aunque stock=0.
  //   - Sin preventa + stock=0 + block_oversell=false → botón habilitado
  //     (vender sin stock permitido) pero SIN descuento automático.
  //   - Sin preventa + stock=0 + block_oversell=true → "Agotado".
  const outOfStock = variant.stock <= 0
  const canOversellNormal = !rules.block_oversell && outOfStock
  const allowPreorder = variantPresaleActive
  const out = outOfStock && !variantPresaleActive && !canOversellNormal

  // Precio efectivo: preventa gana; sino menudeo.
  const preorderPrice = variantPresaleActive
    ? variantPresale.effectivePrice
    : price
  const preorderPct = variantPresaleActive
    ? Math.round(variantPresale.savingPct)
    : 0
  const showPreorderPrice =
    variantPresaleActive && variantPresale.effectivePrice < price

  // Badge automático NUEVO: respeta la regla `new_badge_days` (default
  // 7 según businessRulesService). El admin puede subirlo/bajarlo desde
  // la sección "Etiquetas automáticas en cards". Si el valor llega mal
  // (0 o negativo), cae a 7 días para no perder el badge.
  const isNew = (() => {
    if (!product.created_at) return false
    const created = Date.parse(product.created_at)
    if (!created) return false
    const days = Math.max(1, Number(rules.new_badge_days) || 7)
    return Date.now() - created < days * 24 * 3600 * 1000
  })()

  // Badge OFERTA: se reactiva. La card muestra "-X%" cuando el precio
  // efectivo cae bajo el menudeo y el descuento supera el umbral
  // configurable (`offer_min_discount_pct`). Mari pidió volver a verlo
  // para que las ofertas reales destaquen sobre el resto del catálogo.
  const offerPctActual = (() => {
    const menudeo = variant.price_menudeo ?? variant.price ?? 0
    if (menudeo <= 0 || price >= menudeo) return 0
    return Math.round(((menudeo - price) / menudeo) * 100)
  })()
  const offerMinPct = Math.max(0, Math.min(50, Number(rules.offer_min_discount_pct) || 0))
  const showOfferBadge =
    !showPreorderPrice && offerPctActual >= offerMinPct && offerMinPct > 0

  // Slices para VariantImageCarousel. REGLA CRÍTICA:
  // toda variante DEBE existir en este array, aunque no tenga fotos propias,
  // para que el selectedVariantId siempre matchee. Si no tiene fotos, hereda
  // las de la primera variante con galería. Como último recurso (legacy)
  // usa product.image_url; el admin verá un banner en el drawer pidiendo
  // migrar esa foto a las variantes.
  const fallbackImages = (() => {
    const firstWithImgs = product.variants.find((v) => {
      const arr = v.image_urls && v.image_urls.length > 0
        ? v.image_urls
        : v.image_url
        ? [v.image_url]
        : []
      return arr.length > 0
    })
    if (firstWithImgs) {
      return firstWithImgs.image_urls && firstWithImgs.image_urls.length > 0
        ? firstWithImgs.image_urls
        : firstWithImgs.image_url
        ? [firstWithImgs.image_url]
        : []
    }
    return product.image_url ? [product.image_url] : []
  })()

  const carouselSafe = product.variants.map((v) => {
    const own =
      v.image_urls && v.image_urls.length > 0
        ? v.image_urls
        : v.image_url
        ? [v.image_url]
        : []
    return {
      id: v.id,
      name: v.variant_name,
      images: own.length > 0 ? own : fallbackImages,
    }
  })

  // (Anteriormente calcul\u00e1bamos `hasAnyPhoto` para un fallback que
  // ya no se usa; se elimin\u00f3 para no dejar vars muertas.)

  // \u00bfHay diferenciaci\u00f3n real entre variantes a nivel de imagen?
  // Si todas terminan con exactamente la misma primera URL (caso típico:
  // ninguna variante subió foto, todas heredan la del producto), la pill
  // "Canela / Negro / Cafe..." sobre la imagen solo confunde porque la
  // foto no cambia. La ocultamos en ese caso.
  const distinctCovers = new Set(
    carouselSafe.map((v) => v.images[0] ?? "")
  )
  const showVariantBadge =
    product.variants.length > 1 && distinctCovers.size > 1

  /* ───────── LIST MODE: fila horizontal compacta ───────── */
  if (mode === "list") {
    const cover = carouselSafe[0]?.images[0]
    return (
      <motion.div
        layoutId={`card-${product.id}`}
        whileTap={{ scale: 0.98 }}
        layout
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="bg-white dark:bg-slate-800/60 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow overflow-hidden flex items-stretch"
      >
        <motion.button
          type="button"
          onClick={() => variant && onOpenLightbox(variant.id)}
          layoutId={`img-${product.id}`}
          className="w-20 h-20 shrink-0 bg-slate-100 dark:bg-slate-700/50 relative"
          aria-label={`Ver ${product.name}`}
        >
          {cover ? (
            <img
              src={imageThumbnail(cover) || cover}
              alt={product.name}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              width={160}
              height={160}
              className={`w-full h-full object-cover ${out ? "opacity-40" : ""}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Package size={22} />
            </div>
          )}
          {/* Modo list: badges 'Nuevo' y 'Oferta' — respetan reglas
              new_badge_days y offer_min_discount_pct configurables. */}
          {isNew && (
            <div className="absolute top-1 left-1">
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md bg-white/90 dark:bg-slate-900/90 backdrop-blur text-[7px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 shadow-sm">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                Nuevo
              </span>
            </div>
          )}
          {showOfferBadge && (
            <div className={`absolute ${isNew ? "top-1 right-1" : "top-1 left-1"}`}>
              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md bg-rose-500/95 text-white text-[7px] font-black uppercase tracking-widest shadow-sm">
                -{offerPctActual}%
              </span>
            </div>
          )}
        </motion.button>
        <div className="flex-1 min-w-0 p-2.5 flex flex-col justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black truncate" title={product.name}>
              {product.name}
            </p>
            {product.variants.length > 1 && (
              <p className="text-[9px] font-bold text-slate-400">
                {product.variants.length} tonos disponibles
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-primary truncate">
              {hidePrice ? (
                <span className="text-[10px] uppercase tracking-widest text-slate-400">
                  Inicia sesión para ver precio
                </span>
              ) : showPreorderPrice ? (
                <>
                  <span className="text-violet-600 dark:text-violet-400 tabular-nums">
                    {formatMoney(preorderPrice)}
                  </span>
                  <span className="ml-1 text-[9px] font-bold text-slate-400 line-through tabular-nums">
                    {formatMoney(price)}
                  </span>
                  <span className="ml-1 text-[10px] font-black uppercase tracking-wide text-violet-600 dark:text-violet-400">
                    📦 Preventa {preorderPct}% OFF
                  </span>
                </>
              ) : (
                <>
                  {formatMoney(price)}
                  {/* Respeta show_stock_to_client + low_stock_label custom. */}
                  {!out && rules.show_stock_to_client && variant.stock <= 2 && (
                    <span
                      className={`ml-1.5 text-[10px] font-black uppercase tracking-wide ${
                        variant.stock === 1
                          ? "text-rose-600 dark:text-rose-400 animate-pulse"
                          : "text-amber-600"
                      }`}
                    >
                      {variant.stock === 1
                        ? "¡ÚLTIMA!"
                        : `${rules.low_stock_label || "Solo quedan"} 2`}
                    </span>
                  )}
                  {out && (
                    <span className="ml-1.5 text-[10px] text-rose-500 font-black uppercase tracking-wide">
                      Agotado
                    </span>
                  )}
                </>
              )}
            </span>
            <button
              onClick={() => variant && onOpenBuy(variant.id)}
              onPointerEnter={preloadBuySheet}
              onTouchStart={preloadBuySheet}
              disabled={out}
              className={`${
                allowPreorder
                  ? "bg-violet-500 hover:bg-violet-600"
                  : "bg-brand disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              } w-10 h-10 rounded-full text-white flex items-center justify-center shadow-bloom active:scale-90 transition-transform shrink-0`}
              aria-label={
                out
                  ? "Producto agotado"
                  : allowPreorder
                  ? "Apartar en preventa"
                  : "Elegir tonos"
              }
              title={
                out
                  ? "Sin stock"
                  : allowPreorder
                  ? "Apartar en preventa"
                  : "Elegir tonos"
              }
            >
              <Plus size={13} strokeWidth={3} />
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  /* ───────── GRID & FOCUS: tarjeta con carrusel agrupado por variante ───────── */
  const isFocus = mode === "focus"

  return (
    <>
      <div ref={cardRef} {...longPressHandlers} className="relative h-full">
        <motion.div
          layoutId={`card-${product.id}`}
          whileTap={{ scale: 0.99 }}
          layout
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className="h-full flex flex-col bg-white dark:bg-slate-800/60 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow"
        >
      <motion.div layoutId={`img-${product.id}`} className="relative">
        <VariantImageCarousel
          variants={carouselSafe}
          selectedVariantId={selected}
          aspect={isFocus ? "4/3" : "1/1"}
          onTap={() => variant && onOpenLightbox(variant.id)}
          className="rounded-none"
          showVariantBadge={showVariantBadge}
          priority={priority}
        />
        {/* Badges automáticos: NUEVO (regla new_badge_days) y OFERTA
            (regla offer_min_discount_pct). Si ambos aplican, NUEVO va a
            la izquierda y OFERTA un poco más a la derecha para no chocar. */}
        {isNew && (
          <div className="absolute top-2 left-2 z-10">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/90 dark:bg-slate-900/90 backdrop-blur text-[9px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 shadow-sm">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              Nuevo
            </span>
          </div>
        )}
        {showOfferBadge && (
          <div
            className={`absolute z-10 ${
              isNew ? "top-2 right-12" : "top-2 left-2"
            }`}
          >
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/95 text-white text-[9px] font-black uppercase tracking-widest shadow-sm">
              -{offerPctActual}%
            </span>
          </div>
        )}
        {/* Contador de viewers fake — psicológico para crear prueba social.
            Solo aparece si la regla está activa. La cantidad es
            determinística por product.id (siempre el mismo número para
            el mismo producto, entre 2 y 8), por eso no es tracking real
            y no necesita backend. */}
        {rules.fake_viewers_enabled && (
          <FakeViewersBadge productId={product.id} />
        )}
        {onToggleFavorite && (
          <div className="absolute top-2 right-2 z-10">
            <WishlistHeart active={isFavorite} onClick={onToggleFavorite} />
          </div>
        )}
      </motion.div>
      <div className={`flex-1 flex flex-col ${isFocus ? "p-4" : "p-3"}`}>
        {/* Nombre full-width (sin chip de resenias al lado). El rating
            se movio a una linea mini ABAJO, junto al precio, para reducir
            la saturacion visual de la header. */}
        <p
          className={`font-black truncate mb-1 ${
            isFocus ? "text-base" : "text-xs"
          }`}
          title={product.name}
        >
          {product.name}
        </p>

        {/* Variantes: si son <=4 mostramos chips compactos. Si son
            muchas, NO saturamos con chips truncados; solo decimos
            "N colores" como sub-texto sutil. El cliente abre BuySheet
            para ver todos. */}
        {product.variants.length > 1 && (
          product.variants.length <= 4 ? (
            <div className="flex flex-wrap gap-1 mb-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelected(v.id)
                  }}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-colors max-w-[140px] truncate ${
                    v.id === selected
                      ? "bg-primary text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                  }`}
                  title={v.variant_name}
                >
                  {v.variant_name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2">
              {product.variants.length} tonos disponibles
            </p>
          )
        )}

        {/* Fila PRINCIPAL: precio grande + stock/CTA. mt-auto la pega
            al fondo para que TODAS las cards tengan el CTA a la misma altura. */}
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span
              className={`block font-black text-primary leading-none tabular-nums ${
                isFocus ? "text-2xl" : "text-base"
              }`}
            >
              {hidePrice ? (
                <span className="text-[11px] uppercase tracking-widest text-slate-400 font-black">
                  Inicia sesión
                </span>
              ) : showPreorderPrice ? (
                <>
                  <span className="text-violet-600 dark:text-violet-400">
                    {formatMoney(preorderPrice)}
                  </span>
                  <span
                    className={`ml-1.5 font-bold text-slate-400 line-through tabular-nums ${
                      isFocus ? "text-sm" : "text-[10px]"
                    }`}
                  >
                    {formatMoney(price)}
                  </span>
                </>
              ) : (
                formatMoney(price)
              )}
            </span>
            {/* Mini rating SOLO si el producto tiene 3+ resenias. Con menos
                no da prueba social real y solo agrega ruido visual. */}
            {onOpenReviews && (product.review_count ?? 0) >= 3 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenReviews()
                }}
                className="mt-1 inline-flex items-center gap-1 text-[10px] font-black text-amber-600 dark:text-amber-400 press"
                aria-label={`${product.review_count} reseñas, ${(product.avg_rating ?? 0).toFixed(1)} de 5`}
                title="Ver reseñas"
              >
                <Star size={9} className="fill-amber-400 text-amber-400" />
                <span className="tabular-nums">
                  {(product.avg_rating ?? 0).toFixed(1)}
                </span>
                <span className="opacity-60 tabular-nums font-bold">
                  ({product.review_count})
                </span>
              </button>
            )}
            {/* Stock urgente: respeta la regla `show_stock_to_client`.
                Si está apagada, el cliente solo ve "Agotado" cuando no
                hay stock. Si está encendida, usamos el `low_stock_label`
                custom que Mari haya definido (ej. "Apúrate, solo quedan"). */}
            {out ? (
              <span className="inline-block text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 mt-1">
                Agotado
              </span>
            ) : allowPreorder ? (
              <span className="inline-block text-[9px] font-black uppercase tracking-widest text-fuchsia-600 dark:text-fuchsia-400 mt-1">
                Preventa{showPreorderPrice ? ` · -${preorderPct}%` : ""}
                {variantPresaleCountdown && variantPresaleCountdown !== "Vencida" && (
                  <span className="ml-1 opacity-80 normal-case tracking-normal font-bold">
                    · {variantPresaleCountdown}
                  </span>
                )}
              </span>
            ) : rules.show_stock_to_client && variant.stock <= 2 ? (
              <span
                className={`inline-block text-[9px] font-black uppercase tracking-widest mt-1 ${
                  variant.stock === 1
                    ? "text-rose-600 dark:text-rose-400 animate-pulse"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {variant.stock === 1
                  ? `¡ÚLTIMA!`
                  : `${rules.low_stock_label || "Solo quedan"} ${variant.stock}`}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (variant) onOpenBuy(variant.id)
            }}
            onPointerEnter={preloadBuySheet}
            onTouchStart={preloadBuySheet}
            disabled={out}
            className={`${
              allowPreorder
                ? "bg-violet-500 hover:bg-violet-600"
                : "bg-brand disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            } ${
              isFocus ? "w-11 h-11" : "w-9 h-9"
            } shrink-0 rounded-full text-white flex items-center justify-center shadow-bloom active:scale-90 transition-transform`}
            aria-label={
              out
                ? "Producto agotado"
                : allowPreorder
                ? "Apartar en preventa"
                : "Agregar al carrito"
            }
            title={
              out
                ? "Sin stock"
                : allowPreorder
                ? "Apartar en preventa"
                : "Agregar al carrito"
            }
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>

        {/* Sin CompactTierHint: Mari dijo no repetir info del carrito.
            La promo de mayoreo se reveal en el BuySheet/carrito con la
            barra de progreso, no en cada card del catalogo (donde solo
            ruido visual). */}
      </div>
    </motion.div>
      </div>
      <QuickGlance
        open={glanceOpen}
        productName={product.name}
        productImage={carouselSafe[0]?.images[0] ?? product.image_url ?? null}
        anchorRect={glanceRect}
        variants={product.variants.map((v) => ({
          id: v.id,
          variant_name: v.variant_name,
          price: Number(v.price ?? v.price_menudeo) || 0,
          price_menudeo: v.price_menudeo,
          stock: v.stock,
          image_url:
            v.image_urls?.[0] ?? v.image_url ?? null,
        }))}
      />
    </>
  )
})

/* ────────────────────────────────────────────────────────────────────
 * Carrusel horizontal de PAQUETES (bundles).
 * Solo visible cuando hay bundles activos en BD. Cada card abre el
 * BundleWizard donde el cliente arma su set eligiendo una variante por
 * slot. Los bundles dan descuento del N% sobre el total armado.
 *
 * Respeta el `viewMode` del catálogo:
 *  - `grid` (default): scroll horizontal compacto (cards w-44).
 *  - `focus`: lista vertical full-width (1 card por fila).
 *  - `list`: lista vertical compacta (cards más bajas).
 *
 * Bug fix 2026-06-29: el `scroll-container-ios` + `snap-mandatory`
 * capturaba el touch vertical en algunos browsers mobile (Mari reportó
 * que no podía scrollear hacia abajo cuando el carrusel estaba visible).
 * Ahora usa `touch-action: pan-x` explícito para dejar pasar pan-y al
 * scroll padre, sin snap-mandatory.
 * ──────────────────────────────────────────────────────────────────── */
function BundlesCarousel({
  bundles,
  onOpen,
  viewMode = "grid",
}: {
  bundles: Bundle[]
  onOpen: (b: Bundle) => void
  viewMode?: "focus" | "grid" | "list"
}) {
  const isVerticalList = viewMode === "focus" || viewMode === "list"
  const isCompactList = viewMode === "list"

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-2 px-0.5">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <Package size={12} className="text-primary" />
          Paquetes que puedes armar
        </h3>
        <span className="text-[9px] font-bold text-slate-400">
          {bundles.length} disponible{bundles.length === 1 ? "" : "s"}
        </span>
      </div>

      {isVerticalList ? (
        // Layout vertical: integra con el grid del catálogo. Sin scroll
        // horizontal, sin touch-action conflicts. Cards adaptan altura.
        <div className={isCompactList ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
          {bundles.map((b) => (
            <BundleCardItem
              key={b.id}
              bundle={b}
              onOpen={onOpen}
              variant={isCompactList ? "list" : "focus"}
            />
          ))}
        </div>
      ) : (
        // Layout horizontal (grid default): scroll horizontal con
        // touch-action: pan-x para no bloquear el scroll vertical del padre.
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x lift-on-hover-container"
          style={{ touchAction: "pan-x" }}
        >
          {bundles.map((b) => (
            <BundleCardItem
              key={b.id}
              bundle={b}
              onOpen={onOpen}
              variant="grid"
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Card individual de un bundle. Tres variantes según viewMode:
 *  - `grid`: card vertical compacta para scroll horizontal (w-44).
 *  - `focus`: card horizontal grande full-width (imagen izquierda, info derecha).
 *  - `list`: card horizontal compacta (más densa).
 *
 *  Visual común: imagen con gradient brand de fondo si falta, badge -X%
 *  en esquina, info de slots, hover lift. */
function BundleCardItem({
  bundle: b,
  onOpen,
  variant,
}: {
  bundle: Bundle
  onOpen: (b: Bundle) => void
  variant: "grid" | "focus" | "list"
}) {
  if (variant === "list") {
    // Horizontal compacto — imagen mini izquierda, info derecha, chevron.
    return (
      <button
        type="button"
        onClick={() => onOpen(b)}
        className="w-full flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 lift-on-hover hover:border-primary/40 text-left press"
      >
        <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-primary/15 via-violet-500/15 to-fuchsia-500/15 flex items-center justify-center text-primary">
          {b.image_url ? (
            <img
              src={b.image_url}
              alt={b.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <Package size={22} strokeWidth={1.5} />
          )}
          {b.discount_percent > 0 && (
            <span className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded-full bg-fuchsia-500 text-white text-[8px] font-black tracking-widest shadow-sm">
              -{b.discount_percent}%
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-black leading-tight line-clamp-1">
            {b.name}
          </p>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            {b.slots.length} producto{b.slots.length === 1 ? "" : "s"} a tu elección
            {b.discount_percent > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                · ahorras {b.discount_percent}%
              </span>
            )}
          </p>
        </div>
        <Package size={14} className="text-slate-300 dark:text-slate-600 shrink-0" />
      </button>
    )
  }

  if (variant === "focus") {
    // Full-width card grande — imagen tipo hero arriba, info debajo.
    return (
      <button
        type="button"
        onClick={() => onOpen(b)}
        className="w-full rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 lift-on-hover hover:border-primary/40 text-left press"
      >
        <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/15 via-violet-500/15 to-fuchsia-500/15 flex items-center justify-center text-primary">
          {b.image_url ? (
            <img
              src={b.image_url}
              alt={b.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <Package size={48} strokeWidth={1.5} />
          )}
          {b.discount_percent > 0 && (
            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-fuchsia-500 text-white text-[10px] font-black uppercase tracking-widest shadow-md">
              Ahorra {b.discount_percent}%
            </span>
          )}
        </div>
        <div className="p-3.5">
          <p className="text-sm font-black leading-tight line-clamp-2">
            {b.name}
          </p>
          {b.description && (
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              {b.description}
            </p>
          )}
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-2">
            {b.slots.length} producto{b.slots.length === 1 ? "" : "s"} a tu elección
          </p>
        </div>
      </button>
    )
  }

  // grid (default) — card vertical compacta para scroll horizontal.
  return (
    <button
      type="button"
      onClick={() => onOpen(b)}
      className="snap-start shrink-0 w-44 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 lift-on-hover hover:border-primary/40 text-left press"
    >
      <div className="relative aspect-[4/3] bg-gradient-to-br from-primary/10 via-violet-500/10 to-fuchsia-500/10 flex items-center justify-center text-primary">
        {b.image_url ? (
          <img
            src={b.image_url}
            alt={b.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <Package size={32} strokeWidth={1.5} />
        )}
        {b.discount_percent > 0 && (
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-fuchsia-500 text-white text-[8px] font-black uppercase tracking-widest shadow-sm">
            -{b.discount_percent}%
          </span>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-[11px] font-black leading-tight line-clamp-2">
          {b.name}
        </p>
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-1">
          {b.slots.length} producto{b.slots.length === 1 ? "" : "s"} a tu elección
        </p>
      </div>
    </button>
  )
}

/**
 * Mini-chip "X personas viendo esto ahora" — prueba social light.
 *
 * NO hace tracking real (eso requeriría WebSocket por producto y
 * complejidad enorme). En vez, calcula un número estable entre 2 y 8
 * con un hash determinístico del productId. El mismo producto siempre
 * muestra el mismo número durante la sesión, así no parpadea cada
 * renderize ni se ve "fake". El admin puede apagar este chip desde
 * Reglas → Experiencia → "Mostrar 'X personas viendo esto'".
 */
function FakeViewersBadge({ productId }: { productId: string }) {
  // Hash trivial del id → número entre 2 y 8. Determinístico.
  const n = (() => {
    let h = 0
    for (let i = 0; i < productId.length; i++) {
      h = (h * 31 + productId.charCodeAt(i)) & 0xffffffff
    }
    return 2 + (Math.abs(h) % 7) // 2..8
  })()
  return (
    <div className="absolute bottom-2 right-2 z-10 px-1.5 py-0.5 rounded-full bg-black/55 backdrop-blur text-white text-[8px] font-black tabular-nums flex items-center gap-1 pointer-events-none">
      <Eye size={9} strokeWidth={2.5} />
      {n}
    </div>
  )
}

/* ──────── Banner motivacional dentro del carrito ──────── */
function CartTierBanner({
  totalQty,
  cartTier,
  thresholds,
  savings,
}: {
  totalQty: number
  cartTier: "menudeo" | "medio" | "mayoreo"
  thresholds: TierThresholds
  savings: number
}) {
  if (totalQty === 0) return null

  // Si ya está en mayoreo, celebra el ahorro
  if (cartTier === "mayoreo") {
    return (
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/30 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
          ✨ ¡Precio mayoreo activo!
        </p>
        {savings > 0 && (
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
            Ahorras {formatMoney(savings)} vs. menudeo 💖
          </p>
        )}
      </div>
    )
  }

  const nextThreshold =
    cartTier === "menudeo" ? thresholds.medio_min_qty : thresholds.mayoreo_min_qty
  const nextNeeded = nextThreshold - totalQty
  const nextTier = cartTier === "menudeo" ? "medio" : "mayoreo"

  if (nextNeeded <= 0) return null

  const progressPct = Math.min(100, Math.max(0, (totalQty / nextThreshold) * 100))

  return (
    <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-200/60 dark:border-amber-500/30 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
          🎯 Te faltan {nextNeeded} {nextNeeded === 1 ? "pieza" : "piezas"}
        </p>
        <span className="text-[9px] font-black uppercase tracking-widest text-amber-700/70 dark:text-amber-300/70 tabular-nums">
          {totalQty}/{nextThreshold}
        </span>
      </div>

      {/* Barra de progreso visual al siguiente tier */}
      <div className="relative h-2 bg-amber-100/70 dark:bg-amber-500/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
        />
      </div>

      <p className="text-xs font-bold text-amber-700 dark:text-amber-300 leading-tight">
        Lleva {nextNeeded} más y desbloqueas el precio de{" "}
        <span className="font-black uppercase">{nextTier}</span> ✨
      </p>
      {savings > 0 && (
        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
          Ya ahorras {formatMoney(savings)} con tu carrito actual.
        </p>
      )}
    </div>
  )
}

/* ──────── TierHint ELIMINADO ────────
   Era codigo muerto desde hace tiempo. La info de mayoreo se
   muestra ahora unicamente en BuySheet/CartTierBanner para no
   repetir contenido en multiples superficies (principio que Mari
   pidio aplicar en toda la app).
*/

/* ──────── CompactTierHint ELIMINADA ────────
   Mari pidio no repetir info que ya vive en el carrito. El hint
   '12+ a $X / -$Y' se mostraba en CADA card del catalogo agregando
   ruido visual. Ahora la promo de mayoreo se reveal en BuySheet
   (al elegir variante) y en el CartTierBanner del drawer carrito
   con barra de progreso. Catalogo = vitrina limpia.
*/

/* ──────── ProductShareButton ELIMINADO ────────
   Mari pidió no mostrar botón de compartir individual en cada card del
   catálogo (saturaba la card y duplicaba con el share del header del
   shop, el del BuySheet y el del PublicTicketPage). El cliente que
   quiere compartir un producto lo abre y comparte desde el sheet o el
   header. Catálogo = vitrina limpia, solo wishlist heart.
*/
// (función eliminada — ver bloque "ProductShareButton ELIMINADO" arriba)


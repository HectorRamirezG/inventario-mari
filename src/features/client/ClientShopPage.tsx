import { useEffect, useState, useMemo, useDeferredValue, memo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import Fuse from "fuse.js"
import {
  Search,
  ShoppingBag,
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
  ScanLine,
  Heart,
  Star,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney } from "../../lib/format"
import { imageThumbnail } from "../../lib/imageTransform"
import { useAuth } from "../../lib/useAuth"
import { fetchMyProfile } from "../profile/profileService"
import { sound } from "../../lib/sound"
import { useWishlist } from "../../lib/useWishlist"
import SmartLocationInput from "../../components/ui/SmartLocationInput"
import VariantImageCarousel from "../../components/ui/VariantImageCarousel"
import ProductLightbox, { type LightboxSlide } from "../../components/ui/ProductLightbox"
import Skeleton from "../../components/ui/Skeleton"
import BarcodeScanner from "../../components/ui/BarcodeScanner"
import WishlistHeart from "../../components/ui/WishlistHeart"
import ClientHero from "../../components/ui/ClientHero"
import OnboardingTour from "../../components/ui/OnboardingTour"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import CategoryIcon, { getCategoryVisual } from "../../components/ui/CategoryIcon"
import AbandonedCartBanner from "../../components/ui/AbandonedCartBanner"
import { useCartPersist, clearPersistedCart, type PersistedCartLine } from "../../lib/useCartPersist"
import BuySheet, { type BuySheetProduct } from "./BuySheet"
import SupportModal from "../support/SupportModal"
import {
  useTierThresholds,
  tierForQty,
  priceForTier,
  type TierThresholds,
} from "../pricing/tierPricingService"
import {
  useShippingConfig,
  calcShipping,
} from "../pricing/shippingService"
import { getBusinessRules, useBusinessRules, isWithinBusinessHours } from "../settings/businessRulesService"
import { notifyAdmins } from "../notifications/notificationsService"
import WishesDrawer from "../wishes/WishesDrawer"
import StoriesBar from "../stories/StoriesBar"
import RecentlyViewedRow from "../../components/ui/RecentlyViewedRow"
import ReviewsDrawer from "../reviews/ReviewsDrawer"

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
}

interface PublicProduct {
  id: string
  name: string
  category: string | null
  image_url: string | null
  created_at?: string | null
  variants: PublicVariant[]
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
  const { email: authEmail, fullName: authName, session, user } = useAuth()
  const isLogged = !!session
  const thresholds = useTierThresholds()
  const shippingCfg = useShippingConfig()
  const [isForeign, setIsForeign] = useState(false)

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
  const [q, setQ] = useState("")
  // Debounce automatico del search para no recomputar fuse en cada tecla.
  const deferredQ = useDeferredValue(q)
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "name">("newest")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [cart, setCart] = useState<CartLine[]>([])
  useCartPersist(cart as PersistedCartLine[])
  const [openCart, setOpenCart] = useState(false)
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

  // Bottom Sheet de compra (estilo Shein): se abre con el botón "+" de la card
  const [buySheetProduct, setBuySheetProduct] = useState<PublicProduct | null>(null)
  const [buySheetPreselectedVariant, setBuySheetPreselectedVariant] =
    useState<string | null>(null)

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
    ;(async () => {
      // OJO: no existe products_public / variants_public en la DB real.
      // Leemos directo de products + variants (la policy `anon_all` lo permite).
      const { data: prods } = await supabase
        .from("products")
        .select("id,name,category,image_url,created_at")
        .eq("is_active", true)
        .order("name")
      const { data: vars } = await supabase
        .from("variants")
        .select("id,product_id,variant_name,sku,stock,price,price_menudeo,price_medio,price_mayoreo,image_url,image_urls")
        .eq("is_active", true)
      if (!alive) return
      const byProduct: Record<string, PublicVariant[]> = {}
      ;(vars ?? []).forEach((v: any) => {
        if (!byProduct[v.product_id]) byProduct[v.product_id] = []
        byProduct[v.product_id].push({
          ...v,
          image_url: v.image_url ?? null,
          image_urls: v.image_urls ?? null,
        } as PublicVariant)
      })
      setProducts(
        (prods ?? []).map((p: any) => ({
          ...(p as Omit<PublicProduct, "variants">),
          image_url: p.image_url ?? null,
          variants: byProduct[p.id] ?? [],
        }))
      )
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

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
      const results = fuse.search(needle).map((r) => r.item)
      const idSet = new Set(out.map((p) => p.id))
      out = results.filter((p) => idSet.has(p.id))
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

  // Tier que aplica al carrito completo (segun cantidad total)
  const cartTier = useMemo(
    () => tierForQty(totalQty, thresholds),
    [totalQty, thresholds]
  )

  // Re-calcular precios de cada línea según el tier activo
  const repricedCart = useMemo(
    () =>
      cart.map((c) => {
        // Necesitamos los precios originales de la variante para recalcular
        const variant = products
          .flatMap((p) => p.variants)
          .find((v) => v.id === c.variant_id)
        if (!variant) return c
        const newPrice = priceForTier(variant, cartTier)
        return { ...c, unit_price: newPrice }
      }),
    [cart, cartTier, products]
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

  // TOTAL = subtotal + envío
  const totalAmt = subtotalAmt + shippingCalc.amount

  // Ahorro vs menudeo (motivacional)
  const savingsVsMenudeo = useMemo(() => {
    if (cartTier === "menudeo") return 0
    const menudeoTotal = cart.reduce((acc, c) => {
      const variant = products
        .flatMap((p) => p.variants)
        .find((v) => v.id === c.variant_id)
      if (!variant) return acc + c.unit_price * c.qty
      return acc + priceForTier(variant, "menudeo") * c.qty
    }, 0)
    return Math.max(0, menudeoTotal - subtotalAmt)
  }, [cart, cartTier, subtotalAmt, products])

  function priceOf(v: PublicVariant): number {
    return v.price_menudeo ?? v.price ?? v.price_medio ?? v.price_mayoreo ?? 0
  }

  function addToCart(p: PublicProduct, v: PublicVariant) {
    if (v.stock <= 0) {
      toast.error("Sin stock")
      return
    }
    setCart((prev) => {
      const ix = prev.findIndex((c) => c.variant_id === v.id)
      if (ix >= 0) {
        const next = [...prev]
        next[ix] = {
          ...next[ix],
          qty: Math.min(next[ix].qty + 1, v.stock),
        }
        return next
      }
      return [
        ...prev,
        {
          variant_id: v.id,
          product_id: p.id,
          product_name: p.name,
          variant_name: v.variant_name,
          image_url:
            (v.image_urls && v.image_urls[0]) ??
            v.image_url ??
            p.image_url,
          unit_price: priceOf(v),
          qty: 1,
          stock: v.stock,
        },
      ]
    })
    toast.success(`+ ${p.name}`, { duration: 1500 })
  }

  /** Recibe el batch del BuySheet (varias variantes con sus cantidades) */
  function addBatchToCart(
    p: PublicProduct,
    lines: { variantId: string; qty: number }[]
  ) {
    if (lines.length === 0) return
    let added = 0
    setCart((prev) => {
      const next = [...prev]
      for (const { variantId, qty } of lines) {
        const v = p.variants.find((vv) => vv.id === variantId)
        if (!v) continue
        const safeQty = Math.min(qty, v.stock)
        if (safeQty <= 0) continue
        added += safeQty
        const ix = next.findIndex((c) => c.variant_id === variantId)
        if (ix >= 0) {
          next[ix] = { ...next[ix], qty: safeQty } // sobrescribe (no acumula): el sheet ya muestra el total
        } else {
          next.push({
            variant_id: v.id,
            product_id: p.id,
            product_name: p.name,
            variant_name: v.variant_name,
            image_url:
              (v.image_urls && v.image_urls[0]) ?? v.image_url ?? p.image_url,
            unit_price: priceOf(v),
            qty: safeQty,
            stock: v.stock,
          })
        }
      }
      return next
    })
    sound.success()
    toast.success(`✨ +${added} ${added === 1 ? "pieza" : "piezas"} al carrito`, {
      duration: 1600,
    })
    setBuySheetProduct(null)
  }

  function changeQty(variantId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.variant_id !== variantId) return c
          const next = Math.max(0, Math.min(c.stock, c.qty + delta))
          // Si intentaba sumar y ya estaba al tope, avisamos
          if (delta > 0 && next === c.qty && c.qty === c.stock) {
            toast(
              `Ya llevas las ${c.stock} piezas disponibles de ${c.variant_name} ✨`,
              { icon: "⚠️", duration: 2200 }
            )
          }
          return { ...c, qty: next }
        })
        .filter((c) => c.qty > 0)
    )
  }

  /** Inicia el proceso de apartado. Si faltan datos del invitado, abre el modal. */
  function startCheckout() {
    if (cart.length === 0) return
    const needsForm = !guest.name.trim() || !guest.email.trim() || !guest.phone.trim()
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
    try {
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          customer_name: guest.name.trim(),
          customer_email: guest.email.trim().toLowerCase(),
          customer_phone: guest.phone.trim() || null,
          customer_address: guest.address.trim() || null,
          customer_location: guest.locationUrl.trim() || null,
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

      // Insertar items con el tier ya calculado y los precios actualizados
      for (const c of repricedCart) {
        const { error: itemErr } = await supabase.from("sale_items").insert({
          sale_id: sale.id,
          variant_id: c.variant_id,
          product_id: c.product_id,
          product_name: c.product_name,
          variant_name: c.variant_name,
          qty: c.qty,
          tier: cartTier,
          unit_price: c.unit_price,
          cost_snapshot: 0,
          profit: 0,
        })
        if (itemErr) throw new Error(itemErr.message)
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
      toast.success("✨ ¡Apartado creado!", { id: tid })
      setCart([])
      clearPersistedCart()
      setOpenGuestForm(false)
      setOpenCart(false)
      // Navegación SPA hacia el ticket público (no reload)
      navigate(`/ticket/${sale.public_token ?? sale.id}`)
    } catch (e: any) {
      sound.error()
      toast.error(e?.message ?? "No se pudo apartar", { id: tid })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="pb-32">
        {/* Saludo skeleton */}
        <div className="mb-4 space-y-2">
          <Skeleton className="h-3 w-20" rounded="full" />
          <Skeleton className="h-8 w-48" rounded="lg" />
          <Skeleton className="h-3 w-64" rounded="full" />
        </div>
        <Skeleton className="h-12 w-full mb-4" rounded="xl" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800/40 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700">
              <Skeleton className="w-full aspect-square" rounded="sm" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-3 w-3/4" rounded="full" />
                <Skeleton className="h-4 w-1/2" rounded="full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24">
      <ClientHero
        customerName={guest.name || authName}
        isLogged={isLogged}
      />

      <StoriesBar enabled={bRules.stories_enabled} />

      {/* Productos vistos recientemente — solo se pinta si hay ≥2 items.
          El click abre el BuySheet del producto correspondiente.       */}
      <RecentlyViewedRow
        onOpen={(productId) => {
          const p = products.find((x) => x.id === productId)
          if (p) {
            setBuySheetPreselectedVariant(p.variants[0]?.id ?? null)
            setBuySheetProduct(p)
          }
        }}
      />

      {!shopOpen && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 px-4 py-3 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center text-base">
            🌙
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-amber-900 dark:text-amber-100 leading-tight">
              Estamos cerrados
            </p>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-tight mt-0.5">
              Horario: {bRules.business_hours_open} a {bRules.business_hours_close}. Puedes seguir explorando, los pedidos se procesan mañana ✨
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

      <div className="flex items-center gap-2 bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl h-12 px-3 mb-3 shadow-sm">
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
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          aria-label="Escanear código"
          title="Escanear código del producto"
          className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm active:scale-95 shrink-0"
        >
          <ScanLine size={14} />
        </button>
        {wishlist.count > 0 && (
          <button
            type="button"
            onClick={() => setOnlyWishlist((v) => !v)}
            aria-label="Filtrar favoritos"
            className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              onlyWishlist
                ? "bg-rose-500 text-white shadow-sm"
                : "bg-rose-50 dark:bg-rose-500/15 text-rose-500"
            }`}
          >
            <Heart size={14} fill="currentColor" />
            <span className="absolute -top-1 -right-1 text-[8px] font-black tabular-nums bg-white text-rose-600 rounded-full px-1 min-w-[14px] h-[14px] flex items-center justify-center border border-rose-300">
              {wishlist.count}
            </span>
          </button>
        )}
        {/* Pídelo a Beauty's Me — antes era FAB flotante en la izquierda,
            ahora vive aquí integrado al header para no chocar con el FAB
            de WhatsApp ni con el de carrito. Solo si wishes_enabled. */}
        {bRules.wishes_enabled && (
          <button
            type="button"
            onClick={() => setOpenWishes(true)}
            aria-label="Pídelo a Beauty's Me"
            title="Pídenos algo que no encuentras"
            className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0 active:scale-95"
            style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
          >
            <Sparkles size={14} />
          </button>
        )}
      </div>

      {/* Filtros: categoría + sort */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 mb-1 scroll-container-ios">
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
      )}

      <div className="flex items-center gap-2 mb-3">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="flex-1 h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 outline-none"
        >
          <option value="newest">Más recientes</option>
          <option value="price_asc">Precio: menor a mayor</option>
          <option value="price_desc">Precio: mayor a menor</option>
          <option value="name">Nombre A–Z</option>
        </select>
      </div>

      {/* Layout switcher */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
          {filtered.length} {filtered.length === 1 ? "producto" : "productos"}
        </p>
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-full p-0.5">
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
                className={`relative flex items-center justify-center w-9 h-8 rounded-full transition-colors ${
                  active
                    ? "text-white"
                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="shop-view-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
                    transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  />
                )}
                <Icon size={12} className="relative z-10" />
              </button>
            )
          })}
        </div>
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
          <motion.div
            layout
            className={
              viewMode === "focus"
                ? "flex flex-col gap-3 stagger-list"
                : viewMode === "grid"
                ? "grid grid-cols-2 gap-3 stagger-list"
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
                onToggleFavorite={() => wishlist.toggle(p.id)}
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

      {/* FAB carrito */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.button
            initial={{ scale: 0, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0 }}
            onClick={() => setOpenCart(true)}
            className="fixed bottom-16 right-4 z-40 h-12 rounded-2xl px-4 text-white font-black flex items-center gap-2 shadow-[0_15px_40px_-10px_rgba(230,0,126,0.5)]"
            style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
          >
            <ShoppingBag size={16} />
            <span className="text-sm">
              {totalQty} · {formatMoney(totalAmt)}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* FABs flotantes lado izquierdo: AHORA solo vive WhatsAppSupportFab
          (renderizado por App.tsx para todas las rutas cliente). Antes había
          dos FABs duplicados aquí (soporte LifeBuoy + corazón "Pídelo") que
          se superponían con el de WhatsApp. Movimos "Pídelo" al header y
          quitamos LifeBuoy porque ya hay WhatsApp + botón soporte en header. */}

      {/* Drawer carrito */}
      <AnimatePresence>
        {openCart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[160]"
          >
            <div
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
              onClick={() => setOpenCart(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28 }}
              className="absolute left-0 right-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-3xl pb-safe max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-black">Tu carrito</h3>
                <button
                  onClick={() => setOpenCart(false)}
                  className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {/* Banner motivacional de tier */}
                <CartTierBanner
                  totalQty={totalQty}
                  cartTier={cartTier}
                  thresholds={thresholds}
                  savings={savingsVsMenudeo}
                />
                {repricedCart.map((c) => (
                  <div
                    key={c.variant_id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 overflow-hidden flex items-center justify-center text-slate-300">
                      {c.image_url ? (
                        <img
                          src={c.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package size={18} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">
                        {c.product_name}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {c.variant_name}
                      </p>
                      <p className="text-xs font-black text-primary">
                        {formatMoney(c.unit_price)}
                        {cartTier !== "menudeo" && (
                          <span className="ml-1 text-[8px] text-emerald-600 uppercase tracking-widest">
                            {cartTier}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeQty(c.variant_id, -1)}
                        className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-sm font-black w-5 text-center">
                        {c.qty}
                      </span>
                      <button
                        onClick={() => changeQty(c.variant_id, 1)}
                        className="w-7 h-7 rounded-full text-white flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg,#e6007e,#a855f7)",
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                {/* Switch envío foráneo */}
                <button
                  type="button"
                  onClick={() => setIsForeign((v) => !v)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all active:scale-[0.99] ${
                    isForeign
                      ? "border-amber-300 bg-amber-50 dark:bg-amber-500/10"
                      : "border-slate-200 bg-slate-50 dark:bg-slate-800"
                  }`}
                >
                  <div className="text-left min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      📦 Envío foráneo
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">
                      {isForeign
                        ? shippingCalc.free
                          ? "¡Te toca gratis! 🎉"
                          : `Cargo: ${formatMoney(shippingCalc.amount)}`
                        : "Fuera de CDMX / EdoMex"}
                    </p>
                  </div>
                  <span
                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                      isForeign ? "bg-amber-500" : "bg-slate-300"
                    }`}
                  >
                    <motion.span
                      animate={{ x: isForeign ? 20 : 2 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                    />
                  </span>
                </button>

                {/* Desglose */}
                <div className="space-y-1 text-xs">
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
                          : "¡Gratis! 🎉"}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-base pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-slate-600 dark:text-slate-300">
                      Total
                    </span>
                    <span className="font-black text-xl">
                      {formatMoney(totalAmt)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={startCheckout}
                  disabled={submitting}
                  className="w-full h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 shadow-bloom disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg,#e6007e,#a855f7)",
                  }}
                >
                  <Receipt size={16} />
                  Apartar y generar ticket
                  <ArrowRight size={14} />
                </button>
                <p className="text-[10px] text-center text-slate-400 dark:text-slate-500">
                  Recibiremos tu apartado y te contactaremos por WhatsApp.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-bloom shrink-0"
                  style={{
                    background: "linear-gradient(135deg,#e6007e,#a855f7)",
                  }}
                >
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
                <SmartLocationInput
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
                  className="flex-1 h-11 rounded-2xl text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg,#e6007e,#a855f7)",
                  }}
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

      {/* Bottom Sheet de compra: se abre al tocar el "+" de una card */}
      <BuySheet
        open={!!buySheetProduct}
        product={
          buySheetProduct
            ? ({
                id: buySheetProduct.id,
                name: buySheetProduct.name,
                category: buySheetProduct.category,
                image_url: buySheetProduct.image_url,
                variants: buySheetProduct.variants.map((v) => ({
                  id: v.id,
                  product_id: v.product_id,
                  variant_name: v.variant_name,
                  stock: v.stock,
                  price: priceOf(v),
                  image_url:
                    (v.image_urls && v.image_urls[0]) ??
                    v.image_url ??
                    buySheetProduct.image_url,
                })),
              } as BuySheetProduct)
            : null
        }
        initialQty={
          buySheetProduct
            ? (() => {
                // 1) Pre-llenar con lo que ya esté en el carrito
                const fromCart = Object.fromEntries(
                  cart
                    .filter((c) => c.product_id === buySheetProduct.id)
                    .map((c) => [c.variant_id, c.qty])
                )
                // 2) Si hay variante preseleccionada (clic en chip o lightbox)
                //    y no estaba en el carrito, arrancar con 1
                if (
                  buySheetPreselectedVariant &&
                  fromCart[buySheetPreselectedVariant] === undefined
                ) {
                  fromCart[buySheetPreselectedVariant] = 1
                }
                return fromCart
              })()
            : undefined
        }
        onClose={() => {
          setBuySheetProduct(null)
          setBuySheetPreselectedVariant(null)
        }}
        onConfirm={(lines) => {
          if (buySheetProduct) addBatchToCart(buySheetProduct, lines)
          setBuySheetPreselectedVariant(null)
        }}
      />

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
  const variant =
    product.variants.find((v) => v.id === selected) ?? product.variants[0]
  const price =
    variant?.price_menudeo ?? variant?.price ?? variant?.price_medio ?? 0

  if (!variant) return null

  const out = variant.stock <= 0

  // Badges automáticos: NUEVO (producto creado en últimos 7 días) y
  // OFERTA (price_medio < price_menudeo). El % de descuento se calcula
  // contra el precio_menudeo (el de referencia más alto).
  const NEW_DAYS_WINDOW = 7
  const isNew = (() => {
    if (!product.created_at) return false
    const created = Date.parse(product.created_at)
    if (!created) return false
    return Date.now() - created < NEW_DAYS_WINDOW * 24 * 3600 * 1000
  })()
  const discountPct = (() => {
    const m = Number(variant?.price_menudeo) || 0
    const med = Number(variant?.price_medio) || 0
    if (m > 0 && med > 0 && med < m) {
      return Math.round(((m - med) / m) * 100)
    }
    return 0
  })()
  const onOffer = discountPct >= 5

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

  // ¿Hay AL MENOS una foto real en alguna variante o legacy?
  const hasAnyPhoto = carouselSafe.some((v) => v.images.length > 0)

  // ¿Hay diferenciación real entre variantes a nivel de imagen?
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
          {(isNew || onOffer) && (
            <div className="absolute top-1 left-1">
              {/* En thumb chico (80x80) solo mostramos UN badge prioritario:
                  oferta gana sobre nuevo para empujar acción de compra. */}
              {onOffer ? (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[7px] font-black uppercase tracking-widest shadow-sm">
                  -{discountPct}%
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[7px] font-black uppercase tracking-widest shadow-sm">
                  Nuevo
                </span>
              )}
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
              {formatMoney(price)}
              {!out && variant.stock <= 3 && (
                <span className="ml-1.5 text-[8px] text-amber-600 font-bold uppercase">
                  · {variant.stock} pz
                </span>
              )}
              {out && (
                <span className="ml-1.5 text-[8px] text-rose-500 font-black uppercase">
                  Agotado
                </span>
              )}
            </span>
            <button
              onClick={() => variant && onOpenBuy(variant.id)}
              className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-bloom active:scale-90 transition-transform shrink-0"
              style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
              aria-label="Elegir tonos"
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
    <motion.div
      layoutId={`card-${product.id}`}
      whileTap={{ scale: 0.99 }}
      layout
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className="bg-white dark:bg-slate-800/60 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow"
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
        {/* Badges esquina superior izquierda: NUEVO / OFERTA.
            Layout en fila (flex-wrap) para no apilarse verticalmente y
            no competir contra el contador X/N que vive en top-right ni
            contra la etiqueta de variante que ahora vive en bottom-left. */}
        {(isNew || onOffer) && (
          <div className="absolute top-2 left-2 z-10 flex flex-wrap items-start gap-1 max-w-[75%]">
            {isNew && (
              <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200 text-[9px] font-black uppercase tracking-widest shadow-sm border border-sky-200/60">
                Nuevo
              </span>
            )}
            {onOffer && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200 text-[9px] font-black uppercase tracking-widest shadow-sm border border-rose-200/60">
                -{discountPct}%
              </span>
            )}
          </div>
        )}
        {onToggleFavorite && (
          <div className="absolute top-2 right-2 z-10">
            <WishlistHeart active={isFavorite} onClick={onToggleFavorite} />
          </div>
        )}
      </motion.div>
      <div className={isFocus ? "p-4" : "p-3"}>
        <p
          className={`font-black truncate ${isFocus ? "text-base" : "text-xs"}`}
          title={product.name}
        >
          {product.name}
        </p>
        {product.variants.length > 1 && (
          <div className="flex flex-wrap gap-1 my-1">
            {product.variants.slice(0, isFocus ? 8 : 4).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={(e) => {
                  // Solo cambia la imagen activa; NO abre nada.
                  e.stopPropagation()
                  setSelected(v.id)
                }}
                className={`px-2 py-0.5 rounded-full ${
                  isFocus ? "text-[10px]" : "text-[9px]"
                } font-bold transition-colors ${
                  v.id === selected
                    ? "bg-primary text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                }`}
              >
                {v.variant_name}
              </button>
            ))}
            {product.variants.length > (isFocus ? 8 : 4) && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                +{product.variants.length - (isFocus ? 8 : 4)}
              </span>
            )}
          </div>
        )}
        {/* Pista de tier (mayoreo) */}
        <TierHint variant={variant} />

        {/* Botón discreto "Reseñas" (solo si la regla está activa) */}
        {onOpenReviews && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenReviews()
            }}
            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-primary transition-colors mt-1 press"
            aria-label="Ver reseñas"
          >
            <Star size={10} className="fill-amber-400 text-amber-400" />
            <span>Reseñas</span>
          </button>
        )}

        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="min-w-0 flex-1">
            <span
              className={`block font-black text-primary leading-tight ${
                isFocus ? "text-lg" : "text-sm"
              }`}
            >
              {formatMoney(price)}
            </span>
            {/* Indicador de stock inline (antes era pill flotante sobre la
                imagen, ahora vive junto al precio para que la foto quede
                limpia y la urgencia se vea junto al CTA).
                - "Agotado" se muestra SIEMPRE (no podemos engañar al cliente
                  con un agotado real).
                - El "Solo quedan X" depende de la regla `show_stock_to_client`
                  o del umbral default (≤3) si la regla está apagada. La etiqueta
                  usa `low_stock_label` configurable desde Reglas. */}
            {out ? (
              <span className="inline-block text-[9px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 mt-0.5">
                Agotado
              </span>
            ) : (rules.show_stock_to_client && variant.stock <= 10) ||
              variant.stock <= 3 ? (
              <span className="inline-block text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mt-0.5">
                {rules.low_stock_label || "Apúrate, solo quedan"} {variant.stock}{" "}
                {variant.stock === 1 ? "pieza" : "piezas"}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (variant) onOpenBuy(variant.id)
            }}
            className={`${
              isFocus ? "w-11 h-11" : "w-9 h-9"
            } shrink-0 rounded-full text-white flex items-center justify-center shadow-bloom active:scale-90 transition-transform`}
            style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
            aria-label="Agregar al carrito"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </motion.div>
  )
})

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

  const nextNeeded =
    cartTier === "menudeo"
      ? thresholds.medio_min_qty - totalQty
      : thresholds.mayoreo_min_qty - totalQty
  const nextTier = cartTier === "menudeo" ? "medio" : "mayoreo"

  if (nextNeeded <= 0) return null

  return (
    <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/30 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
        🎯 Te faltan {nextNeeded} {nextNeeded === 1 ? "pieza" : "piezas"}
      </p>
      <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mt-0.5">
        Lleva {nextNeeded} más y desbloqueas el precio de{" "}
        <span className="font-black uppercase">{nextTier}</span>.
      </p>
      {savings > 0 && (
        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1">
          Ahora mismo ya ahorras {formatMoney(savings)}.
        </p>
      )}
    </div>
  )
}

/* ──────── Pista de tier por variante (en ProductCard) ──────── */
function TierHint({ variant }: { variant: PublicVariant }) {
  const thresholds = useTierThresholds()
  const menudeo = variant.price_menudeo ?? variant.price ?? 0
  const mayoreo = variant.price_mayoreo
  if (!mayoreo || mayoreo >= menudeo) return null
  return (
    <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 truncate mb-0.5">
      Lleva {thresholds.mayoreo_min_qty}+ y pagas {formatMoney(mayoreo)} c/u
    </p>
  )
}

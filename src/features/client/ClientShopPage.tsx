import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
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
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney } from "../../lib/format"
import { useAuth } from "../../lib/useAuth"
import { sound } from "../../lib/sound"
import SmartLocationInput from "../../components/ui/SmartLocationInput"
import ImageCarousel from "../../components/ui/ImageCarousel"
import Skeleton from "../../components/ui/Skeleton"
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
  const { email: authEmail, fullName: authName, session } = useAuth()
  const isLogged = !!session
  const thresholds = useTierThresholds()
  const shippingCfg = useShippingConfig()
  const [isForeign, setIsForeign] = useState(false)

  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [openCart, setOpenCart] = useState(false)
  const [openGuestForm, setOpenGuestForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [guest, setGuest] = useState<GuestInfo>(() => loadGuest())

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
      const { data: prods } = await supabase
        .from("products_public")
        .select("id,name,category,image_url")
        .order("name")
      const { data: vars } = await supabase.from("variants_public").select("*")
      if (!alive) return
      const byProduct: Record<string, PublicVariant[]> = {}
      ;(vars ?? []).forEach((v) => {
        if (!byProduct[v.product_id]) byProduct[v.product_id] = []
        byProduct[v.product_id].push(v as PublicVariant)
      })
      setProducts(
        (prods ?? []).map((p) => ({
          ...(p as Omit<PublicProduct, "variants">),
          variants: byProduct[p.id] ?? [],
        }))
      )
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    if (!q.trim()) return products
    const needle = q.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.variants.some((v) =>
          v.variant_name.toLowerCase().includes(needle)
        )
    )
  }, [products, q])

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

  function changeQty(variantId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.variant_id === variantId
            ? { ...c, qty: Math.max(0, Math.min(c.stock, c.qty + delta)) }
            : c
        )
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

      sound.success()
      toast.success("✨ ¡Apartado creado!", { id: tid })
      setCart([])
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
      {/* Saludo */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black">
          {isLogged ? "Hola de nuevo" : "Bienvenida"}
        </p>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          {(guest.name || authName)?.split(" ")[0] ?? "Cosmética bonita"}{" "}
          <Sparkles size={18} className="text-primary" />
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Aparta tus productos favoritos sin pagar todo hoy.
        </p>
      </div>

      {/* Buscador */}
      <div className="flex items-center gap-2 bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl h-12 px-4 mb-4 shadow-sm">
        <Search size={16} className="text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca lipstick, sombras, base..."
          className="bg-transparent outline-none flex-1 text-sm font-semibold dark:text-slate-100"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400"
            aria-label="Limpiar"
          >
            <X size={11} />
          </button>
        )}
      </div>

      {/* Catálogo */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <Package size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-500">Sin resultados</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <ProductCardClient key={p.id} product={p} onAdd={addToCart} />
          ))}
        </div>
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
                  Mari recibirá tu apartado y te contactará por WhatsApp.
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
                    Mari te contactará por WhatsApp.
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

function ProductCardClient({
  product,
  onAdd,
}: {
  product: PublicProduct
  onAdd: (p: PublicProduct, v: PublicVariant) => void
}) {
  const [selected, setSelected] = useState<string | null>(
    product.variants[0]?.id ?? null
  )
  const variant =
    product.variants.find((v) => v.id === selected) ?? product.variants[0]
  const price =
    variant?.price_menudeo ?? variant?.price ?? variant?.price_medio ?? 0

  if (!variant) return null

  const out = variant.stock <= 0

  // Galería: prioriza image_urls de la variante; fallback a image_url; ú
  // fallback al image_url del producto base.
  const gallery: string[] = (() => {
    const fromVariant =
      variant.image_urls && variant.image_urls.length > 0
        ? variant.image_urls
        : variant.image_url
        ? [variant.image_url]
        : []
    if (fromVariant.length > 0) return fromVariant
    if (product.image_url) return [product.image_url]
    return []
  })()

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      layout
      className="bg-white dark:bg-slate-800/60 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow"
    >
      <div className="relative">
        <ImageCarousel
          images={gallery}
          alt={product.name}
          aspect="1/1"
          enableFullscreen
          className="rounded-none"
        />
        {out && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest z-10">
            Agotado
          </span>
        )}
        {!out && variant.stock <= 3 && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest z-10">
            ¡Últimas {variant.stock}!
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-black truncate" title={product.name}>
          {product.name}
        </p>
        {product.variants.length > 1 && (
          <div className="flex flex-wrap gap-1 my-1">
            {product.variants.slice(0, 4).map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v.id)}
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold transition-colors ${
                  v.id === selected
                    ? "bg-primary text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                }`}
              >
                {v.variant_name}
              </button>
            ))}
            {product.variants.length > 4 && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                +{product.variants.length - 4}
              </span>
            )}
          </div>
        )}
        {/* Pista de tier (mayoreo) */}
        <TierHint variant={variant} />
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm font-black text-primary">
            {formatMoney(price)}
          </span>
          <button
            onClick={() => onAdd(product, variant)}
            disabled={out}
            className="w-9 h-9 rounded-full text-white flex items-center justify-center disabled:opacity-30 shadow-bloom active:scale-90 transition-transform"
            style={{
              background: "linear-gradient(135deg,#e6007e,#a855f7)",
            }}
            aria-label="Agregar al carrito"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </motion.div>
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

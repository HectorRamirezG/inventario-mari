import { useEffect, useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Search, ShoppingBag, Package, Loader2, X, Plus, Minus, Receipt, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { formatMoney } from "../../lib/format"
import { useAuth } from "../../lib/useAuth"

// Estructura mínima para el catálogo del cliente
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

/**
 * Página de catálogo para clientes logueados (rol="client").
 * Sólo lee desde las VIEWS *_public (sin costos).
 */
export default function ClientShopPage() {
  const { email, fullName } = useAuth()
  const [products, setProducts] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [openCart, setOpenCart] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: prods } = await supabase
        .from("products_public")
        .select("id,name,category,image_url")
        .order("name")
      const { data: vars } = await supabase
        .from("variants_public")
        .select("*")
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
        p.variants.some((v) => v.variant_name.toLowerCase().includes(needle))
    )
  }, [products, q])

  const totalQty = useMemo(
    () => cart.reduce((acc, c) => acc + c.qty, 0),
    [cart]
  )
  const totalAmt = useMemo(
    () => cart.reduce((acc, c) => acc + c.qty * c.unit_price, 0),
    [cart]
  )

  function priceOf(v: PublicVariant): number {
    return v.price_menudeo ?? v.price ?? v.price_medio ?? v.price_mayoreo ?? 0
  }

  function addToCart(p: PublicProduct, v: PublicVariant) {
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
          image_url: v.image_url ?? p.image_url,
          unit_price: priceOf(v),
          qty: 1,
          stock: v.stock,
        },
      ]
    })
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

  async function submitLayaway() {
    if (cart.length === 0) return
    if (!email) {
      toast.error("Inicia sesión para apartar")
      return
    }
    const total = totalAmt
    try {
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          customer_name: fullName ?? email,
          customer_email: email,
          total,
          paid: 0,
          balance: total,
          is_layaway: true,
          status: "pending",
        })
        .select()
        .single()
      if (error || !sale) throw new Error(error?.message ?? "Sin id")

      for (const c of cart) {
        const { error: itemErr } = await supabase.from("sale_items").insert({
          sale_id: sale.id,
          variant_id: c.variant_id,
          product_id: c.product_id,
          product_name: c.product_name,
          variant_name: c.variant_name,
          qty: c.qty,
          tier: "menudeo",
          unit_price: c.unit_price,
          cost_snapshot: 0,
          profit: 0,
        })
        if (itemErr) throw new Error(itemErr.message)
      }
      toast.success("Apartado creado ✓")
      setCart([])
      setOpenCart(false)
      // redirigir a mis pedidos
      window.location.href = `/ticket/${sale.public_token ?? sale.id}`
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo apartar")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="pb-32">
      {/* Saludo */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-black">
          Hola
        </p>
        <h1 className="text-2xl font-black tracking-tight">
          {fullName?.split(" ")[0] ?? "Cliente"}
        </h1>
        <p className="text-sm text-slate-500">
          Arma tu carrito y aparta tus productos.
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-2xl h-12 px-4 mb-4">
        <Search size={16} className="text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Busca lipstick, sombras..."
          className="bg-transparent outline-none flex-1 text-sm font-semibold"
        />
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-3">
        {filtered.map((p) => (
          <ProductCardClient key={p.id} product={p} onAdd={addToCart} />
        ))}
      </div>

      {/* FAB carrito */}
      {cart.length > 0 && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setOpenCart(true)}
          className="fixed bottom-24 right-4 z-40 h-14 rounded-2xl px-5 text-white font-black flex items-center gap-3 shadow-bloom"
          style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
        >
          <ShoppingBag size={18} />
          <span>{totalQty} · {formatMoney(totalAmt)}</span>
        </motion.button>
      )}

      {/* Drawer carrito */}
      {openCart && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[160]"
        >
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setOpenCart(false)}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
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
              {cart.map((c) => (
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
                    <p className="text-sm font-bold truncate">{c.product_name}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {c.variant_name}
                    </p>
                    <p className="text-xs font-black text-primary">
                      {formatMoney(c.unit_price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQty(c.variant_id, -1)}
                      className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="text-sm font-black w-5 text-center">{c.qty}</span>
                    <button
                      onClick={() => changeQty(c.variant_id, 1)}
                      className="w-7 h-7 rounded-full text-white flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-base">
                <span className="font-bold text-slate-600">Total</span>
                <span className="font-black text-xl">{formatMoney(totalAmt)}</span>
              </div>
              <button
                onClick={submitLayaway}
                className="w-full h-12 rounded-2xl text-white font-black flex items-center justify-center gap-2 shadow-bloom"
                style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
              >
                <Receipt size={16} />
                Apartar y generar ticket
                <ArrowRight size={14} />
              </button>
              <p className="text-[10px] text-center text-slate-400">
                El admin recibirá tu apartado y te contactará por WhatsApp.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
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

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="bg-white dark:bg-slate-800/60 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700"
    >
      <div
        className="aspect-square bg-slate-100 dark:bg-slate-700 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#fdf2f8,#faf5ff)" }}
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary/40">
            <Package size={36} />
          </div>
        )}
        {variant.stock <= 0 && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase">
            Agotado
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-black truncate">{product.name}</p>
        {product.variants.length > 1 && (
          <div className="flex flex-wrap gap-1 my-1">
            {product.variants.slice(0, 4).map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v.id)}
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  v.id === selected
                    ? "bg-primary text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                }`}
              >
                {v.variant_name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm font-black text-primary">
            {formatMoney(price)}
          </span>
          <button
            onClick={() => onAdd(product, variant)}
            disabled={variant.stock <= 0}
            className="w-8 h-8 rounded-full text-white flex items-center justify-center disabled:opacity-30"
            style={{ background: "linear-gradient(135deg,#e6007e,#a855f7)" }}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

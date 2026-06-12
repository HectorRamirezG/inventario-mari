import { useEffect, useMemo, useState, useCallback } from "react"
import { toast } from "react-hot-toast"

import { catalogService, type CatalogItem } from "./catalogService"
import { bundlesRepo } from "../bundles/bundleService"
import { createSale, type SaleItemPayload, type SaleBundlePayload } from "./salesService"
import { getPricingConfig } from "../pricing/pricingConfigService"
import { PriceCalculator, defaultPricingConfig } from "../../lib/pricing"

import type { Bundle, PricingConfig, Tier } from "../../types/database"

/* ─────────────── Tipos del carrito ─────────────── */
export interface CartVariantLine {
  kind: "variant"
  variant_id: string
  product_id: string | null
  name: string
  variant_name: string
  qty: number
  unit_price: number
  base_price_menudeo: number
  base_price_medio: number
  base_price_mayoreo: number
  cost: number
  stock: number
  tier: Tier
}

export interface CartBundleLine {
  kind: "bundle"
  bundle_id: string
  name: string
  qty: number
  unit_price: number
  pieces_per_unit: number
}

export type CartLine = CartVariantLine | CartBundleLine

function priceFromTier(line: CartVariantLine, tier: Tier): number {
  const p =
    tier === "mayoreo" ? line.base_price_mayoreo :
    tier === "medio"   ? line.base_price_medio   :
                         line.base_price_menudeo
  return p > 0 ? p : line.base_price_menudeo
}

export function useSalesPage() {
  const [config, setConfig] = useState<PricingConfig>(defaultPricingConfig)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(false)

  const [cart, setCart] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState("")
  const [paid, setPaid] = useState<number | string>(0)

  useEffect(() => {
    Promise.all([
      getPricingConfig(),
      catalogService.all(),
      bundlesRepo.listActive(),
    ]).then(([cfg, cat, bs]) => {
      setConfig(cfg)
      setCatalog(cat)
      setBundles(bs)
    })
  }, [])

  const calculator = useMemo(() => new PriceCalculator(config), [config])

  const totalPieces = useMemo(() => cart.reduce((acc, l) => {
    if (l.kind === "variant") return acc + l.qty
    return acc + (l.pieces_per_unit * l.qty)
  }, 0), [cart])

  const cartTier: Tier = useMemo(() => calculator.tierFor(totalPieces), [calculator, totalPieces])

  /** Re-aplica el tier global a cada línea de variante */
  useEffect(() => {
    setCart(prev => prev.map(l => {
      if (l.kind !== "variant") return l
      const unit_price = priceFromTier(l, cartTier)
      return { ...l, unit_price, tier: cartTier }
    }))
  }, [cartTier])

  const total = useMemo(
    () => cart.reduce((acc, l) => acc + l.unit_price * l.qty, 0),
    [cart]
  )

  const balance = useMemo(() => {
    const p = typeof paid === "string" ? parseFloat(paid) || 0 : paid
    return Math.max(0, total - p)
  }, [total, paid])

  const upsellHint = useMemo(() => {
    const gap = calculator.nextTierGap(totalPieces)
    if (!gap || cart.length === 0) return null
    let savings = 0
    for (const l of cart) {
      if (l.kind !== "variant") continue
      const newPrice = priceFromTier(l, gap.nextTier)
      savings += (l.unit_price - newPrice) * l.qty
    }
    return { missing: gap.missing, nextTier: gap.nextTier, savings: Math.max(0, savings) }
  }, [calculator, totalPieces, cart])

  /* Acciones */
  const addVariant = useCallback((v: CatalogItem) => {
    setCart(prev => {
      const existing = prev.find(l => l.kind === "variant" && l.variant_id === v.id)
      if (existing) {
        return prev.map(l =>
          l.kind === "variant" && l.variant_id === v.id ? { ...l, qty: l.qty + 1 } : l
        )
      }
      const cost = Number(v.effective_cost ?? 0)
      const line: CartVariantLine = {
        kind: "variant",
        variant_id: v.id,
        product_id: v.product?.id ?? null,
        name: v.product?.name ?? "",
        variant_name: v.variant_name,
        qty: 1,
        base_price_menudeo: v.price_menudeo > 0 ? v.price_menudeo : v.price,
        base_price_medio:   v.price_medio,
        base_price_mayoreo: v.price_mayoreo,
        unit_price:         v.price_menudeo > 0 ? v.price_menudeo : v.price,
        cost,
        stock: v.stock,
        tier: "menudeo",
      }
      return [...prev, line]
    })
  }, [])

  const addBundle = useCallback((b: Bundle) => {
    const piecesPerUnit = b.counts_as_wholesale
      ? (b.items ?? []).reduce((a, i) => a + i.qty, 0)
      : 1
    setCart(prev => {
      const existing = prev.find(l => l.kind === "bundle" && l.bundle_id === b.id)
      if (existing) {
        return prev.map(l =>
          l.kind === "bundle" && l.bundle_id === b.id ? { ...l, qty: l.qty + 1 } : l
        )
      }
      const line: CartBundleLine = {
        kind: "bundle",
        bundle_id: b.id,
        name: b.name,
        qty: 1,
        unit_price: Number(b.price ?? 0),
        pieces_per_unit: piecesPerUnit,
      }
      return [...prev, line]
    })
  }, [])

  const updateQty = useCallback((key: string, qty: number) => {
    if (qty < 1) return
    setCart(prev => prev.map(l => {
      if (l.kind === "variant" && l.variant_id === key) return { ...l, qty }
      if (l.kind === "bundle"  && l.bundle_id  === key) return { ...l, qty }
      return l
    }))
  }, [])

  const remove = useCallback((key: string) => {
    setCart(prev => prev.filter(l =>
      !(l.kind === "variant" && l.variant_id === key) &&
      !(l.kind === "bundle"  && l.bundle_id  === key)
    ))
  }, [])

  const clear = useCallback(() => {
    setCart([]); setCustomer(""); setPaid(0)
  }, [])

  const handleSave = useCallback(async () => {
    if (cart.length === 0) return toast.error("Carrito vacío")

    const items: SaleItemPayload[] = cart
      .filter((l): l is CartVariantLine => l.kind === "variant")
      .map(l => ({
        variant_id: l.variant_id,
        product_id: l.product_id,
        name: l.name,
        variant_name: l.variant_name,
        qty: l.qty,
        unit_price: l.unit_price,
        cost: l.cost,
        tier: l.tier,
      }))

    const bundlesPayload: SaleBundlePayload[] = cart
      .filter((l): l is CartBundleLine => l.kind === "bundle")
      .map(l => ({ bundle_id: l.bundle_id, name: l.name, qty: l.qty, unit_price: l.unit_price }))

    setLoading(true)
    try {
      await createSale({
        customer: customer.trim(),
        paid: typeof paid === "string" ? parseFloat(paid) || 0 : paid,
        items,
        bundles: bundlesPayload,
      })
      toast.success("Venta registrada ✨")
      clear()
      const cat = await catalogService.all()
      setCatalog(cat)
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar la venta")
    } finally {
      setLoading(false)
    }
  }, [cart, customer, paid, clear])

  return {
    state: {
      catalog, bundles, cart, total, balance,
      customer, paid, loading, totalPieces, cartTier, upsellHint,
    },
    actions: {
      addVariant, addBundle, updateQty, remove,
      setCustomer, setPaid, handleSave, clear,
    },
  }
}

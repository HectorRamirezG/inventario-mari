// =====================================================
//  Tipos del dominio (espejo del esquema Supabase v2)
// =====================================================

export type Tier = "menudeo" | "medio" | "mayoreo"
export type MovementType = "entrada" | "salida" | "ajuste"
export type SaleStatus = "paid" | "pending" | "cancelled"

export interface Product {
  id: string
  name: string
  category: string | null
  cost: number | null
  min_stock: number | null
  is_active: boolean
  created_at?: string
  variants?: Variant[]
}

export interface Variant {
  id: string
  product_id: string
  variant_name: string
  sku: string | null
  stock: number
  cost_override: number | null
  price: number
  price_menudeo: number
  price_medio: number
  price_mayoreo: number
  is_active: boolean
  /** Calculado en cliente: cost_override ?? product.cost */
  effective_cost?: number | null
}

export interface PricingConfig {
  id: 1
  margen_menudeo: number
  margen_medio: number
  margen_mayoreo: number
  umbral_medio: number
  umbral_mayoreo: number
  costo_extra: number
}

export interface Bundle {
  id: string
  name: string
  description: string | null
  price: number
  counts_as_wholesale: boolean
  is_active: boolean
  created_at?: string
  items?: BundleItem[]
}

export interface BundleItem {
  id: string
  bundle_id: string
  variant_id: string
  qty: number
  variant?: Variant & { product?: Product }
}

export interface Sale {
  id: string
  customer_name: string | null
  total: number
  paid: number
  balance: number
  status: SaleStatus
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  variant_id: string | null
  product_id: string | null
  bundle_id: string | null
  product_name: string | null
  variant_name: string | null
  qty: number
  tier: Tier
  unit_price: number
  cost_snapshot: number
  profit: number
  is_bundle: boolean
}

export {}

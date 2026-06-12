import { supabase } from "../../lib/supabase"
import type { Tier } from "../../types/database"

export interface SaleItemPayload {
  variant_id: string
  product_id?: string | null
  name: string
  variant_name: string
  qty: number
  unit_price: number
  cost: number
  tier: Tier
}

export interface SaleBundlePayload {
  bundle_id: string
  name: string
  qty: number
  unit_price: number
}

export interface SalePayload {
  customer: string
  paid: number
  items: SaleItemPayload[]
  bundles?: SaleBundlePayload[]
}

/**
 * Servicio de ventas. Usa una sola RPC atómica:
 * - inserta sale + sale_items + payments
 * - descuenta stock (incluye componentes de bundles)
 * - registra movements
 * Todo o nada.
 */
export class SalesService {
  async create(payload: SalePayload): Promise<string> {
    const { data, error } = await supabase.rpc("create_sale_atomic", {
      payload: payload as unknown as Record<string, unknown>,
    })
    if (error) {
      console.error("[sales] create_sale_atomic:", error.message)
      throw new Error(error.message)
    }
    return data as string
  }
}

export const salesService = new SalesService()
export const createSale = (p: SalePayload) => salesService.create(p)

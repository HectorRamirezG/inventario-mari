import { supabase } from "../../lib/supabase"
import type { MovementType } from "../../types/database"

/** Tipos de movimiento expuestos en la UI ("venta" se mapea a "salida"). */
export type UiMovementType = "entrada" | "venta" | "ajuste"

const toDb = (t: UiMovementType): MovementType =>
  t === "venta" ? "salida" : (t as MovementType)

export class MovementsService {
  async apply(params: { variantId: string; type: UiMovementType; quantity: number }) {
    const { data, error } = await supabase.rpc("apply_movement", {
      p_variant_id: params.variantId,
      p_type:       toDb(params.type),
      p_qty:        params.quantity,
    })
    if (error) { console.error("[movements] apply:", error.message); throw error }
    return data as number
  }
}

export const movementsService = new MovementsService()
export const applyMovement = (p: { variantId: string; type: UiMovementType; quantity: number }) =>
  movementsService.apply(p)

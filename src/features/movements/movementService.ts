import { supabase } from "../../lib/supabase";

export type MovementType = "entrada" | "venta";

export async function applyMovement(params: {
  variantId: string;
  type: MovementType;
  quantity: number;
}) {
  // Traducimos 'venta' a 'salida' antes de enviar a la DB
  const dbType = params.type === "venta" ? "salida" : "entrada";

  const { data, error } = await supabase.rpc("apply_movement", {
    p_variant_id: params.variantId,
    p_type: dbType,
    p_qty: params.quantity,
  });

  if (error) {
    console.error("Error en RPC apply_movement:", error.message);
    throw error;
  }
  return data as number;
}
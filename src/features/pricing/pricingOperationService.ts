import { supabase } from "../../lib/supabase";
import type { PricingTier } from "./pricingTypes";
import { debug } from "../../lib/debug";

export interface PricingOperationPayload {
  product_id: string;
  quantity: number;
  extra_cost: number;
  tier: PricingTier;
  cost_unit: number;
  cost_final: number;
  price_menudeo: number;
  price_medio: number;
  price_mayoreo: number;
  price_applied: number;
  total: number;
  product_name_snapshot?: string;
  created_at?: string;
}

/**
 * Guarda una sola operación (botón individual por fila)
 */
export async function savePricingOperation(r: any) {
  if (!r?.productId) throw new Error("Fila inválida: falta productId");

  const payload: PricingOperationPayload = {
    product_id: r.productId,
    quantity: Number(r.quantity) || 0,
    extra_cost: Number(r.manualExtraCost) || 0,
    tier: r.tierApplied || "menudeo",
    cost_unit: Number(r.product?.cost) || 0,
    cost_final: Number(r.totalOperatingCost) || 0,
    price_menudeo: Number(r.suggestedPrices?.menudeo) || 0,
    price_medio: Number(r.suggestedPrices?.medio) || 0,
    price_mayoreo: Number(r.suggestedPrices?.mayoreo) || 0,
    price_applied: Number(r.manualPrice || r.finalPrice) || 0,
    total:
      (Number(r.manualPrice || r.finalPrice) || 0) *
      (Number(r.quantity) || 0),
    product_name_snapshot: r.product?.name || "",
    created_at: new Date().toISOString(),
  };

  if (!payload.product_id || payload.price_applied <= 0) {
    throw new Error("Datos inválidos: producto o precio");
  }

  const { error, data } = await supabase
    .from("pricing_operations")
    .insert([payload])
    .select();

  if (error) {
    debug.error("Error al guardar operación:", error.message);
    throw error;
  }

  return data;
}

/**
 * Guarda múltiples operaciones (botón "Guardar Todo")
 */
export async function saveMultipleOperations(rows: any[]) {
  if (!rows || rows.length === 0) return;

  // 1. Filtrar filas válidas
  const validRows = rows.filter(
    (r) => r.productId && (r.manualPrice || r.finalPrice)
  );

  if (validRows.length === 0) {
    debug.error("No hay filas válidas para guardar");
    return;
  }

  // 2. Mapear exactamente con tu lógica actual (computed)
  const payload: PricingOperationPayload[] = validRows.map((r) => ({
    product_id: r.productId,
    quantity: Number(r.quantity) || 0,
    extra_cost: Number(r.manualExtraCost) || 0,
    tier: r.tierApplied || "menudeo",

    cost_unit: Number(r.product?.cost) || 0,
    cost_final: Number(r.totalOperatingCost) || 0,

    price_menudeo: Number(r.suggestedPrices?.menudeo) || 0,
    price_medio: Number(r.suggestedPrices?.medio) || 0,
    price_mayoreo: Number(r.suggestedPrices?.mayoreo) || 0,

    price_applied: Number(r.manualPrice || r.finalPrice) || 0,

    total:
      (Number(r.manualPrice || r.finalPrice) || 0) *
      (Number(r.quantity) || 0),

    product_name_snapshot: r.product?.name || "",
    created_at: new Date().toISOString(),
  }));

  // 3. Inserción
  const { error, data } = await supabase
    .from("pricing_operations")
    .insert(payload)
    .select();

  if (error) {
    debug.error("Error de Supabase:", error.message);
    throw error;
  }

  return data;
}
import { supabase } from "../../lib/supabase";
import type { Sale } from "../../types/database";

/**
 * Lista las ventas/apartados con sus items y pagos asociados.
 * - `status`: 'pending' | 'paid' | 'cancelled' | 'all'
 * - `onlyLayaway`: true → sólo los marcados explícitamente como apartado.
 *
 * Devuelve la venta junto con sus items y pagos para que la UI no tenga
 * que hacer N+1 llamadas por cada apartado.
 */
export async function listApartados(opts: {
  status?: "pending" | "paid" | "cancelled" | "all";
  onlyLayaway?: boolean;
  limit?: number;
} = {}) {
  const { status = "pending", onlyLayaway = false, limit = 100 } = opts;

  let q = supabase
    .from("sales")
    .select(
      `
      id,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      customer_location,
      payment_url,
      public_token,
      apartado_due_date,
      notes,
      total,
      paid,
      balance,
      status,
      is_layaway,
      created_at,
      sale_items (
        id,
        variant_id,
        product_id,
        product_name,
        variant_name,
        qty,
        tier,
        unit_price,
        is_bundle
      ),
      payments (
        id,
        amount,
        method,
        created_at
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);
  if (onlyLayaway) q = q.eq("is_layaway", true);

  const { data, error } = await q;
  if (error) {
    console.error("listApartados:", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as Sale[];
}

/**
 * Registra un abono a una venta existente vía la RPC `add_sale_payment`.
 * La RPC se encarga de:
 *   - validar que el monto sea > 0
 *   - validar que la venta no esté cancelada
 *   - insertar en `payments`
 *   - recalcular `paid`, `balance` y `status` en `sales`
 */
export async function addPayment(
  saleId: string,
  amount: number,
  method: string = "efectivo"
) {
  const { error } = await supabase.rpc("add_sale_payment", {
    p_sale_id: saleId,
    p_amount: amount,
    p_method: method,
  });
  if (error) throw new Error(error.message);
}

/**
 * Cancela una venta y devuelve el stock al inventario.
 * Usa la RPC `cancel_sale` (definida en 0004_apartados_customer.sql).
 */
export async function cancelSale(saleId: string) {
  const { error } = await supabase.rpc("cancel_sale", { p_sale_id: saleId });
  if (error) throw new Error(error.message);
}

/**
 * KPIs rápidos para mostrar en el dashboard o el tab.
 */
export async function getApartadosStats() {
  const [pendingResult, layawayResult] = await Promise.all([
    supabase
      .from("sales")
      .select("balance", { count: "exact" })
      .eq("status", "pending"),
    supabase
      .from("sales")
      .select("balance", { count: "exact" })
      .eq("is_layaway", true)
      .eq("status", "pending"),
  ]);

  const pendingBalance = (pendingResult.data ?? []).reduce(
    (a, b) => a + (Number((b as any).balance) || 0),
    0
  );

  return {
    pendingCount: pendingResult.count ?? 0,
    layawayCount: layawayResult.count ?? 0,
    pendingBalance,
  };
}

import { supabase } from "../../lib/supabase";
import type { Sale } from "../../types/database";
import { debug } from "../../lib/debug";
import { notifyClient } from "../notifications/notificationsService";
import { formatMoney } from "../../lib/format";

/**
 * Lista las ventas/apartados con sus items y pagos asociados.
 * - `status`: 'pending' | 'paid' | 'cancelled' | 'all'
 * - `onlyLayaway`: true → sólo los marcados explícitamente como apartado.
 *
 * Devuelve la venta junto con sus items y pagos para que la UI no tenga
 * que hacer N+1 llamadas por cada apartado.
 *
 * NOTA: el ordenamiento por "última actividad" (sale.created_at vs.
 * pagos vs. comprobantes) se hace del lado cliente en `useApartados`
 * combinando los timestamps de `getLatestProofActivity` con los pagos
 * embebidos en la venta. Aquí pedimos por `created_at` DESC para tener
 * un fallback razonable mientras llega la actividad.
 */
export async function listApartados(opts: {
  status?: "pending" | "paid" | "cancelled" | "all";
  onlyLayaway?: boolean;
  limit?: number;
} = {}) {
  // Default 100 ventas (antes 200). La mayoría de tiendas operan con
  // <50 apartados activos al mismo tiempo, traer 200 es overkill.
  // Si necesitas más, pasa `limit` explícito.
  const { status = "all", onlyLayaway = false, limit = 100 } = opts;

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
      notes,
      total,
      paid,
      balance,
      status,
      is_layaway,
      adjustment_amount,
      adjustment_reason,
      shipping_amount,
      is_foreign_shipping,
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
    debug.error("listApartados:", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as Sale[];
}

/**
 * Devuelve el `MAX(created_at)` de los comprobantes (`payment_proofs`)
 * agrupado por `sale_id`. Lo usamos para ordenar el tablero por última
 * actividad: si un cliente sube un comprobante, su tarjeta brinca al
 * inicio sin recargar.
 *
 * Como Supabase JS no expone GROUP BY directo desde el cliente,
 * traemos `sale_id` + `created_at` ordenados desc y nos quedamos con el
 * primero por sale_id. Es O(N) y los volúmenes son pequeños.
 */
export async function getLatestProofActivity(
  saleIds: string[]
): Promise<Record<string, string>> {
  if (saleIds.length === 0) return {};
  const { data, error } = await supabase
    .from("payment_proofs")
    .select("sale_id, created_at")
    .in("sale_id", saleIds)
    .order("created_at", { ascending: false });
  if (error) {
    debug.warn("getLatestProofActivity:", error.message);
    return {};
  }
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { sale_id: string; created_at: string }[]) {
    if (!map[row.sale_id]) map[row.sale_id] = row.created_at;
  }
  return map;
}

/**
 * Registra un abono a una venta existente. NO existe RPC `add_sale_payment`
 * en la DB real, así que lo hacemos en dos pasos contra las tablas que sí
 * existen (`payments` + `sales`). Las policies `anon_all` permiten ambas
 * operaciones desde el cliente autenticado/admin.
 */
export async function addPayment(
  saleId: string,
  amount: number,
  method: string = "efectivo"
) {
  if (!amount || amount <= 0) throw new Error("Monto inválido");

  // 1) Insertar el abono
  const { error: payErr } = await supabase
    .from("payments")
    .insert({ sale_id: saleId, amount, method });
  if (payErr) throw new Error(payErr.message);

  // 2) Recalcular paid/balance/status en sales (también traemos email
  //    y datos para poder notificar al cliente al final).
  const { data: sale, error: selErr } = await supabase
    .from("sales")
    .select("total,paid,status,customer_email,customer_name,public_token")
    .eq("id", saleId)
    .maybeSingle();
  if (selErr || !sale) throw new Error(selErr?.message ?? "Venta no encontrada");

  const newPaid = Number(sale.paid ?? 0) + Number(amount);
  const total = Number(sale.total ?? 0);
  const newBalance = Math.max(0, total - newPaid);
  const newStatus =
    sale.status === "cancelled" ? "cancelled" : newBalance <= 0 ? "paid" : "pending";

  const { error: updErr } = await supabase
    .from("sales")
    .update({ paid: newPaid, balance: newBalance, status: newStatus })
    .eq("id", saleId);
  if (updErr) throw new Error(updErr.message);

  // 3) Notificar al cliente (si tiene email). Si liquida el saldo lo
  //    decimos diferente. Best-effort: si falla no aborta el flujo.
  if ((sale as any).customer_email) {
    const liquidado = newStatus === "paid";
    await notifyClient((sale as any).customer_email, {
      type: liquidado ? "sale_paid" : "payment_added",
      title: liquidado
        ? "Pago completo registrado"
        : `Abono de ${formatMoney(amount)} registrado`,
      body: liquidado
        ? `Tu pedido quedó liquidado. ¡Gracias!`
        : `Pagado: ${formatMoney(newPaid)} de ${formatMoney(total)}. Saldo restante: ${formatMoney(newBalance)}.`,
      link: (sale as any).public_token
        ? `/ticket/${(sale as any).public_token}`
        : null,
      metadata: {
        sale_id: saleId,
        amount,
        method,
        balance: newBalance,
        status: newStatus,
      },
    });
  }
}

/**
 * Cancela una venta. NO existe RPC `cancel_sale` en la DB real, hacemos
 * UPDATE directo. El trigger `restock_on_sale_cancelled` devuelve el stock
 * automáticamente al pasar a status='cancelled'.
 */
export async function cancelSale(saleId: string, reason?: string | null) {
  // Leemos primero el email del cliente para poder notificarle
  // después del cancel.
  const { data: prev } = await supabase
    .from("sales")
    .select("customer_email,customer_name,public_token")
    .eq("id", saleId)
    .maybeSingle();

  // Si escribió un motivo, lo guardamos en notes para que quede
  // en el historial. No tenemos columna dedicada `cancellation_reason`
  // en sales, así que lo concatenamos.
  const patch: Record<string, unknown> = { status: "cancelled" };
  if (reason && reason.trim()) {
    const tag = `[Cancelado: ${reason.trim()}]`;
    patch.notes = tag;
  }
  const { error } = await supabase
    .from("sales")
    .update(patch)
    .eq("id", saleId);
  if (error) throw new Error(error.message);

  if (prev && (prev as any).customer_email) {
    const reasonTxt = reason && reason.trim() ? `\n\nMotivo: ${reason.trim()}` : "";
    await notifyClient((prev as any).customer_email, {
      type: "sale_cancelled",
      title: "Tu pedido fue cancelado",
      body:
        `canceló este pedido. Si tenías un abono pagado, te contactaremos para devolverlo.${reasonTxt}`,
      link: (prev as any).public_token
        ? `/ticket/${(prev as any).public_token}`
        : null,
      metadata: { sale_id: saleId, reason: reason ?? null },
    });
  }
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

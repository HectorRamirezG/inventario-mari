import { supabase } from "../../lib/supabase";
import type { Sale } from "../../types/database";
import { debug } from "../../lib/debug";
import { notifyClient } from "../notifications/notificationsService";
import { formatMoney } from "../../lib/format";
import { getBusinessRules } from "../settings/businessRulesService";

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
  // Leemos primero email + montos del cliente para poder notificarle
  // después del cancel y para evaluar si convertir el abono en puntos.
  const { data: prev } = await supabase
    .from("sales")
    .select("customer_email,customer_name,public_token,paid,total")
    .eq("id", saleId)
    .maybeSingle();

  // Si escribió un motivo, lo guardamos en notes para que quede
  // en el historial. No tenemos columna dedicada `cancellation_reason`
  // en sales, así que lo concatenamos.
  // FIX: también reseteamos `balance` a 0 al cancelar. Antes la fila
  // quedaba con su balance original y los KPIs de "por cobrar" del
  // dashboard la incluían como deuda fantasma.
  const patch: Record<string, unknown> = { status: "cancelled", balance: 0 };
  if (reason && reason.trim()) {
    const tag = `[Cancelado: ${reason.trim()}]`;
    patch.notes = tag;
  }
  const { error } = await supabase
    .from("sales")
    .update(patch)
    .eq("id", saleId);
  if (error) throw new Error(error.message);

  // Cruce con Programa de Premios: si la regla "Sin devoluciones en
  // efectivo" está activa Y el cliente había abonado, convertimos
  // su pago en puntos (peso_por_punto define la equivalencia). El
  // cliente recibe una nota de crédito en forma de saldo loyalty.
  const customerEmail = (prev as any)?.customer_email as string | undefined;
  const paid = Number((prev as any)?.paid) || 0;
  let pointsAwarded = 0;
  try {
    const rules = getBusinessRules();
    if (
      rules.no_refund &&
      rules.loyalty_enabled &&
      customerEmail &&
      paid > 0 &&
      rules.loyalty_peso_por_punto > 0
    ) {
      pointsAwarded = Math.floor(paid / rules.loyalty_peso_por_punto);
      if (pointsAwarded > 0) {
        // Insertamos el evento + actualizamos el balance manualmente
        // (no usamos award_loyalty_points porque ese lee la regla de la
        // tabla y aquí el valor es dinámico = monto/peso_por_punto).
        const { error: evErr } = await supabase
          .from("loyalty_events")
          .insert({
            customer_email: customerEmail.toLowerCase(),
            action_key: "refund_credit",
            delta: pointsAwarded,
            note: `Crédito por cancelación · ${formatMoney(paid)}`,
            ref_table: "sales",
            ref_id: saleId,
          });
        if (evErr) {
          debug.warn("[apartados] loyalty_events insert:", evErr.message);
          pointsAwarded = 0;
        } else {
          // Upsert balance: si existe, sumamos; si no, lo creamos.
          const { data: bal } = await supabase
            .from("loyalty_balance")
            .select("points,lifetime_earned")
            .eq("customer_email", customerEmail.toLowerCase())
            .maybeSingle();
          if (bal) {
            await supabase
              .from("loyalty_balance")
              .update({
                points: (Number((bal as any).points) || 0) + pointsAwarded,
                lifetime_earned:
                  (Number((bal as any).lifetime_earned) || 0) + pointsAwarded,
                updated_at: new Date().toISOString(),
              })
              .eq("customer_email", customerEmail.toLowerCase());
          } else {
            await supabase.from("loyalty_balance").insert({
              customer_email: customerEmail.toLowerCase(),
              points: pointsAwarded,
              lifetime_earned: pointsAwarded,
            });
          }
        }
      }
    }
  } catch (e: any) {
    debug.warn("[apartados] convert refund to points failed:", e?.message);
  }

  if (prev && customerEmail) {
    const reasonTxt = reason && reason.trim() ? `\n\nMotivo: ${reason.trim()}` : "";
    // Detectamos si la intención del admin era convertir a puntos pero
    // no se pudo (loyalty apagado, peso=0, etc). Avisamos al cliente
    // que el reembolso queda pendiente de coordinación en lugar de
    // fingir que todo está OK.
    const rulesNow = getBusinessRules();
    const intendedRefundToPoints =
      rulesNow.no_refund && paid > 0 && pointsAwarded === 0;
    const body =
      pointsAwarded > 0
        ? `Tu abono de ${formatMoney(paid)} se convirtió en ${pointsAwarded} puntos para tu próxima compra.${reasonTxt}`
        : intendedRefundToPoints
        ? `canceló este pedido. Tu abono de ${formatMoney(paid)} queda pendiente — te contactaremos para coordinar la devolución.${reasonTxt}`
        : `canceló este pedido. Si tenías un abono pagado, te contactaremos para devolverlo.${reasonTxt}`;
    await notifyClient(customerEmail, {
      type: pointsAwarded > 0 ? "payment_added" : "sale_cancelled",
      title:
        pointsAwarded > 0
          ? `Tu pago se convirtió en ${pointsAwarded} puntos`
          : "Tu pedido fue cancelado",
      body,
      link: (prev as any).public_token
        ? `/ticket/${(prev as any).public_token}`
        : null,
      metadata: {
        sale_id: saleId,
        reason: reason ?? null,
        refund_to_points: pointsAwarded,
      },
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

/**
 * Regla `auto_cancel_idle_enabled`: cancela apartados pendientes sin
 * actividad de pagos desde hace N días (configurable). Se ejecuta como
 * "best-effort": cualquier fallo se ignora silenciosamente.
 *
 * Algoritmo:
 *   1. Lee rules. Si está desactivada, sale.
 *   2. Calcula cutoff = now - rules.auto_cancel_idle_days días.
 *   3. Busca apartados (is_layaway=true) con status='pending' creados
 *      antes del cutoff.
 *   4. Para cada uno verifica si tiene pagos posteriores al cutoff;
 *      si NO los tiene, lo cancela con reason "Auto-cancelado por
 *      inactividad". Usa `cancelSale` para que dispare notifs y
 *      devuelva el stock como corresponde.
 *
 * Devuelve cuántos canceló (útil para mostrar toast opcional).
 */
export async function runAutoCancelIdleSales(): Promise<number> {
  try {
    const rules = getBusinessRules();
    if (!rules.auto_cancel_idle_enabled) return 0;
    const days = Math.max(1, Number(rules.auto_cancel_idle_days || 0));
    if (!days) return 0;

    const cutoffIso = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Apartados candidatos: pendientes, layaway, viejos
    const { data: candidates } = await supabase
      .from("sales")
      .select("id, created_at")
      .eq("status", "pending")
      .eq("is_layaway", true)
      .lt("created_at", cutoffIso)
      .limit(50);

    const list = (candidates ?? []) as { id: string; created_at: string }[];
    if (list.length === 0) return 0;

    let cancelled = 0;
    for (const sale of list) {
      // Si tiene pagos posteriores al cutoff, NO la cancelamos
      const { count } = await supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("sale_id", sale.id)
        .gte("created_at", cutoffIso);
      if ((count ?? 0) > 0) continue;

      try {
        await cancelSale(sale.id, "Auto-cancelado por inactividad");
        cancelled++;
      } catch {
        /* best-effort: si una falla seguimos con la siguiente */
      }
    }
    return cancelled;
  } catch {
    return 0;
  }
}

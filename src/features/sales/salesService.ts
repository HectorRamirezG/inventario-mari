import { supabase } from "../../lib/supabase";
import type { CartItem } from "./salesTier";

export interface CreateSalePayload {
  customer: string;
  phone?: string | null;
  address?: string | null;
  location?: string | null;
  payment_url?: string | null;
  notes?: string | null;
  isLayaway?: boolean;
  total: number;
  paid: number | string;
  balance: number;
  items: CartItem[];
  // Envío / entrega
  shipping_amount?: number | null;
  is_foreign_shipping?: boolean | null;
}

/**
 * Crea una venta completa: registra la venta, los items, descuenta stock,
 * registra el movimiento e inserta el pago si lo hubo.
 *
 * Patrón de "compensación": si algo falla a mitad, intentamos borrar la
 * venta para que no queden filas huérfanas en la base. No es transaccional
 * a nivel SQL (eso requeriría un RPC `create_sale_atomic`), pero da
 * consistencia razonable contra fallos parciales.
 */
export async function createSale(payload: CreateSalePayload) {
  // 0. Validación previa de stock — evita iniciar la venta y dejarla a medias.
  const insufficient = payload.items.find((it) => it.qty > it.stock);
  if (insufficient) {
    throw new Error(
      `Stock insuficiente para "${insufficient.variant_name}" ` +
        `(disponible: ${insufficient.stock}, solicitado: ${insufficient.qty})`
    );
  }

  const paidNum =
    typeof payload.paid === "string" ? parseFloat(payload.paid) || 0 : payload.paid;

  // 1. Crear venta (cabecera)
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      customer_name: payload.customer,
      customer_phone: payload.phone ?? null,
      customer_address: payload.address ?? null,
      customer_location: payload.location ?? null,
      payment_url: payload.payment_url ?? null,
      notes: payload.notes ?? null,
      is_layaway: !!payload.isLayaway,
      total: payload.total,
      paid: paidNum,
      balance: payload.balance,
      status: payload.balance > 0 ? "pending" : "paid",
      shipping_amount: payload.shipping_amount ?? 0,
      is_foreign_shipping: !!payload.is_foreign_shipping,
    })
    .select()
    .single();

  if (saleError || !sale) {
    throw new Error(`No se pudo crear la venta: ${saleError?.message ?? "desconocido"}`);
  }

  /** Helper para limpiar la venta si algo falla a mitad. */
  const rollback = async (reason: string): Promise<never> => {
    await supabase.from("sales").delete().eq("id", sale.id);
    throw new Error(reason);
  };

  // 2. Insertar items + descontar stock + registrar movimiento por cada uno
  for (const item of payload.items) {
    const profitTotal = (item.price - item.cost) * item.qty;

    const { error: itemError } = await supabase.from("sale_items").insert({
      sale_id: sale.id,
      variant_id: item.variant_id,
      product_id: item.product_id ?? null,
      product_name: item.name,
      variant_name: item.variant_name,
      qty: item.qty,
      tier: item.tier,
      unit_price: item.price,
      cost_snapshot: item.cost,
      profit: profitTotal,
    });

    if (itemError) {
      return rollback(`Error guardando item "${item.variant_name}": ${itemError.message}`);
    }

    const { error: rpcError } = await supabase.rpc("decrease_variant_stock", {
      p_variant_id: item.variant_id,
      p_qty: item.qty,
    });

    if (rpcError) {
      return rollback(
        `No se pudo descontar stock de "${item.variant_name}": ${rpcError.message}`
      );
    }

    const { error: movementError } = await supabase.from("movements").insert({
      product_id: item.product_id ?? null,
      variant_id: item.variant_id,
      type: "salida",
      quantity: item.qty,
      sale_id: sale.id,
    });

    if (movementError) {
      return rollback(
        `No se pudo registrar el movimiento de "${item.variant_name}": ${movementError.message}`
      );
    }
  }

  // 3. Pago (si lo hubo)
  if (paidNum > 0) {
    const { error: paymentError } = await supabase.from("payments").insert({
      sale_id: sale.id,
      amount: paidNum,
    });

    if (paymentError) {
      return rollback(`No se pudo registrar el pago: ${paymentError.message}`);
    }
  }

  return sale;
}

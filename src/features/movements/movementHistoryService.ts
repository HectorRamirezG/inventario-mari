import { supabase } from "../../lib/supabase";

export async function getMovementHistory() {
  // Consultamos la tabla de SALES para obtener las ventas agrupadas
  // Traemos los items de la venta para poder mostrar la lista de productos
  const { data, error } = await supabase
    .from("sales")
    .select(`
      id,
      created_at,
      customer_name,
      total,
      paid,
      balance,
      sale_items (
        id,
        product_name,
        variant_name,
        qty
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error en Supabase:", error.message);
    return [];
  }

  // Mapeamos para que el frontend reciba exactamente lo que espera
  return (data || []).map((s: any) => ({
    sale_id: s.id,
    created_at: s.created_at,
    type: "venta", // En este contexto de ventas siempre es venta
    customer: s.customer_name || "Mostrador",
    total: Number(s.total ?? 0),
    paid: Number(s.paid ?? 0),
    balance: Number(s.balance ?? 0),
    total_items: s.sale_items?.reduce((acc: number, item: any) => acc + (item.qty || 0), 0) || 0,
    items: s.sale_items?.map((si: any) => ({
      name: si.product_name || si.variant_name || "Producto",
      qty: si.qty
    })) || []
  }));
}

export async function registrarAbono(saleId: string, montoAbonado: number) {
  if (!saleId) throw new Error("ID de venta no proporcionado");

  // 1. Traemos la venta actual
  const { data: sale, error: fetchError } = await supabase
    .from('sales')
    .select('paid, total')
    .eq('id', saleId)
    .single();

  if (fetchError || !sale) throw new Error("No se encontró la venta");

  const nuevoPagado = Number(sale.paid) + montoAbonado;
  const nuevoSaldo = Math.max(0, Number(sale.total) - nuevoPagado);

  // 2. Actualizamos
  const { error: updateError } = await supabase
    .from('sales')
    .update({ 
      paid: nuevoPagado, 
      balance: nuevoSaldo,
      status: nuevoSaldo <= 0 ? 'paid' : 'pending'
    })
    .eq('id', saleId);

  if (!updateError) {
    await supabase.from("payments").insert({
      sale_id: saleId,
      amount: montoAbonado,
      method: 'efectivo'
    });
  }

  return { error: updateError };
}
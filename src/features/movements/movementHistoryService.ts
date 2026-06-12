import { supabase } from "../../lib/supabase"

export interface MovementHistoryEntry {
  sale_id: string
  created_at: string
  type: "venta"
  customer: string
  total: number
  paid: number
  balance: number
  total_items: number
  items: { name: string; qty: number; is_bundle: boolean }[]
}

export class SalesHistoryService {
  async list(): Promise<MovementHistoryEntry[]> {
    const { data, error } = await supabase
      .from("sales")
      .select(`
        id, created_at, customer_name, total, paid, balance,
        sale_items ( id, product_name, variant_name, qty, is_bundle )
      `)
      .order("created_at", { ascending: false })

    if (error) { console.error("[history] list:", error.message); return [] }

    return (data ?? []).map((s: any) => ({
      sale_id: s.id,
      created_at: s.created_at,
      type: "venta",
      customer: s.customer_name || "Mostrador",
      total: Number(s.total ?? 0),
      paid:  Number(s.paid ?? 0),
      balance: Number(s.balance ?? 0),
      total_items: (s.sale_items ?? []).reduce((acc: number, x: any) => acc + (x.qty || 0), 0),
      items: (s.sale_items ?? []).map((si: any) => ({
        name: si.product_name || si.variant_name || "Producto",
        qty:  Number(si.qty || 0),
        is_bundle: !!si.is_bundle,
      })),
    }))
  }

  async registerPayment(saleId: string, amount: number) {
    if (!saleId) throw new Error("saleId requerido")

    const { data: sale, error: fetchErr } = await supabase
      .from("sales")
      .select("paid, total")
      .eq("id", saleId)
      .single()
    if (fetchErr || !sale) throw new Error("No se encontró la venta")

    const nuevoPagado = Number(sale.paid) + amount
    const nuevoSaldo  = Math.max(0, Number(sale.total) - nuevoPagado)

    const { error: upErr } = await supabase
      .from("sales")
      .update({
        paid: nuevoPagado,
        balance: nuevoSaldo,
        status: nuevoSaldo <= 0 ? "paid" : "pending",
      })
      .eq("id", saleId)

    if (!upErr) {
      await supabase.from("payments").insert({ sale_id: saleId, amount, method: "efectivo" })
    }
    return { error: upErr }
  }
}

export const salesHistoryService = new SalesHistoryService()
export const getMovementHistory = () => salesHistoryService.list()
export const registrarAbono = (saleId: string, amount: number) =>
  salesHistoryService.registerPayment(saleId, amount)

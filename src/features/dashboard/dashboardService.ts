import { supabase } from "../../lib/supabase";
import type { DashboardStats } from "./dashboardTypes";

/**
 * Helper para tomar el resultado de Promise.allSettled sin romper el
 * dashboard si una columna no existe en una DB con migraciones atrasadas
 * (ej. apartado_due_date o is_foreign_shipping).
 */
function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Umbral para "vencen en 5 días"
  const soon = new Date()
  soon.setDate(soon.getDate() + 5)
  const soonIso = soon.toISOString().slice(0, 10) // YYYY-MM-DD

  const results = await Promise.allSettled([
    supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("variants").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("variants").select(`stock,is_active,products:products(min_stock,is_active)`),
    supabase.from("sales").select("total,balance"),
    supabase.from("sale_items").select("profit,product_name,qty"),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("is_foreign_shipping", true)
      .eq("balance", 0)
      .neq("status", "cancelled"),
    supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("is_layaway", true)
      .gt("balance", 0)
      .lte("apartado_due_date", soonIso)
      .neq("status", "cancelled"),
    supabase
      .from("payment_proofs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ])

  const empty = { data: null as any, count: 0 }
  const pCount = settled(results[0] as any, empty)
  const vCount = settled(results[1] as any, empty)
  const low = settled(results[2] as any, { data: [] as any[] } as any)
  const salesData = settled(results[3] as any, { data: [] as any[] } as any)
  const itemsData = settled(results[4] as any, { data: [] as any[] } as any)
  const shipments = settled(results[5] as any, empty)
  const dueLayaways = settled(results[6] as any, empty)
  const pendingProofs = settled(results[7] as any, empty)

  const lowStockCount = (low.data as any[] ?? []).filter(
    (x) =>
      x.is_active &&
      x.products?.is_active &&
      Number(x.stock) <= Number(x.products.min_stock)
  ).length

  const revenue = (salesData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.total) || 0),
    0
  )
  const pending = (salesData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.balance) || 0),
    0
  )
  const profit = (itemsData.data ?? []).reduce(
    (a: number, b: any) => a + (Number(b.profit) || 0),
    0
  )

  const by = new Map<string, number>()
  ;(itemsData.data ?? []).forEach((i: any) => {
    by.set(i.product_name, (by.get(i.product_name) ?? 0) + Number(i.qty))
  })

  const top = Array.from(by.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)

  return {
    products: pCount.count ?? 0,
    variants: vCount.count ?? 0,
    lowStock: lowStockCount,
    revenue,
    profit,
    pending,
    operations: salesData.data?.length ?? 0,
    top,
    pendingShipments: shipments.count ?? 0,
    dueLayaways: dueLayaways.count ?? 0,
    pendingProofs: pendingProofs.count ?? 0,
  }
}

export const getSalesStats = getDashboardStats;


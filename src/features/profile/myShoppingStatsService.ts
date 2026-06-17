import { supabase } from "../../lib/supabase"
import { classifyRfm, type RfmTier } from "../../components/ui/RfmBadge"

export interface MyShoppingStats {
  email: string
  totalSpent: number
  visits: number
  pendingBalance: number
  savingsVsMenudeo: number
  firstPurchaseIso: string | null
  lastPurchaseIso: string | null
  tier: RfmTier
}

const EMPTY: Omit<MyShoppingStats, "email"> = {
  totalSpent: 0,
  visits: 0,
  pendingBalance: 0,
  savingsVsMenudeo: 0,
  firstPurchaseIso: null,
  lastPurchaseIso: null,
  tier: "new",
}

export async function fetchMyShoppingStats(email: string): Promise<MyShoppingStats> {
  const normalized = email.toLowerCase().trim()
  if (!normalized) return { email: "", ...EMPTY }

  const { data: salesRows } = await supabase
    .from("sales")
    .select("id,total,balance,created_at,status")
    .eq("customer_email", normalized)
    .neq("status", "cancelled")

  const sales = (salesRows ?? []) as any[]
  if (sales.length === 0) return { email: normalized, ...EMPTY }

  const totalSpent = sales.reduce((a, s) => a + (Number(s.total) || 0), 0)
  const pendingBalance = sales.reduce((a, s) => a + (Number(s.balance) || 0), 0)
  const ts = sales
    .map((s) => s.created_at as string | null)
    .filter((x): x is string => !!x)
    .sort()
  const firstPurchaseIso = ts[0] ?? null
  const lastPurchaseIso = ts[ts.length - 1] ?? null

  const saleIds = sales.map((s) => s.id as string)
  let savingsVsMenudeo = 0
  if (saleIds.length > 0) {
    const { data: items } = await supabase
      .from("sale_items")
      .select("qty,unit_price,sale_id,variants:variants(price_menudeo,price)")
      .in("sale_id", saleIds)
    for (const it of (items ?? []) as any[]) {
      const qty = Number(it.qty) || 0
      const paid = Number(it.unit_price) || 0
      const ref = Number(it.variants?.price_menudeo ?? it.variants?.price ?? 0) || 0
      if (ref > paid && qty > 0) {
        savingsVsMenudeo += (ref - paid) * qty
      }
    }
  }

  const tier = classifyRfm({
    visits: sales.length,
    totalSpent,
    lastVisitIso: lastPurchaseIso,
  })

  return {
    email: normalized,
    totalSpent,
    visits: sales.length,
    pendingBalance,
    savingsVsMenudeo,
    firstPurchaseIso,
    lastPurchaseIso,
    tier,
  }
}

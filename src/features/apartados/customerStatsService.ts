import { supabase } from "../../lib/supabase"
import { classifyRfm, type RfmTier } from "../../components/ui/RfmBadge"

export interface CustomerStat {
  email: string
  visits: number
  total: number
  lastIso: string | null
  tier: RfmTier
}

export async function fetchCustomerStatsByEmails(
  emails: string[]
): Promise<Record<string, CustomerStat>> {
  const unique = Array.from(new Set(emails.filter(Boolean).map((e) => e.toLowerCase())))
  if (unique.length === 0) return {}
  const { data, error } = await supabase
    .from("sales")
    .select("customer_email,total,created_at,status")
    .in("customer_email", unique)
    .neq("status", "cancelled")
  if (error || !data) return {}

  const out: Record<string, CustomerStat> = {}
  for (const row of data as any[]) {
    const email = (row.customer_email as string | null)?.toLowerCase()
    if (!email) continue
    const cur =
      out[email] ?? { email, visits: 0, total: 0, lastIso: null, tier: "new" as RfmTier }
    cur.visits += 1
    cur.total += Number(row.total) || 0
    const ts = row.created_at as string | null
    if (ts && (!cur.lastIso || ts > cur.lastIso)) cur.lastIso = ts
    out[email] = cur
  }
  for (const k of Object.keys(out)) {
    const s = out[k]
    s.tier = classifyRfm({
      visits: s.visits,
      totalSpent: s.total,
      lastVisitIso: s.lastIso,
    })
  }
  return out
}

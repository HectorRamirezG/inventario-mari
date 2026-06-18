import { supabase } from "../../lib/supabase"

export interface AuditEntry {
  id: string
  actor_email: string | null
  actor_role: string | null
  entity_type: string
  entity_id: string | null
  action: string
  before_data: any | null
  after_data: any | null
  metadata: any | null
  created_at: string
}

export async function listAuditLog(opts?: {
  entityType?: string
  entityId?: string
  limit?: number
}): Promise<AuditEntry[]> {
  let q = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 80)
  if (opts?.entityType) q = q.eq("entity_type", opts.entityType)
  if (opts?.entityId) q = q.eq("entity_id", opts.entityId)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as AuditEntry[]
}

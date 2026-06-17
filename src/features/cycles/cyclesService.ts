import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

export type CycleStatus = "open" | "closed"

export interface InventoryCycle {
  id: string
  name: string
  status: CycleStatus
  started_at: string
  closed_at: string | null
  opening_inventory_cost: number
  new_lot_cost: number
  closing_inventory_cost: number | null
  total_revenue: number | null
  total_cogs: number | null
  total_expenses: number | null
  break_even_at: string | null
  net_profit: number | null
  notes: string | null
  created_at: string
}

export interface CapitalInjection {
  id: string
  cycle_id: string
  amount: number
  description: string | null
  created_at: string
}

export interface OperatingExpense {
  id: string
  cycle_id: string
  category: string
  amount: number
  description: string | null
  occurred_on: string
  created_at: string
}

export interface CycleSnapshot {
  cycle: InventoryCycle
  total_investment: number
  capital_injections: number
  revenue: number
  cogs: number
  expenses: number
  gross_profit: number
  net_profit_projection: number
  current_inventory_cost: number
  break_even_at: string | null
  break_even_pct: number
  remaining_to_be: number
}

export const EXPENSE_CATEGORIES = [
  { id: "renta", label: "Renta" },
  { id: "luz", label: "Luz / Internet" },
  { id: "sueldos", label: "Sueldos" },
  { id: "transporte", label: "Transporte" },
  { id: "publicidad", label: "Publicidad" },
  { id: "otros", label: "Otros" },
] as const

/* -------------------- LECTURA -------------------- */

export async function getActiveCycle(): Promise<InventoryCycle | null> {
  const { data, error } = await supabase
    .from("inventory_cycles")
    .select("*")
    .eq("status", "open")
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as InventoryCycle) ?? null
}

export async function listCycles(limit = 24): Promise<InventoryCycle[]> {
  const { data, error } = await supabase
    .from("inventory_cycles")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as InventoryCycle[]
}

export async function getCycleSnapshot(cycleId: string): Promise<CycleSnapshot> {
  const { data, error } = await supabase.rpc("cycle_snapshot", {
    p_cycle_id: cycleId,
  })
  if (error) throw new Error(error.message)
  return data as CycleSnapshot
}

export async function listInjections(cycleId: string): Promise<CapitalInjection[]> {
  const { data, error } = await supabase
    .from("capital_injections")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CapitalInjection[]
}

export async function listExpenses(cycleId: string): Promise<OperatingExpense[]> {
  const { data, error } = await supabase
    .from("operating_expenses")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("occurred_on", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as OperatingExpense[]
}

/* -------------------- MUTACIÓN -------------------- */

export async function openCycle(args: {
  name: string
  newLotCost?: number
  openingInventoryCost?: number | null
  notes?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc("open_cycle", {
    p_name: args.name,
    p_new_lot_cost: args.newLotCost ?? 0,
    p_opening_inventory_cost: args.openingInventoryCost ?? null,
    p_notes: args.notes ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function closeCycle(args: {
  cycleId: string
  closingInventoryCost?: number | null
  openNextName?: string | null
}): Promise<{
  cycle_id: string
  snapshot: CycleSnapshot
  next_cycle_id: string | null
}> {
  const { data, error } = await supabase.rpc("close_cycle", {
    p_cycle_id: args.cycleId,
    p_closing_inventory_cost: args.closingInventoryCost ?? null,
    p_open_next: args.openNextName ?? null,
  })
  if (error) throw new Error(error.message)
  return data as any
}

export async function addCapitalInjection(args: {
  cycleId: string
  amount: number
  description?: string | null
}) {
  const { error } = await supabase.from("capital_injections").insert({
    cycle_id: args.cycleId,
    amount: args.amount,
    description: args.description ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function addExpense(args: {
  cycleId: string
  category: string
  amount: number
  description?: string | null
  occurredOn?: string
}) {
  const { error } = await supabase.from("operating_expenses").insert({
    cycle_id: args.cycleId,
    category: args.category,
    amount: args.amount,
    description: args.description ?? null,
    occurred_on:
      args.occurredOn ?? new Date().toISOString().slice(0, 10),
  })
  if (error) throw new Error(error.message)
}

/**
 * Construye un nombre sugerido para el siguiente ciclo basado en
 * la fecha actual. Ej: "Julio 2026". Si el actual ya tiene ese nombre,
 * pone "Julio 2026 · v2".
 */
export function suggestNextCycleName(currentName?: string | null): string {
  const now = new Date()
  const mes = now.toLocaleDateString("es-MX", { month: "long" })
  const base = `${mes[0].toUpperCase() + mes.slice(1)} ${now.getFullYear()}`
  if (currentName?.toLowerCase().startsWith(base.toLowerCase())) {
    return `${base} · v2`
  }
  return base
}

/**
 * Calcula el costo actual del inventario sumando stock × cost (con
 * cost_override si existe) sobre todas las variantes activas. Lo usamos
 * para pre-llenar el costo inicial cuando el admin abre su primer ciclo
 * y como sugerencia para el costo de inventario remanente al cerrar.
 *
 * Falla suave: si la query rompe (RLS, etc.), retorna null para que el
 * modal siga funcionando con input manual.
 */
export async function estimateCurrentInventoryCost(): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("variants")
      .select("stock,is_active,cost_override,products:products(is_active,cost)")
    if (error) {
      debug.warn("[estimateCurrentInventoryCost]", error.message)
      return null
    }
    let total = 0
    for (const v of (data ?? []) as any[]) {
      if (!v.is_active || !v.products?.is_active) continue
      const stk = Number(v.stock) || 0
      const cost = Number(v.cost_override ?? v.products?.cost ?? 0) || 0
      total += stk * cost
    }
    return Math.round(total * 100) / 100
  } catch (e) {
    debug.warn("[estimateCurrentInventoryCost] catch", e)
    return null
  }
}


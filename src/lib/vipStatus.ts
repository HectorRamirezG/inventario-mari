import type { BusinessRules } from "../features/settings/businessRulesService"

/**
 * Heurística para decidir si un cliente es VIP. Se aplica EN el caller
 * con los datos que ya tenga disponibles (total_spent, orders_count,
 * loyalty_points). Evita query extra: el caller decide qué señal usar.
 *
 * Criterios (ordenados por prioridad):
 *   1. Si el role del perfil es "vip" → siempre VIP.
 *   2. Si rules.auto_vip_enabled y monthlySpent >= rules.auto_vip_monthly_threshold.
 *   3. Si lifetime_earned (puntos) >= 100.
 *
 * Devuelve true si cualquiera se cumple.
 */
export function isVipCustomer(
  rules: BusinessRules,
  signals: {
    role?: string | null
    monthlySpent?: number | null
    lifetimePoints?: number | null
  },
): boolean {
  if (signals.role === "vip") return true
  if (
    rules.auto_vip_enabled &&
    typeof signals.monthlySpent === "number" &&
    signals.monthlySpent >= (rules.auto_vip_monthly_threshold || 0)
  ) {
    return true
  }
  if (typeof signals.lifetimePoints === "number" && signals.lifetimePoints >= 100) {
    return true
  }
  return false
}

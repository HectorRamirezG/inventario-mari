import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"

/**
 * Reglas de negocio centralizadas. Se persisten en `app_settings`
 * bajo la clave `business_rules` como JSONB. Toda la app las consulta
 * vía `useBusinessRules()` para activar/desactivar comportamientos.
 */
export interface BusinessRules {
  /** Bloquea reportar daño/reclamación N horas después del pago/entrega. */
  claim_window_enabled: boolean
  claim_window_hours: number

  /** No permite cambiar status a "enviado/entregado" en pedido foráneo
   *  hasta que se haya capturado tracking_number. */
  force_tracking_foraneo: boolean

  /** Ventas que excedan este monto exigen confirmación extra del admin. */
  high_value_enabled: boolean
  high_value_threshold: number

  /** Días de gracia para cancelar un apartado sin penalización. */
  cancellation_grace_enabled: boolean
  cancellation_grace_days: number

  /** Bloquea la cancelación pasadas N horas desde el primer pago. */
  no_cancel_after_payment_enabled: boolean
  no_cancel_after_payment_hours: number

  /** No se permite devolución de dinero — solo nota de crédito interna. */
  no_refund: boolean

  /** Apartado mínimo (% del total) para aceptarlo. */
  min_layaway_enabled: boolean
  min_layaway_percent: number

  /** Tope de apartados simultáneos por cliente (evita acaparar stock). */
  max_layaways_enabled: boolean
  max_layaways_per_client: number

  /** Notifica al admin cuando una variante baja del umbral. */
  stock_alert_enabled: boolean
  stock_alert_threshold: number

  /** Una vez que el ciclo de inventario está cerrado, prohíbe editar
   *  pedidos viejos (no se pueden quitar artículos del histórico). */
  lock_edit_when_cycle_closed: boolean
}

export const DEFAULT_RULES: BusinessRules = {
  claim_window_enabled: true,
  claim_window_hours: 24,

  force_tracking_foraneo: true,

  high_value_enabled: true,
  high_value_threshold: 5000,

  cancellation_grace_enabled: true,
  cancellation_grace_days: 3,

  no_cancel_after_payment_enabled: false,
  no_cancel_after_payment_hours: 24,

  no_refund: false,

  min_layaway_enabled: false,
  min_layaway_percent: 20,

  max_layaways_enabled: false,
  max_layaways_per_client: 3,

  stock_alert_enabled: true,
  stock_alert_threshold: 3,

  lock_edit_when_cycle_closed: false,
}

let cache: BusinessRules | null = null
const listeners = new Set<(r: BusinessRules) => void>()

function merge(raw: any): BusinessRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_RULES }
  return {
    claim_window_enabled: !!raw.claim_window_enabled,
    claim_window_hours: Number(raw.claim_window_hours) || DEFAULT_RULES.claim_window_hours,
    force_tracking_foraneo: !!raw.force_tracking_foraneo,
    high_value_enabled: !!raw.high_value_enabled,
    high_value_threshold: Number(raw.high_value_threshold) || DEFAULT_RULES.high_value_threshold,
    cancellation_grace_enabled: !!raw.cancellation_grace_enabled,
    cancellation_grace_days: Number(raw.cancellation_grace_days) || DEFAULT_RULES.cancellation_grace_days,
    no_cancel_after_payment_enabled: !!raw.no_cancel_after_payment_enabled,
    no_cancel_after_payment_hours:
      Number(raw.no_cancel_after_payment_hours) || DEFAULT_RULES.no_cancel_after_payment_hours,
    no_refund: !!raw.no_refund,
    min_layaway_enabled: !!raw.min_layaway_enabled,
    min_layaway_percent: Number(raw.min_layaway_percent) || DEFAULT_RULES.min_layaway_percent,
    max_layaways_enabled: !!raw.max_layaways_enabled,
    max_layaways_per_client:
      Number(raw.max_layaways_per_client) || DEFAULT_RULES.max_layaways_per_client,
    stock_alert_enabled: !!raw.stock_alert_enabled,
    stock_alert_threshold:
      Number(raw.stock_alert_threshold) || DEFAULT_RULES.stock_alert_threshold,
    lock_edit_when_cycle_closed: !!raw.lock_edit_when_cycle_closed,
  }
}

async function load(): Promise<BusinessRules> {
  if (cache) return cache
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "business_rules")
      .maybeSingle()
    cache = merge(data?.value)
  } catch {
    cache = { ...DEFAULT_RULES }
  }
  listeners.forEach((l) => l(cache!))
  return cache!
}

export async function saveBusinessRules(rules: BusinessRules): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: "business_rules", value: rules, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  if (error) throw error
  cache = { ...rules }
  listeners.forEach((l) => l(cache!))
}

export function useBusinessRules(): BusinessRules {
  const [val, setVal] = useState<BusinessRules>(cache ?? DEFAULT_RULES)
  useEffect(() => {
    let alive = true
    if (!cache) {
      load().then((r) => alive && setVal(r))
    } else {
      setVal(cache)
    }
    const l = (r: BusinessRules) => alive && setVal(r)
    listeners.add(l)
    return () => {
      alive = false
      listeners.delete(l)
    }
  }, [])
  return val
}

/**
 * Helper síncrono para validar fuera de React (services, hooks).
 * Usa la caché — si aún no cargó devuelve DEFAULT_RULES.
 */
export function getBusinessRules(): BusinessRules {
  return cache ?? DEFAULT_RULES
}

/** Pre-carga la caché al boot. Llámalo desde App.tsx. */
export function preloadBusinessRules(): Promise<BusinessRules> {
  return load()
}

/* ════════════════════════ HELPERS DE EVALUACIÓN ════════════════════════ */

export interface ClaimEligibility {
  allowed: boolean
  remainingMs: number
  reason?: string
}

/** ¿Puede el cliente abrir un reclamo para esta venta? */
export function canClaim(
  rules: BusinessRules,
  sale: { paid_at?: string | null; created_at: string; status: string }
): ClaimEligibility {
  if (!rules.claim_window_enabled) return { allowed: true, remainingMs: Infinity }
  if (sale.status === "cancelled") {
    return { allowed: false, remainingMs: 0, reason: "Venta cancelada" }
  }
  const start = new Date(sale.paid_at ?? sale.created_at).getTime()
  const limit = start + rules.claim_window_hours * 3600 * 1000
  const remaining = limit - Date.now()
  if (remaining <= 0) {
    return {
      allowed: false,
      remainingMs: 0,
      reason: `Cerrado · pasaron más de ${rules.claim_window_hours}h desde la entrega`,
    }
  }
  return { allowed: true, remainingMs: remaining }
}

/** ¿Puede el cliente o admin cancelar este apartado/venta? */
export function canCancelSale(
  rules: BusinessRules,
  sale: { created_at: string; paid?: number | null; status: string }
): { allowed: boolean; reason?: string } {
  if (sale.status === "cancelled") return { allowed: false, reason: "Ya cancelada" }
  if (sale.status === "paid") return { allowed: false, reason: "Pagada por completo" }

  if (rules.cancellation_grace_enabled) {
    const created = new Date(sale.created_at).getTime()
    const limit = created + rules.cancellation_grace_days * 24 * 3600 * 1000
    if (Date.now() > limit) {
      return {
        allowed: false,
        reason: `Pasaron más de ${rules.cancellation_grace_days} días desde el apartado`,
      }
    }
  }
  if (rules.no_cancel_after_payment_enabled && (Number(sale.paid) || 0) > 0) {
    // simplificación: usamos created_at como proxy de "primer pago" si no
    // se conoce; el backend puede afinar esto con sales.payments[0].created_at.
    const created = new Date(sale.created_at).getTime()
    const limit = created + rules.no_cancel_after_payment_hours * 3600 * 1000
    if (Date.now() > limit) {
      return {
        allowed: false,
        reason: `No se puede cancelar después de ${rules.no_cancel_after_payment_hours}h del primer pago`,
      }
    }
  }
  return { allowed: true }
}

/** Formato humano de ms restantes. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Vencido"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h >= 1) return `${h}h ${m}m`
  return `${m}m`
}

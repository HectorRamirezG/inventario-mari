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

  /* ════════════════════ NUEVAS REGLAS (2026-06-17) ════════════════════ */

  /** Bloquea agregar al carrito (cliente) / vender (admin) cuando stock = 0.
   *  Si está apagada, permite pre-orden (vender en negativo). */
  block_oversell: boolean

  /** Días extra de gracia para clientes VIP (RFM tier "vip"). Se SUMA
   *  a `cancellation_grace_days` al evaluar `canCancelSale`. */
  vip_extra_grace_enabled: boolean
  vip_extra_grace_days: number

  /** Descuento automático cuando el carrito supera N piezas o N pesos.
   *  Se aplica como sugerencia en SalesPage (el admin decide aplicarlo). */
  auto_discount_enabled: boolean
  auto_discount_min_items: number
  auto_discount_percent: number

  /** Mensaje personalizado que aparece en el ticket del cliente
   *  (debajo de los items, antes del total). Útil para promos
   *  temporales, advertencias, agradecimientos especiales. */
  custom_ticket_message_enabled: boolean
  custom_ticket_message: string

  /** Auto-cancelar apartados sin abono pasados N días.
   *  Solo afecta apartados con `paid = 0` (nunca tocados). */
  auto_cancel_idle_enabled: boolean
  auto_cancel_idle_days: number

  /** Cierra la ventana de venta fuera de horario (admin sigue siempre).
   *  Solo afecta al carrito del cliente público en /tienda. */
  business_hours_enabled: boolean
  business_hours_open: string // "09:00"
  business_hours_close: string // "21:00"

  /** Alerta diaria al admin cuando "por cobrar" del día supera el umbral.
   *  Se evalúa en el Dashboard al cargar; aparece en el banner superior. */
  daily_pending_alert_enabled: boolean
  daily_pending_alert_threshold: number

  /** Meta diaria de ventas en pesos. Cuando se alcanza, dispara una
   *  notificación (sólo una vez por día) tipo "milestone" para celebrar. */
  daily_sales_goal_enabled: boolean
  daily_sales_goal_amount: number

  /* ════════════════ MÓDULOS DEL CLIENTE (switcheables) ════════════════
   * Cada uno activa/desactiva una sección completa de la PWA del cliente.
   * Filosofía: decide qué ver el cliente. Si apaga uno, desaparece.
   * ═══════════════════════════════════════════════════════════════════════ */

  /** Módulo "Mis deseos" del cliente: petición de productos
   *  (catalogo o externos). Si está apagado, el FAB y la pestaña se ocultan. */
  wishes_enabled: boolean

  /** Stories del día (estilo Instagram dentro de la tienda).
   *  Pendiente de implementar. Toggle ya disponible para reservar el flag. */
  stories_enabled: boolean

  /** Reseñas con foto del cliente (dentro de cada producto, vista compacta).
   *  Pendiente de implementar. Toggle reservado. */
  reviews_enabled: boolean
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

  // Nuevas
  block_oversell: true,
  vip_extra_grace_enabled: false,
  vip_extra_grace_days: 2,
  auto_discount_enabled: false,
  auto_discount_min_items: 10,
  auto_discount_percent: 5,
  custom_ticket_message_enabled: false,
  custom_ticket_message: "¡Gracias por tu compra! Síguenos en Instagram @beautysme",
  auto_cancel_idle_enabled: false,
  auto_cancel_idle_days: 7,
  business_hours_enabled: false,
  business_hours_open: "09:00",
  business_hours_close: "21:00",
  daily_pending_alert_enabled: false,
  daily_pending_alert_threshold: 3000,

  daily_sales_goal_enabled: false,
  daily_sales_goal_amount: 5000,

  // Módulos del cliente
  wishes_enabled: true,
  stories_enabled: false,
  reviews_enabled: false,
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

    // Nuevas (con defaults si no existen aún en BD)
    block_oversell: raw.block_oversell ?? DEFAULT_RULES.block_oversell,
    vip_extra_grace_enabled: !!raw.vip_extra_grace_enabled,
    vip_extra_grace_days: Number(raw.vip_extra_grace_days) || DEFAULT_RULES.vip_extra_grace_days,
    auto_discount_enabled: !!raw.auto_discount_enabled,
    auto_discount_min_items: Number(raw.auto_discount_min_items) || DEFAULT_RULES.auto_discount_min_items,
    auto_discount_percent: Number(raw.auto_discount_percent) || DEFAULT_RULES.auto_discount_percent,
    custom_ticket_message_enabled: !!raw.custom_ticket_message_enabled,
    custom_ticket_message:
      typeof raw.custom_ticket_message === "string" && raw.custom_ticket_message.trim()
        ? raw.custom_ticket_message
        : DEFAULT_RULES.custom_ticket_message,
    auto_cancel_idle_enabled: !!raw.auto_cancel_idle_enabled,
    auto_cancel_idle_days: Number(raw.auto_cancel_idle_days) || DEFAULT_RULES.auto_cancel_idle_days,
    business_hours_enabled: !!raw.business_hours_enabled,
    business_hours_open:
      typeof raw.business_hours_open === "string" && /^\d{2}:\d{2}$/.test(raw.business_hours_open)
        ? raw.business_hours_open
        : DEFAULT_RULES.business_hours_open,
    business_hours_close:
      typeof raw.business_hours_close === "string" && /^\d{2}:\d{2}$/.test(raw.business_hours_close)
        ? raw.business_hours_close
        : DEFAULT_RULES.business_hours_close,
    daily_pending_alert_enabled: !!raw.daily_pending_alert_enabled,
    daily_pending_alert_threshold:
      Number(raw.daily_pending_alert_threshold) || DEFAULT_RULES.daily_pending_alert_threshold,

    daily_sales_goal_enabled: !!raw.daily_sales_goal_enabled,
    daily_sales_goal_amount:
      Number(raw.daily_sales_goal_amount) || DEFAULT_RULES.daily_sales_goal_amount,

    // Módulos del cliente (default según DEFAULT_RULES)
    wishes_enabled: raw.wishes_enabled ?? DEFAULT_RULES.wishes_enabled,
    stories_enabled: raw.stories_enabled ?? DEFAULT_RULES.stories_enabled,
    reviews_enabled: raw.reviews_enabled ?? DEFAULT_RULES.reviews_enabled,
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
  sale: { created_at: string; paid?: number | null; status: string },
  opts: { isVip?: boolean } = {}
): { allowed: boolean; reason?: string } {
  if (sale.status === "cancelled") return { allowed: false, reason: "Ya cancelada" }
  if (sale.status === "paid") return { allowed: false, reason: "Pagada por completo" }

  if (rules.cancellation_grace_enabled) {
    const created = new Date(sale.created_at).getTime()
    let extraDays = 0
    if (rules.vip_extra_grace_enabled && opts.isVip) {
      extraDays = rules.vip_extra_grace_days
    }
    const limit = created + (rules.cancellation_grace_days + extraDays) * 24 * 3600 * 1000
    if (Date.now() > limit) {
      return {
        allowed: false,
        reason: `Pasaron más de ${rules.cancellation_grace_days + extraDays} días desde el apartado`,
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

/* ════════════════════════════════════════════════════════════════════
 * NUEVOS HELPERS (2026-06-17)
 * ════════════════════════════════════════════════════════════════════ */

/**
 * ¿Está la tienda dentro del horario comercial?
 * Si la regla está apagada, siempre devuelve true.
 * Tolerante a "cierre" después de medianoche (ej: 22:00 a 02:00 NO soportado
 * — para eso usar abierto siempre).
 */
export function isWithinBusinessHours(rules: BusinessRules, now = new Date()): boolean {
  if (!rules.business_hours_enabled) return true
  const [openH, openM] = rules.business_hours_open.split(":").map(Number)
  const [closeH, closeM] = rules.business_hours_close.split(":").map(Number)
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const openMin = openH * 60 + openM
  const closeMin = closeH * 60 + closeM
  if (closeMin <= openMin) return true // configuración inválida → no bloquear
  return minutesNow >= openMin && minutesNow < closeMin
}

/**
 * Calcula el descuento automático sugerido para un carrito según las reglas.
 * Devuelve 0 si no aplica.
 */
export function calculateAutoDiscount(
  rules: BusinessRules,
  cart: { totalItems: number; subtotal: number }
): { applies: boolean; amount: number; percent: number; reason: string } {
  if (!rules.auto_discount_enabled) {
    return { applies: false, amount: 0, percent: 0, reason: "" }
  }
  if (cart.totalItems < rules.auto_discount_min_items) {
    return {
      applies: false,
      amount: 0,
      percent: rules.auto_discount_percent,
      reason: `Faltan ${rules.auto_discount_min_items - cart.totalItems} piezas para ${rules.auto_discount_percent}% de descuento`,
    }
  }
  const amount = Math.round(cart.subtotal * (rules.auto_discount_percent / 100) * 100) / 100
  return {
    applies: true,
    amount,
    percent: rules.auto_discount_percent,
    reason: `${rules.auto_discount_percent}% por comprar ${cart.totalItems} piezas`,
  }
}

/**
 * Valida si una venta nueva supera el oversell permitido.
 * Devuelve un mensaje si NO se puede agregar; null si todo OK.
 */
export function validateStock(
  rules: BusinessRules,
  variant: { stock: number | null | undefined },
  requestedQty: number,
): string | null {
  if (!rules.block_oversell) return null
  const current = Number(variant.stock ?? 0)
  if (current <= 0) {
    return "Sin stock — la pre-venta está deshabilitada"
  }
  if (requestedQty > current) {
    return `Solo hay ${current} disponibles`
  }
  return null
}

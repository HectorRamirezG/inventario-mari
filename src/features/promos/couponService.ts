/**
 * Sistema de cupones de descuento — versión liviana sin SQL nuevo.
 *
 * Los cupones viven en `app_settings.coupons` como JSONB array. Mari
 * los crea/edita desde la UI de Reglas (BusinessRulesPage). El cliente
 * los aplica en el cart drawer del shop. Al confirmar el apartado, el
 * descuento se RESTA al `sales.total` (igual que los descuentos de
 * loyalty y volumen) y se deja una marca `[CUPÓN: <CODE> -$<X>]` en
 * `sales.notes` para tracking + visibilidad de Mari.
 *
 * NO se usa `sales.adjustment_amount` porque ese slot lo usa el ajuste
 * manual del admin (admin_adjust_sale). Si más adelante Mari quiere
 * acumular reportes por cupón con detalle fino, se migrará a columna
 * dedicada `sales.coupon_code` + `sales.coupon_discount`.
 *
 * Tracking de usos: contamos las sales (no canceladas) cuyo `notes`
 * contenga `[CUPÓN: <CODE>`. Best-effort. La race condition entre 2
 * clientes redimiendo el último uso al mismo tiempo es aceptable —
 * Mari puede regenerar o desactivar el cupón si pasa.
 */

import { useCallback, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { debug } from "../../lib/debug"

export type CouponType = "percent" | "fixed"

export interface Coupon {
  /** Código (uppercase, sin espacios). Es la primary key lógica. */
  code: string
  type: CouponType
  /** Si type='percent' → 0-100; si type='fixed' → monto en pesos. */
  amount: number
  /** Si null, ilimitado. */
  max_uses: number | null
  /** ISO YYYY-MM-DD. Si null, no expira. */
  expires_at: string | null
  /** Si false, NO se valida (Mari lo apagó sin borrarlo). */
  enabled: boolean
  /** Mínimo de subtotal en pesos para que aplique. 0 = cualquier monto. */
  min_subtotal: number
  /** Texto interno para que Mari recuerde de qué era. NO visible al cliente. */
  note?: string | null
}

export interface ValidatedCoupon {
  coupon: Coupon
  /** Descuento calculado en pesos (positivo = lo que se RESTA al subtotal). */
  discount: number
}

export type ValidationResult =
  | { ok: true; data: ValidatedCoupon }
  | { ok: false; reason: string }

const DEFAULT_COUPON: Coupon = {
  code: "",
  type: "percent",
  amount: 10,
  max_uses: null,
  expires_at: null,
  enabled: true,
  min_subtotal: 0,
  note: null,
}

/* ─────────────────── Sanitize / persist ─────────────────── */

/** Normaliza un cupón crudo (de DB o input admin). */
export function sanitizeCoupon(raw: any): Coupon {
  const code = String(raw?.code ?? "").toUpperCase().replace(/\s+/g, "").slice(0, 24)
  const type: CouponType = raw?.type === "fixed" ? "fixed" : "percent"
  const amountRaw = Number(raw?.amount)
  const amount =
    type === "percent"
      ? Math.max(0, Math.min(100, Number.isFinite(amountRaw) ? amountRaw : 0))
      : Math.max(0, Number.isFinite(amountRaw) ? amountRaw : 0)
  const max_uses =
    raw?.max_uses == null || raw?.max_uses === ""
      ? null
      : Math.max(1, Math.floor(Number(raw.max_uses) || 1))
  const expires_at =
    typeof raw?.expires_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.expires_at)
      ? raw.expires_at
      : null
  const min_subtotal = Math.max(0, Number(raw?.min_subtotal) || 0)
  const note = typeof raw?.note === "string" ? raw.note.slice(0, 120) : null
  return {
    code,
    type,
    amount,
    max_uses,
    expires_at,
    enabled: raw?.enabled !== false,
    min_subtotal,
    note,
  }
}

/* ─────────────────── Validation ─────────────────── */

/**
 * Valida un cupón contra el catálogo de cupones disponibles y el
 * subtotal del carrito. NO consulta usage server-side aquí — eso lo
 * hace `validateCouponWithUsage` async aparte.
 *
 * Reglas (orden):
 *  1. Code no vacío → busca match (uppercase).
 *  2. enabled === true.
 *  3. No expirado.
 *  4. subtotal >= min_subtotal.
 *  5. Calcula descuento. Si > subtotal lo capamos al subtotal (nunca negativo).
 */
export function validateCoupon(
  rawCode: string,
  subtotal: number,
  coupons: Coupon[],
): ValidationResult {
  const code = String(rawCode ?? "").toUpperCase().replace(/\s+/g, "")
  if (!code) return { ok: false, reason: "Escribe un código" }
  const coupon = coupons.find((c) => c.code === code)
  if (!coupon) return { ok: false, reason: "Cupón no encontrado" }
  if (!coupon.enabled) return { ok: false, reason: "Cupón inactivo" }
  if (coupon.expires_at) {
    const exp = new Date(coupon.expires_at + "T23:59:59")
    if (Date.now() > exp.getTime()) {
      return { ok: false, reason: "Cupón expirado" }
    }
  }
  if (coupon.min_subtotal > 0 && subtotal < coupon.min_subtotal) {
    return {
      ok: false,
      reason: `Tu carrito debe ser al menos $${coupon.min_subtotal}`,
    }
  }
  const discountRaw =
    coupon.type === "percent"
      ? (subtotal * coupon.amount) / 100
      : coupon.amount
  // Cap al subtotal para nunca regresar dinero ni dar negativo.
  const discount = Math.min(
    Math.max(0, Math.round(discountRaw * 100) / 100),
    subtotal,
  )
  if (discount <= 0) {
    return { ok: false, reason: "Cupón sin valor para este carrito" }
  }
  return { ok: true, data: { coupon, discount } }
}

/**
 * Versión async que también valida `max_uses` consultando cuántas sales
 * (no canceladas) usaron este cupón. Best-effort: si la query falla,
 * permite el uso (no bloquear al cliente por un error de red).
 */
export async function validateCouponWithUsage(
  rawCode: string,
  subtotal: number,
  coupons: Coupon[],
): Promise<ValidationResult> {
  const basic = validateCoupon(rawCode, subtotal, coupons)
  if (!basic.ok) return basic
  if (basic.data.coupon.max_uses == null) return basic
  try {
    const usage = await countCouponUsage(basic.data.coupon.code)
    if (usage >= basic.data.coupon.max_uses) {
      return { ok: false, reason: "Cupón agotado · ya alcanzó su tope de usos" }
    }
  } catch {
    /* network err: dejamos pasar */
  }
  return basic
}

/* ─────────────────── Tracking ─────────────────── */

/** Cuenta cuántas sales (no canceladas) usaron el cupón. Busca el
 *  marcador `[CUPÓN: <CODE>` dentro de `sales.notes`. Tolera tabla
 *  sin datos o errores de red. */
export async function countCouponUsage(code: string): Promise<number> {
  const norm = code.toUpperCase().trim()
  if (!norm) return 0
  try {
    const { count, error } = await supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .ilike("notes", `%[CUP%N: ${norm}%`)
      .neq("status", "cancelled")
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/** Marcador que se inyecta en `sales.notes` para identificar el cupón
 *  usado por una venta. Forma única para que `countCouponUsage` matchee
 *  consistente. Ejemplo: `[CUPÓN: MARIA20 -$25.50 (20%)]`. */
export function couponMarkerForNotes(
  code: string,
  discount: number,
  type: CouponType,
  amount: number,
): string {
  const norm = code.toUpperCase().trim()
  const label = type === "percent" ? `${amount}%` : `$${amount}`
  return `[CUPÓN: ${norm} -$${discount.toFixed(2)} (${label})]`
}

/* ─────────────────── App settings I/O ─────────────────── */

const SETTINGS_KEY = "coupons"

/** Lee los cupones desde app_settings. Devuelve [] si no hay nada
 *  guardado. Best-effort. */
export async function fetchCoupons(): Promise<Coupon[]> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle()
    if (error) {
      if (/does not exist|not found|404|PGRST/i.test(error.message)) return []
      debug.warn("[coupons] fetch:", error.message)
      return []
    }
    const arr = (data as any)?.value
    if (!Array.isArray(arr)) return []
    return arr.map(sanitizeCoupon).filter((c) => c.code.length > 0)
  } catch (e: any) {
    debug.warn("[coupons] fetch exception:", e?.message)
    return []
  }
}

/** Guarda los cupones (admin). Upsert en app_settings. */
export async function saveCoupons(coupons: Coupon[]): Promise<void> {
  const clean = coupons.map(sanitizeCoupon).filter((c) => c.code.length > 0)
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: SETTINGS_KEY, value: clean as any, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    )
  if (error) throw new Error(error.message)
}

/* ─────────────────── React hook ─────────────────── */

/**
 * Hook reactivo del catálogo de cupones. Carga inicial async,
 * refresca cuando cambia app_settings via realtime (mismo patrón que
 * useBusinessRules).
 */
export function useCoupons(): { coupons: Coupon[]; loading: boolean; refresh: () => Promise<void> } {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await fetchCoupons()
    setCoupons(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    fetchCoupons().then((d) => {
      if (alive) {
        setCoupons(d)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  return { coupons, loading, refresh: load }
}

/* ─────────────────── Factories ─────────────────── */

/** Crea un cupón "en blanco" listo para editar en la UI admin. */
export function emptyCoupon(): Coupon {
  return { ...DEFAULT_COUPON }
}

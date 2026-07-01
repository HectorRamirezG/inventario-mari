/**
 * Preventa por producto — cálculo del precio efectivo + helpers UI.
 *
 * Semántica:
 *   • Un producto está en preventa cuando `presale_active === true`
 *     Y (opcionalmente) `presale_ends_at` aún no ha pasado.
 *   • El precio de preventa se puede definir de DOS formas:
 *       - `presale_price` (precio fijo, mayor prioridad)
 *       - `presale_discount_pct` (descuento % sobre menudeo)
 *     Si el admin llena ambos, gana el precio fijo (más explícito).
 *   • Si el toggle está encendido pero no hay precio ni descuento, la
 *     preventa se trata como INACTIVA (sin efecto) — evita cobrar el
 *     mismo precio "de preventa" que el normal por olvido.
 *   • Cuando la preventa expira por fecha, `computePresale()` devuelve
 *     `active: false` en la siguiente lectura — sin cron, sin jobs.
 *     La próxima vez que el admin edite el producto verá que ya está
 *     vencida (podemos mostrar aviso en el editor).
 *
 * Aplicación al tier de precios:
 *   • La preventa SOLO reemplaza el tier `menudeo`. Los tiers medio y
 *     mayoreo (descuentos por volumen) se conservan. Esto evita "doble
 *     descuento" — si un cliente compra 20 piezas al mayoreo, ya está
 *     obteniendo el mejor precio por volumen.
 */

// Sub-slice del Product para no forzar el shape completo en cada llamada.
// Cualquier objeto que tenga estos campos sirve (cliente + admin).
export interface PresaleFields {
  presale_active?: boolean | null
  presale_price?: number | null
  presale_discount_pct?: number | null
  presale_ends_at?: string | null
  presale_note?: string | null
}

export type PresaleReason =
  | "off"       // toggle apagado
  | "expired"   // fecha límite ya pasó
  | "no_price"  // toggle encendido pero sin precio/pct configurado
  | "active"    // aplicando descuento

export interface PresaleInfo {
  /** ¿La preventa está APLICANDO descuento ahora mismo? */
  active: boolean
  /** Precio menudeo normal (sin preventa). */
  originalPrice: number
  /** Precio final que se debe cobrar (con preventa aplicada si active). */
  effectivePrice: number
  /** Ahorro absoluto ($) — 0 si !active. */
  savingAmount: number
  /** Ahorro relativo (%) — 0 si !active. Redondeado a 1 decimal. */
  savingPct: number
  /** Fecha límite parseada (o null si no hay). */
  endsAt: Date | null
  /** Nota opcional del admin (ej: "Entrega 15/jul"). */
  note: string | null
  /** Por qué está o no está activa (útil para UI del admin). */
  reason: PresaleReason
}

/**
 * Calcula el estado y precio efectivo de la preventa de un producto.
 * Es SÍNCRONO y PURO — se puede llamar en render sin efectos.
 */
export function computePresale(
  product: PresaleFields | null | undefined,
  originalPrice: number,
  now: Date = new Date(),
): PresaleInfo {
  const endsAt = product?.presale_ends_at
    ? new Date(product.presale_ends_at)
    : null

  const baseInactive = (reason: PresaleReason): PresaleInfo => ({
    active: false,
    originalPrice,
    effectivePrice: originalPrice,
    savingAmount: 0,
    savingPct: 0,
    endsAt,
    note: product?.presale_note ?? null,
    reason,
  })

  if (!product?.presale_active) return baseInactive("off")

  if (endsAt && endsAt.getTime() <= now.getTime()) {
    return baseInactive("expired")
  }

  const fixed =
    product.presale_price != null && Number(product.presale_price) > 0
      ? Number(product.presale_price)
      : null
  const pct =
    product.presale_discount_pct != null &&
    Number(product.presale_discount_pct) > 0
      ? Number(product.presale_discount_pct)
      : null

  let effective = originalPrice
  if (fixed != null) {
    effective = fixed
  } else if (pct != null) {
    effective = originalPrice * (1 - pct / 100)
  } else {
    // Toggle encendido pero sin precio ni % — no cobrar, tratar como off.
    return baseInactive("no_price")
  }

  // Nunca dejar el precio por debajo de 0 ni por arriba del normal
  // (defensa contra datos raros — si el precio "de preventa" fuera mayor
  // que el normal, mejor cobrar el normal).
  if (effective < 0) effective = 0
  if (effective > originalPrice) effective = originalPrice

  const rounded = Math.round(effective * 100) / 100
  const saving = Math.max(0, originalPrice - rounded)
  const savingPct =
    originalPrice > 0
      ? Math.round((saving / originalPrice) * 1000) / 10
      : 0

  return {
    active: true,
    originalPrice,
    effectivePrice: rounded,
    savingAmount: Math.round(saving * 100) / 100,
    savingPct,
    endsAt,
    note: product.presale_note ?? null,
    reason: "active",
  }
}

/**
 * Formato humano de "cuánto falta" para que termine la preventa.
 * Ejemplos: "Termina en 2 días", "Termina en 5 h", "Termina en 12 min",
 * "Última hora", "Vencida".
 *
 * Acepta Date, string ISO o `datetime-local` (yyyy-MM-ddTHH:mm). La
 * tolerancia a string evita bugs cuando el caller olvida convertir.
 */
export function formatPresaleCountdown(
  endsAt: Date | string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!endsAt) return null
  // Normaliza a Date sin importar el tipo de entrada. Un string ISO o
  // datetime-local es parseable por el constructor de Date. Si el input
  // resulta inválido (NaN), devolvemos null en vez de romper el render.
  const endsAtDate = endsAt instanceof Date ? endsAt : new Date(endsAt)
  if (isNaN(endsAtDate.getTime())) return null
  const diffMs = endsAtDate.getTime() - now.getTime()
  if (diffMs <= 0) return "Vencida"

  const min = Math.floor(diffMs / 60_000)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)

  if (day >= 2) return `Termina en ${day} días`
  if (day === 1) return "Termina mañana"
  if (hr >= 2) return `Termina en ${hr} h`
  if (hr === 1) return "Termina en 1 h"
  if (min > 5) return `Termina en ${min} min`
  return "Última hora"
}

/**
 * Convierte una fecha ISO (o Date) a formato `datetime-local` para
 * el `<input type="datetime-local">`. Si es null, devuelve "".
 * OJO: el input datetime-local es SIN zona horaria — usa hora local
 * del cliente. Al guardar convertimos de vuelta a ISO con `Z` (UTC).
 */
export function toDatetimeLocalValue(
  iso: string | null | undefined,
): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  // yyyy-MM-ddTHH:mm en hora local (sin segundos).
  const pad = (n: number) => n.toString().padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/**
 * Convierte el string del `<input type="datetime-local">` (hora local)
 * de vuelta a ISO UTC para guardar en Supabase. Si está vacío → null.
 */
export function fromDatetimeLocalValue(
  value: string | null | undefined,
): string | null {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

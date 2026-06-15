/**
 * Utilidades de formato centralizadas. Una sola fuente de verdad para
 * monedas, fechas y teléfonos. Si quieres cambiar el locale o moneda,
 * lo cambias aquí y se refleja en toda la app.
 */

// Único formateador: SIEMPRE 2 decimales en pesos mexicanos para
// que toda la app muestre $1,234.00 / $103.00 / $7,303.00 consistente.
const mxCurrency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const mxCurrencyDecimals = mxCurrency

const mxDateShort = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const mxDateLong = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
})

const mxDateTime = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const mxTime = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
})

/** Formato MXN sin decimales (`$1,234`). Tolerante a null/undefined/NaN. */
export const formatMoney = (n: number | string | null | undefined): string => {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0
  if (!Number.isFinite(v)) return mxCurrency.format(0)
  return mxCurrency.format(v)
}

/** Formato MXN con 2 decimales (`$1,234.50`). Útil en tickets. */
export const formatMoneyExact = (n: number | string | null | undefined): string => {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0
  if (!Number.isFinite(v)) return mxCurrencyDecimals.format(0)
  return mxCurrencyDecimals.format(v)
}

/** `12 jun 2026` */
export const formatDate = (iso: string | Date | null | undefined): string => {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return mxDateShort.format(d)
}

/** `viernes, 12 de junio de 2026` */
export const formatDateLong = (iso: string | Date | null | undefined): string => {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return mxDateLong.format(d)
}

/** `12 jun 2026, 14:30` */
export const formatDateTime = (iso: string | Date | null | undefined): string => {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return mxDateTime.format(d)
}

/** `14:30` */
export const formatTime = (iso: string | Date | null | undefined): string => {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return mxTime.format(d)
}

/** Días entre `iso` y ahora. Para alertas tipo "5 días sin pagar". */
export const daysSince = (iso: string | Date | null | undefined): number => {
  if (!iso) return 0
  const d = iso instanceof Date ? iso : new Date(iso)
  const ms = Date.now() - d.getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Normaliza un teléfono: deja solo dígitos. */
export const cleanPhone = (raw?: string | null): string =>
  (raw ?? "").replace(/[^\d]/g, "")

/** Formato MX visual: `55 1234 5678`. */
export const formatPhone = (raw?: string | null): string => {
  const d = cleanPhone(raw)
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`
  if (d.length === 12 && d.startsWith("52"))
    return `+52 ${d.slice(2, 4)} ${d.slice(4, 8)} ${d.slice(8)}`
  return d
}

/** Prefija +52 (México) si vino con 10 dígitos. */
export const intlPhone = (raw?: string | null): string => {
  const d = cleanPhone(raw)
  if (!d) return ""
  return d.length === 10 ? "52" + d : d
}

/** Formato de UUID corto y legible (`A1B2-C3D4`). */
export const shortId = (id: string): string => {
  if (!id) return "—"
  const cleaned = id.replace(/-/g, "").toUpperCase()
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`
}

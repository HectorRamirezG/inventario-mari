/**
 * Utilidades de formato centralizadas. Una sola fuente de verdad para
 * monedas, fechas y teléfonos. Si quieres cambiar el locale o moneda,
 * lo cambias aquí y se refleja en toda la app.
 */

/* ──────────────────────────────────────────────────────────────
 * Guards numéricos — defensa contra NaN/Infinity/null/undefined
 * ────────────────────────────────────────────────────────────── */

/**
 * Convierte cualquier valor a número finito. Si no es válido (NaN,
 * Infinity, null, undefined, "abc", etc.) regresa `fallback`.
 * Centraliza la defensa para que nunca aparezca `$NaN` o `Infinity%`
 * en la UI.
 */
export const safeNum = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback
  const n = typeof v === "string" ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

// Único formateador: SIEMPRE 2 decimales en pesos mexicanos para
// que toda la app muestre $1,234.00 / $103.00 / $7,303.00 consistente.
const mxCurrency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const mxCurrencyDecimals = mxCurrency

const mxNumber = new Intl.NumberFormat("es-MX")

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
  return mxCurrency.format(safeNum(n))
}

/** Formato MXN con 2 decimales (`$1,234.50`). Útil en tickets. */
export const formatMoneyExact = (n: number | string | null | undefined): string => {
  return mxCurrencyDecimals.format(safeNum(n))
}

/**
 * Formato porcentaje (`42.5%`). Tolerante a NaN/Infinity.
 * El input se espera como número directo (no fracción): `42.5` → `42.5%`.
 * Si quieres pasarle una fracción (0.425), usa `formatPercentRatio`.
 */
export const formatPercent = (n: number | string | null | undefined, decimals = 1): string => {
  const v = safeNum(n)
  return `${v.toFixed(decimals)}%`
}

/**
 * Formato porcentaje desde fracción 0-1 (`0.425` → `42.5%`). Tolerante.
 * Si el divisor sería cero, regresa "—" en vez de Infinity.
 */
export const formatPercentRatio = (
  numerator: number | string | null | undefined,
  denominator: number | string | null | undefined,
  decimals = 1,
): string => {
  const num = safeNum(numerator)
  const den = safeNum(denominator)
  if (den === 0) return "—"
  return `${((num / den) * 100).toFixed(decimals)}%`
}

/** Formato numérico con separadores de miles. Tolerante. */
export const formatNumber = (n: number | string | null | undefined): string => {
  return mxNumber.format(safeNum(n))
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

/**
 * Fecha relativa amigable: "hace 3 min", "hace 2 h", "ayer", "hace 4 días".
 * Si es futuro, devuelve "en X". Tolera null/undefined.
 */
export const formatRelative = (iso: string | Date | null | undefined): string => {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const diffMs = Date.now() - d.getTime()
  const abs = Math.abs(diffMs)
  const future = diffMs < 0
  const sec = Math.round(abs / 1000)
  if (sec < 45) return future ? "en unos seg" : "hace unos seg"
  const min = Math.round(sec / 60)
  if (min < 60) return future ? `en ${min} min` : `hace ${min} min`
  const hr = Math.round(min / 60)
  if (hr < 24) return future ? `en ${hr} h` : `hace ${hr} h`
  const day = Math.round(hr / 24)
  if (day === 1) return future ? "mañana" : "ayer"
  if (day < 7) return future ? `en ${day} días` : `hace ${day} días`
  if (day < 30) {
    const w = Math.round(day / 7)
    return future ? `en ${w} sem` : `hace ${w} sem`
  }
  if (day < 365) {
    const m = Math.round(day / 30)
    return future ? `en ${m} meses` : `hace ${m} meses`
  }
  const y = Math.round(day / 365)
  return future ? `en ${y} años` : `hace ${y} años`
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

/**
 * Helpers de moneda y números (centralizados).
 * Reemplazan los múltiples `new Intl.NumberFormat(...)` dispersos.
 */

const _mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
})

const _mxn2 = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
})

export const money = (n: number | string | null | undefined): string =>
  _mxn.format(Number(n ?? 0) || 0)

export const moneyDetailed = (n: number | string | null | undefined): string =>
  _mxn2.format(Number(n ?? 0) || 0)

export const toNumber = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const round2 = (n: number) => Math.round(n * 100) / 100

import { formatMoney } from "../../lib/format"
import DeliveryStatusChip from "./DeliveryStatusChip"

/**
 * Resumen monetario reusable de una venta/ticket.
 *
 * Pinta tres columnas: Total / Pagado / Saldo, y opcionalmente un chip
 * de status de comanda al pie. Se usa en TicketView, TicketDrawer y
 * PublicTicketPage para que las cifras siempre se vean igual.
 *
 * Variantes:
 *  - "compact": layout más chico para drawers y previews
 *  - "full":    layout grande con sombra para la pantalla principal
 */
export interface TicketTotalsRowProps {
  total: number | string | null | undefined
  paid: number | string | null | undefined
  balance: number | string | null | undefined
  /** Status de la comanda asociada (opcional). */
  deliveryStatus?: string | null
  variant?: "compact" | "full"
  className?: string
}

export default function TicketTotalsRow({
  total,
  paid,
  balance,
  deliveryStatus,
  variant = "full",
  className = "",
}: TicketTotalsRowProps) {
  const t = Number(total) || 0
  const p = Number(paid) || 0
  const b = Number(balance) || 0
  const isPaid = b <= 0

  const pad = variant === "compact" ? "p-3" : "p-4"
  const valueSize =
    variant === "compact" ? "text-sm" : "text-base"
  const labelSize = "text-[9px]"

  return (
    <div
      className={`grid grid-cols-3 gap-2 rounded-2xl border ${pad} ${
        isPaid
          ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5"
          : "border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40"
      } ${className}`}
    >
      <Cell
        label="Total"
        value={formatMoney(t)}
        labelSize={labelSize}
        valueSize={valueSize}
        tone="slate"
      />
      <Cell
        label="Pagado"
        value={formatMoney(p)}
        labelSize={labelSize}
        valueSize={valueSize}
        tone="emerald"
      />
      <Cell
        label={isPaid ? "Liquidado" : "Saldo"}
        value={formatMoney(b)}
        labelSize={labelSize}
        valueSize={valueSize}
        tone={isPaid ? "emerald" : "rose"}
      />
      {deliveryStatus && (
        <div className="col-span-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            Entrega
          </span>
          <DeliveryStatusChip status={deliveryStatus} size="sm" />
        </div>
      )}
    </div>
  )
}

function Cell({
  label,
  value,
  labelSize,
  valueSize,
  tone,
}: {
  label: string
  value: string
  labelSize: string
  valueSize: string
  tone: "slate" | "emerald" | "rose"
}) {
  const colors = {
    slate: "text-slate-700 dark:text-slate-100",
    emerald: "text-emerald-700 dark:text-emerald-300",
    rose: "text-rose-700 dark:text-rose-300",
  }
  return (
    <div className="text-center">
      <p
        className={`${labelSize} font-black uppercase tracking-widest text-slate-400`}
      >
        {label}
      </p>
      <p className={`${valueSize} font-black tabular-nums leading-tight ${colors[tone]}`}>
        {value}
      </p>
    </div>
  )
}

import { motion } from "framer-motion"
import { formatMoney } from "../../lib/format"

/**
 * Desglose monetario completo de un ticket: Subtotal → Envío → Ajuste →
 * Total → Pagado → Pendiente, más el "festivo" cuando hay descuento manual.
 *
 * Este componente reemplaza dos bloques duplicados que vivían en
 * `TicketDrawer.tsx` y `PublicTicketPage.tsx`, asegurando que el cliente
 * (vista pública) y el admin (drawer interno) vean EXACTAMENTE el mismo
 * desglose con las mismas reglas: signos, gratis para envío y motivo del
 * ajuste cuando aplica.
 *
 * `tone` controla el contraste para light/dark:
 *  - "light" → fondo `bg-slate-50`, sin dark mode (vista pública del cliente).
 *  - "auto"  → fondo `bg-slate-50 dark:bg-slate-800/60` (admin/drawer).
 */
export interface TicketTotalsDetailedProps {
  items: { qty: number; unit_price: number }[]
  total: number
  paid: number
  balance: number
  adjustmentAmount?: number | null
  adjustmentReason?: string | null
  shippingAmount?: number | null
  isForeignShipping?: boolean | null
  tone?: "light" | "auto"
  /** Texto para el festivo de descuento (cambia entre admin y cliente). */
  discountCheerText?: string
}

export default function TicketTotalsDetailed({
  items,
  total,
  paid,
  balance,
  adjustmentAmount,
  adjustmentReason,
  shippingAmount,
  isForeignShipping,
  tone = "auto",
  discountCheerText,
}: TicketTotalsDetailedProps) {
  const subtotal = items.reduce(
    (a, it) => a + Number(it.qty) * Number(it.unit_price),
    0
  )
  const adj = Number(adjustmentAmount) || 0
  const ship = Number(shippingAmount) || 0
  const isForeign = !!isForeignShipping
  const reason = (adjustmentReason ?? "").trim()

  const wrapBg =
    tone === "light"
      ? "bg-slate-50"
      : "bg-slate-50 dark:bg-slate-800/60"

  return (
    <>
      <div className={`${wrapBg} rounded-2xl p-4 space-y-1.5`}>
        <Row label="Subtotal" value={formatMoney(subtotal)} tone={tone} />
        {(isForeign || ship > 0) && (
          <Row
            label={isForeign ? "Envío foráneo" : "Envío"}
            value={ship > 0 ? formatMoney(ship) : "¡Gratis! 🎉"}
            success={ship === 0 && isForeign}
            tone={tone}
          />
        )}
        {adj > 0 && tone === "auto" && (
          // En el drawer admin, formato simple "- $X" como antes (sin reason
          // expandido) para no robar espacio. El reason ya se muestra arriba
          // en otro chip si existe.
          <Row
            label={reason || "Descuento especial"}
            value={`- ${formatMoney(adj)}`}
            discount
            tone={tone}
          />
        )}
        {adj < 0 && tone === "auto" && (
          <Row
            label={reason || "Cargo extra"}
            value={`+ ${formatMoney(Math.abs(adj))}`}
            tone={tone}
          />
        )}
        {adj !== 0 && tone === "light" && (
          // En la vista pública del cliente, formato expandido con motivo
          // citado debajo para máxima transparencia.
          <AdjustmentRowExpanded amount={adj} reason={reason} />
        )}
        <Row label="Total" value={formatMoney(total)} bold tone={tone} />
        {paid > 0 && (
          <Row label="Pagado" value={formatMoney(paid)} success tone={tone} />
        )}
        {balance > 0 && (
          <Row
            label="Pendiente"
            value={formatMoney(balance)}
            danger
            bold
            tone={tone}
          />
        )}
      </div>

      {adj > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.15 }}
          className={`mt-3 rounded-2xl px-3 py-2.5 flex items-center gap-2 border border-emerald-200 ${
            tone === "auto" ? "dark:border-emerald-500/30" : ""
          } bg-gradient-to-r from-emerald-50 to-teal-50 ${
            tone === "auto" ? "dark:from-emerald-500/10 dark:to-teal-500/10" : ""
          } text-emerald-700 ${tone === "auto" ? "dark:text-emerald-300" : ""}`}
        >
          <span className="text-base" aria-hidden>🎉</span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest leading-tight">
              ¡Se aplicó un descuento manual!
            </p>
            <p className="text-[10px] font-bold leading-tight opacity-80">
              {discountCheerText ?? `Te apoyamos con ${formatMoney(adj)} ✨`}
            </p>
          </div>
        </motion.div>
      )}
    </>
  )
}

function Row({
  label,
  value,
  bold,
  success,
  danger,
  discount,
  tone = "auto",
}: {
  label: string
  value: string
  bold?: boolean
  success?: boolean
  danger?: boolean
  discount?: boolean
  tone?: "light" | "auto"
}) {
  const labelDark = tone === "auto" ? "dark:text-slate-100" : ""
  const labelMuted = tone === "auto" ? "dark:text-slate-400" : ""
  return (
    <div className="flex justify-between text-sm">
      <span
        className={
          bold
            ? `font-bold text-slate-700 ${labelDark}`
            : `text-slate-500 ${labelMuted}`
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${bold ? "font-black" : "font-bold"} ${
          success ? "text-emerald-600" : ""
        } ${danger ? "text-rose-600" : ""} ${discount ? "text-rose-600" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

function AdjustmentRowExpanded({
  amount,
  reason,
}: {
  amount: number
  reason: string
}) {
  const isDiscount = amount > 0
  const sign = isDiscount ? "-" : "+"
  const tone = isDiscount ? "text-rose-600" : "text-amber-700"
  const subLabel = isDiscount ? "Descuento" : "Cargo extra"
  return (
    <div className="py-0.5">
      <div className={`flex justify-between text-sm ${tone}`}>
        <span className="font-bold">Ajuste manual</span>
        <span className="tabular-nums font-black">
          {sign}{" "}
          {new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN",
          }).format(Math.abs(amount))}
        </span>
      </div>
      <div className="flex justify-between items-start text-[10px] text-slate-500 mt-0.5">
        <span className="uppercase tracking-wider font-bold">{subLabel}</span>
        {reason && (
          <span className="italic text-right ml-2 max-w-[65%] truncate">
            "{reason}"
          </span>
        )}
      </div>
    </div>
  )
}

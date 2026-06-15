import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, Printer, MessageCircle, Mail, Copy, Check } from "lucide-react"
import { useState } from "react"
import { toast } from "react-hot-toast"

import type { Sale } from "../../types/database"
import {
  formatMoney,
  formatMoneyExact,
  formatDateTime,
  shortId,
  intlPhone,
} from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import { buildReceiptText, sendReceiptByWhatsApp } from "../../lib/receipt"

interface Props {
  open: boolean
  sale: Sale | null
  onClose: () => void
}

/**
 * Ticket de venta imprimible. Diseñado para impresora térmica de 80mm
 * (320px) y también se ve bien en pantalla. Usa CSS print para esconder
 * lo demás cuando el usuario imprime.
 */
export default function TicketView({ open, sale, onClose }: Props) {
  const ticketRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const store = getStoreInfo()

  // Bloquea scroll del body cuando está abierto
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  if (typeof document === "undefined" || !sale) return null

  const handlePrint = () => {
    document.body.classList.add("printing-ticket")
    window.print()
    setTimeout(() => document.body.classList.remove("printing-ticket"), 500)
  }

  const handleEmail = () => {
    const subject = `Recibo Mari ${shortId(sale.id)}`
    const body = buildReceiptText(sale)
    const href = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`
    window.location.href = href
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildReceiptText(sale))
      setCopied(true)
      toast.success("Recibo copiado")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  const balance = Number(sale.balance) || 0
  const phone = intlPhone(sale.customer_phone)

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 print:p-0 print:bg-white"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-md print:hidden"
            onClick={onClose}
          />

          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="relative w-full max-w-sm flex flex-col gap-3 print:max-w-none print:m-0"
          >
            {/* Acciones (ocultas al imprimir) */}
            <div className="flex items-center justify-between print:hidden">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/80">
                Recibo {shortId(sale.id)}
              </span>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur text-white flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            {/* TICKET en sí */}
            <div
              id="ticket-printable"
              ref={ticketRef}
              className="bg-white text-slate-900 rounded-3xl print:rounded-none p-6 print:p-2 font-mono text-[12px] shadow-2xl print:shadow-none"
            >
              {/* Header */}
              <div className="text-center">
                <h2 className="text-[18px] font-black uppercase tracking-tight">
                  {store.name}
                </h2>
                {store.tagline && (
                  <p className="text-[10px] text-slate-500">{store.tagline}</p>
                )}
                {store.address && (
                  <p className="text-[10px] mt-1">{store.address}</p>
                )}
                {store.phone && (
                  <p className="text-[10px]">Tel: {store.phone}</p>
                )}
              </div>

              <Divider />

              {/* Metadata */}
              <div className="text-[11px] leading-relaxed">
                <RowKV label="Folio" value={shortId(sale.id)} />
                <RowKV label="Fecha" value={formatDateTime(sale.created_at)} />
                <RowKV label="Cliente" value={sale.customer_name ?? "—"} />
                {sale.customer_phone && (
                  <RowKV label="Tel" value={sale.customer_phone} />
                )}
                {sale.is_layaway && (
                  <p className="text-center font-black mt-1 text-[10px] tracking-widest">
                    *** APARTADO ***
                  </p>
                )}
              </div>

              <Divider />

              {/* Items */}
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-dashed border-slate-300">
                    <th className="text-left font-black uppercase pb-1">
                      Producto
                    </th>
                    <th className="text-center font-black uppercase pb-1 w-8">
                      Cant
                    </th>
                    <th className="text-right font-black uppercase pb-1 w-16">
                      Importe
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(sale.sale_items ?? []).map((it) => (
                    <tr key={it.id} className="align-top">
                      <td className="py-1 pr-2">
                        <p className="leading-tight">{it.product_name}</p>
                        {it.variant_name && (
                          <p className="text-[10px] text-slate-500 leading-tight">
                            {it.variant_name}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500 leading-tight">
                          {formatMoneyExact(it.unit_price)} c/u
                          {it.tier !== "menudeo" && ` · ${it.tier}`}
                        </p>
                      </td>
                      <td className="text-center font-black py-1 tabular-nums">
                        {it.qty}
                      </td>
                      <td className="text-right py-1 font-black tabular-nums">
                        {formatMoney(it.qty * it.unit_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Divider />

              {/* Totales — con ajuste/descuento + envío desglosados */}
              {(() => {
                const items = sale.sale_items ?? []
                const subtotal = items.reduce(
                  (acc, it) => acc + Number(it.qty) * Number(it.unit_price),
                  0
                )
                const adj = Number(sale.adjustment_amount) || 0
                const ship = Number(sale.shipping_amount) || 0
                const isForeign = !!sale.is_foreign_shipping
                return (
                  <div className="space-y-1 text-[12px]">
                    <Row label="Subtotal" value={formatMoneyExact(subtotal)} />
                    {(isForeign || ship > 0) && (
                      <Row
                        label={isForeign ? "Envío foráneo" : "Envío"}
                        value={ship > 0 ? formatMoneyExact(ship) : "¡Gratis! 🎉"}
                      />
                    )}
                    {adj > 0 && (
                      <Row
                        label={sale.adjustment_reason || "Descuento Mari"}
                        value={`- ${formatMoneyExact(adj)}`}
                        discount
                      />
                    )}
                    {adj < 0 && (
                      <Row
                        label={sale.adjustment_reason || "Cargo extra"}
                        value={`+ ${formatMoneyExact(Math.abs(adj))}`}
                      />
                    )}
                    <Row label="TOTAL" value={formatMoneyExact(sale.total)} bold />
                    {Number(sale.paid) > 0 && (
                      <Row label="Pagado" value={formatMoneyExact(sale.paid)} />
                    )}
                    {balance > 0 ? (
                      <Row label="SALDO" value={formatMoneyExact(balance)} bold />
                    ) : (
                      <p className="text-center font-black mt-1 tracking-widest">
                        *** PAGADO ***
                      </p>
                    )}
                    {adj > 0 && (
                      <p className="text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 mt-1">
                        🎉 Descuento aplicado: {formatMoneyExact(adj)}
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Pagos */}
              {sale.payments && sale.payments.length > 0 && (
                <>
                  <Divider />
                  <div className="text-[10px]">
                    <p className="font-black uppercase mb-1">Pagos</p>
                    {sale.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between leading-tight"
                      >
                        <span>
                          {formatDateTime(p.created_at)} · {p.method ?? "efectivo"}
                        </span>
                        <span className="font-black tabular-nums">
                          {formatMoney(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Liga de pago */}
              {balance > 0 && sale.payment_url && (
                <>
                  <Divider />
                  <p className="text-[10px] text-center">
                    Paga en línea:
                    <br />
                    <span className="break-all">{sale.payment_url}</span>
                  </p>
                </>
              )}

              {sale.notes && (
                <>
                  <Divider />
                  <p className="text-[10px] italic">Nota: {sale.notes}</p>
                </>
              )}

              <Divider />

              {/* Footer */}
              <div className="text-center text-[10px] leading-tight">
                <p className="font-black">{store.thanks_message}</p>
                <p className="text-slate-500 mt-1">{store.footer_note}</p>
                <p className="mt-2 text-[9px] text-slate-400">
                  Generado {formatDateTime(new Date())}
                </p>
              </div>
            </div>

            {/* Acciones secundarias */}
            <div className="grid grid-cols-4 gap-2 print:hidden">
              <ActionBtn
                icon={<Printer size={14} />}
                label="Imprimir"
                onClick={handlePrint}
              />
              <ActionBtn
                icon={<MessageCircle size={14} />}
                label="WhatsApp"
                onClick={() => sendReceiptByWhatsApp(sale)}
                tone="emerald"
                disabled={!phone && !sale.customer_phone}
              />
              <ActionBtn
                icon={<Mail size={14} />}
                label="Email"
                onClick={handleEmail}
              />
              <ActionBtn
                icon={copied ? <Check size={14} /> : <Copy size={14} />}
                label={copied ? "Copiado" : "Copiar"}
                onClick={handleCopy}
                tone={copied ? "emerald" : "default"}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

/* ---------- Sub-componentes ---------- */

function Divider() {
  return (
    <div className="my-2 border-t border-dashed border-slate-300" aria-hidden />
  )
}

function Row({
  label,
  value,
  bold = false,
  discount = false,
}: {
  label: string
  value: string
  bold?: boolean
  discount?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        bold ? "font-black text-[14px]" : ""
      } ${discount ? "text-rose-600" : ""}`}
    >
      <span className="uppercase">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="font-black uppercase w-14">{label}:</span>
      <span className="flex-1 truncate">{value}</span>
    </div>
  )
}

function ActionBtn({
  icon,
  label,
  onClick,
  tone = "default",
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  tone?: "default" | "emerald"
  disabled?: boolean
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500 text-white hover:bg-emerald-600"
      : "bg-white text-slate-800 hover:bg-slate-100"
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 h-14 rounded-2xl font-black uppercase text-[8px] tracking-widest transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${toneClass}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  getPublicDeliveryNote,
  updateDeliveryStatusByToken,
  DELIVERY_STATUS_LABEL,
  type PublicDeliveryNote,
} from "../delivery/deliveryService"
import { formatMoney, formatDateTime, shortId } from "../../lib/format"
import { getStoreInfo } from "../../lib/useStoreInfo"
import Skeleton from "../../components/ui/Skeleton"

const PAY_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta (terminal)",
  "ya pagado": "Ya pagado",
}

/**
 * Vista pública del repartidor (/comanda/:token). Sin login.
 *
 * Diseño: mismo lenguaje visual que el ticket de venta (font-mono +
 * separadores dashed + bloques label/valor). Sencillo, legible en
 * cualquier celular, "imprimible mentalmente". Sin gradientes ni cards
 * grandes — todo cabe en una sola hoja virtual.
 */
export default function PublicDeliveryNotePage() {
  const { token } = useParams<{ token: string }>()
  const [note, setNote] = useState<PublicDeliveryNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const store = getStoreInfo()

  useEffect(() => {
    if (!token) {
      setError("Sin token")
      setLoading(false)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const data = await getPublicDeliveryNote(token)
        if (!alive) return
        if (!data) {
          setError("Comanda no encontrada")
        } else {
          setNote(data)
        }
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Error al cargar")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [token])

  async function handleMarkStatus(next: "picked_up" | "delivered") {
    if (!note || !token) return
    setUpdating(true)
    const tid = toast.loading("Actualizando...")
    try {
      await updateDeliveryStatusByToken(token, next)
      setNote((prev) => (prev ? { ...prev, status: next } : prev))
      toast.success(
        next === "delivered" ? "¡Entregado! Gracias 💖" : "Estatus actualizado",
        { id: tid },
      )
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar", { id: tid })
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6">
        <Skeleton className="w-full max-w-sm h-96" rounded="xl" />
      </div>
    )
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-premium p-8 text-center max-w-sm">
          <AlertCircle size={32} className="mx-auto text-rose-400 mb-3" />
          <h1 className="text-base font-black uppercase tracking-tight">
            Comanda no disponible
          </h1>
          <p className="text-[11px] font-bold text-slate-500 mt-2">
            {error ?? "El link puede estar caducado o ser inválido."}
          </p>
          <Link
            to="/"
            className="inline-block mt-4 text-[10px] font-black uppercase tracking-widest text-primary"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    )
  }

  const isPaid = note.sale.balance <= 0
  const mapUrl = note.delivery_location_url
  const folio = shortId(note.sale.id).toUpperCase()
  const phoneClean = note.customer.phone
    ? note.customer.phone.replace(/\D/g, "")
    : null
  const canMarkPickedUp =
    note.status !== "picked_up" &&
    note.status !== "delivered" &&
    note.status !== "cancelled"
  const canMarkDelivered =
    note.status === "picked_up"

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 py-4 px-3 print:bg-white print:p-0">
      <div className="max-w-sm mx-auto flex flex-col gap-3">
        {/* TICKET-COMANDA en sí */}
        <div
          className="bg-white text-slate-900 rounded-3xl print:rounded-none p-6 print:p-2 font-mono text-[12px] shadow-2xl print:shadow-none"
        >
          {/* Header */}
          <div className="text-center">
            <h2 className="text-[18px] font-black uppercase tracking-tight">
              {store.name}
            </h2>
            <p className="text-[10px] text-slate-500">Comanda de entrega</p>
          </div>

          <Divider />

          {/* Info principal */}
          <div className="text-[11px] leading-relaxed">
            <Row label="Folio" value={folio} />
            <Row label="Fecha" value={formatDateTime(note.created_at)} />
            <Row label="Cliente" value={note.customer.name || "—"} />
            {note.customer.phone && (
              <Row
                label="Tel"
                value={
                  phoneClean ? (
                    <a
                      href={`tel:${phoneClean}`}
                      className="underline text-primary"
                    >
                      {note.customer.phone}
                    </a>
                  ) : (
                    note.customer.phone
                  )
                }
              />
            )}
            {note.delivery_address && (
              <Row label="Dir" value={note.delivery_address} />
            )}
            {mapUrl && (
              <Row
                label="Pin"
                value={
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-primary"
                  >
                    Abrir ubicación en Maps
                  </a>
                }
              />
            )}
            <p className="text-center font-black mt-1 text-[10px] tracking-widest">
              *** {DELIVERY_STATUS_LABEL[note.status].toUpperCase()} ***
            </p>
          </div>

          {/* Logística extra (opcional) */}
          {(note.delivery_zone ||
            note.delivery_time_target ||
            note.meeting_point ||
            note.driver_name) && (
            <>
              <Divider />
              <div className="text-[11px] leading-relaxed">
                {note.delivery_zone && (
                  <Row label="Zona" value={note.delivery_zone} />
                )}
                {note.delivery_time_target && (
                  <Row label="Hora" value={note.delivery_time_target} />
                )}
                {note.meeting_point && (
                  <Row label="Punto" value={note.meeting_point} />
                )}
                {note.driver_name && (
                  <Row label="Lleva" value={note.driver_name} />
                )}
              </div>
            </>
          )}

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
              {note.items.map((it, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">
                    <p className="leading-tight">{it.name}</p>
                    {it.variant_name && (
                      <p className="text-[10px] text-slate-500 leading-tight">
                        {it.variant_name}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 leading-tight">
                      {formatMoney(it.unit_price)} c/u
                    </p>
                  </td>
                  <td className="text-center font-black py-1 tabular-nums">
                    {it.qty}
                  </td>
                  <td className="text-right py-1 font-black tabular-nums">
                    {formatMoney(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Divider />

          {/* Totales */}
          <div className="space-y-1 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="uppercase">Total del pedido</span>
              <span className="tabular-nums">{formatMoney(note.sale.total)}</span>
            </div>
            {note.sale.paid > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span className="uppercase">Pagado</span>
                <span className="tabular-nums">
                  {formatMoney(note.sale.paid)}
                </span>
              </div>
            )}
            <div
              className={`flex items-center justify-between font-black text-[14px] ${
                isPaid ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              <span className="uppercase">
                {isPaid ? "Ya pagado" : "Por cobrar"}
              </span>
              <span className="tabular-nums">
                {formatMoney(
                  isPaid ? 0 : note.amount_to_collect || note.sale.balance,
                )}
              </span>
            </div>
            {note.payment_method_expected && !isPaid && (
              <p className="text-[10px] text-center text-slate-500 italic mt-0.5">
                Método esperado:{" "}
                {PAY_LABEL[note.payment_method_expected.toLowerCase()] ??
                  note.payment_method_expected}
              </p>
            )}
          </div>

          {/* Notas (caja amarilla, mismo estilo que ticket regalo) */}
          {note.notes && (
            <>
              <Divider />
              <div className="my-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-[10px]">
                <p className="font-black uppercase tracking-widest text-amber-700 text-center mb-1">
                  ※ Notas de entrega ※
                </p>
                <p className="text-amber-900 italic whitespace-pre-line">
                  {note.notes}
                </p>
              </div>
            </>
          )}

          <Divider />

          {/* Footer */}
          <div className="text-center text-[10px] leading-tight">
            <p className="font-black">¡Gracias por entregar!</p>
            <p className="text-slate-500 mt-1">
              Marca el estatus abajo cuando muevas el pedido.
            </p>
            <p className="mt-2 text-[9px] text-slate-400">
              Comanda generada {formatDateTime(note.created_at)}
            </p>
          </div>
        </div>

        {/* Acciones del repartidor — fuera del ticket para no romper el
            print preview. Botones grandes para usar con una mano. */}
        {note.status !== "delivered" && note.status !== "cancelled" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-2 print:hidden"
          >
            <button
              type="button"
              onClick={() => handleMarkStatus("picked_up")}
              disabled={updating || !canMarkPickedUp}
              className="h-12 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updating && note.status !== "picked_up" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Truck size={12} />
              )}
              {note.status === "picked_up" ? "Ya en camino ✓" : "Voy en camino"}
            </button>
            <button
              type="button"
              onClick={() => handleMarkStatus("delivered")}
              disabled={updating || !canMarkDelivered}
              className="h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                canMarkDelivered
                  ? "Marcar como entregado"
                  : "Primero marca 'Voy en camino'"
              }
            >
              <CheckCircle2 size={12} />
              Entregado
            </button>
          </motion.div>
        )}

        {/* Banner si ya está entregado */}
        {note.status === "delivered" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-emerald-100 border border-emerald-300 p-4 text-center print:hidden"
          >
            <CheckCircle2 size={24} className="text-emerald-600 mx-auto mb-1" />
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">
              Entrega completada
            </p>
            <p className="text-[9px] font-bold text-emerald-700/70 mt-0.5">
              Gracias por tu trabajo
            </p>
          </motion.div>
        )}

        {/* WhatsApp al cliente como atajo (siempre visible si hay phone) */}
        {phoneClean && note.status !== "delivered" && (
          <a
            href={`https://wa.me/${phoneClean}?text=${encodeURIComponent(
              `Hola ${note.customer.name ?? ""}, soy el repartidor de ${store.name}. ¿Puedo confirmar tu ubicación?`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-10 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press print:hidden"
          >
            <ArrowRight size={11} />
            WhatsApp al cliente
          </a>
        )}
      </div>
    </div>
  )
}

/** Separador dashed reusable (mismo del ticket de venta). */
function Divider() {
  return (
    <div
      className="my-2 border-t border-dashed border-slate-300"
      aria-hidden="true"
    />
  )
}

/** Renglón label/valor con el mismo formato del ticket de venta. */
function Row({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex gap-2">
      <span className="font-black uppercase w-14 shrink-0">{label}:</span>
      <span className="flex-1 truncate">{value}</span>
    </div>
  )
}

import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Truck,
  Phone,
  MapPin,
  Clock,
  DollarSign,
  StickyNote,
  ExternalLink,
  Package,
  CheckCircle2,
  AlertCircle,
  User as UserIcon,
  ArrowRight,
  Loader2,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  getPublicDeliveryNote,
  updateDeliveryStatus,
  DELIVERY_STATUS_LABEL,
  type PublicDeliveryNote,
  type DeliveryStatus,
} from "../delivery/deliveryService"
import { formatMoney, formatDateTime } from "../../lib/format"
import Avatar from "../../components/ui/Avatar"
import Skeleton from "../../components/ui/Skeleton"
import { useAuth } from "../../lib/useAuth"

const PAY_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta (terminal)",
  "ya pagado": "Ya pagado",
}

/**
 * Vista pública para el repartidor. Abre con un link tipo
 * /comanda/<token>. NO requiere login. Muestra TODA la info necesaria
 * para entregar bien: cliente con foto, productos, mapa, total a cobrar,
 * notas, hora prometida.
 */
export default function PublicDeliveryNotePage() {
  const { token } = useParams<{ token: string }>()
  const { session } = useAuth()
  const [note, setNote] = useState<PublicDeliveryNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

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

  async function handleMarkStatus(next: DeliveryStatus) {
    if (!note) return
    setUpdating(true)
    const tid = toast.loading("Actualizando...")
    try {
      // El RPC retorna también un `id` virtual; pero `updateDeliveryStatus`
      // requiere el id real. Tenemos `token`, así que hacemos una segunda
      // query (es un caso raro y el repartidor sí está logueado al
      // tocar este botón solo si Mari le abrió el link).
      // Por simplicidad, lo dejamos como acción que requiere staff/admin
      // — para v1 el repartidor solo VE la comanda. La actualización la
      // hace Mari desde su panel.
      await updateDeliveryStatus(note.sale.id, next)
      toast.success("Listo", { id: tid })
    } catch (e: any) {
      toast.error(e?.message ?? "Solo el admin puede actualizar", { id: tid })
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <Skeleton className="w-full max-w-md h-96" rounded="xl" />
      </div>
    )
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-premium p-8 text-center max-w-sm">
          <AlertCircle
            size={32}
            className="mx-auto text-rose-400 mb-3"
          />
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
      {/* Banda superior */}
      <div className="h-2" style={{ background: "linear-gradient(90deg,#0ea5e9,#6366f1)" }} />

      <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
        {/* Header con cliente */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-premium p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300 flex items-center justify-center">
              <Truck size={16} />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Comanda de entrega
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-300">
                {DELIVERY_STATUS_LABEL[note.status]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Avatar
              name={note.customer.name}
              src={note.customer.avatar_url}
              size={56}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Entregar a
              </p>
              <p className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight truncate">
                {note.customer.name || "Cliente"}
              </p>
              {note.customer.phone && (
                <a
                  href={`tel:${note.customer.phone}`}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary mt-0.5"
                >
                  <Phone size={11} /> {note.customer.phone}
                </a>
              )}
            </div>
          </div>
        </motion.section>

        {/* Total a cobrar — destacado */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className={`rounded-3xl p-5 shadow-premium text-white ${
            isPaid
              ? "bg-gradient-to-br from-emerald-500 to-teal-600"
              : "bg-gradient-to-br from-primary to-purple-600"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest opacity-80">
                {isPaid ? "Ya pagado" : "Cobrar al entregar"}
              </p>
              <p className="text-3xl font-black tabular-nums mt-1">
                {formatMoney(note.amount_to_collect || note.sale.balance)}
              </p>
              {note.payment_method_expected && (
                <p className="text-[11px] font-bold opacity-90 mt-1 flex items-center gap-1">
                  <DollarSign size={11} />
                  {PAY_LABEL[note.payment_method_expected.toLowerCase()] ??
                    note.payment_method_expected}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest opacity-80">
                Total pedido
              </p>
              <p className="text-base font-black tabular-nums">
                {formatMoney(note.sale.total)}
              </p>
              {note.sale.paid > 0 && !isPaid && (
                <p className="text-[10px] font-bold opacity-90 tabular-nums mt-0.5">
                  Pagado {formatMoney(note.sale.paid)}
                </p>
              )}
            </div>
          </div>
        </motion.section>

        {/* Logística — dirección + hora */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-premium p-5 space-y-3"
        >
          {note.delivery_address && (
            <Row
              icon={<MapPin size={14} className="text-rose-500" />}
              label="Dirección"
              value={note.delivery_address}
            />
          )}
          {note.delivery_zone && (
            <Row
              icon={<MapPin size={14} className="text-slate-400" />}
              label="Zona"
              value={note.delivery_zone}
            />
          )}
          {note.meeting_point && (
            <Row
              icon={<MapPin size={14} className="text-amber-500" />}
              label="Punto medio"
              value={note.meeting_point}
            />
          )}
          {note.delivery_time_target && (
            <Row
              icon={<Clock size={14} className="text-sky-500" />}
              label="Hora prometida"
              value={note.delivery_time_target}
            />
          )}
          {note.driver_name && (
            <Row
              icon={<UserIcon size={14} className="text-violet-500" />}
              label="Repartidor"
              value={note.driver_name}
            />
          )}

          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full h-11 mt-2 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom press"
            >
              <ExternalLink size={13} />
              Abrir mapa
            </a>
          )}
        </motion.section>

        {/* Items del pedido */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-white dark:bg-slate-900 rounded-3xl shadow-premium p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Package size={14} className="text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {note.items.length}{" "}
              {note.items.length === 1 ? "producto" : "productos"}
            </p>
          </div>
          <div className="space-y-2">
            {note.items.map((it, i) => (
              <div
                key={i}
                className="flex gap-3 py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
              >
                {it.image ? (
                  <img
                    src={typeof it.image === "string" ? it.image : ""}
                    alt={it.name}
                    className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Package size={16} className="text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-black text-slate-900 dark:text-slate-100 truncate leading-tight">
                    {it.name}
                  </p>
                  {it.variant_name && (
                    <p className="text-[10px] font-bold text-slate-500 truncate">
                      {it.variant_name}
                    </p>
                  )}
                  <p className="text-[10px] font-bold text-primary mt-0.5 tabular-nums">
                    × {it.qty} = {formatMoney(it.subtotal)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Notas extra */}
        {note.notes && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="bg-amber-50 dark:bg-amber-500/10 rounded-3xl border border-amber-200 dark:border-amber-500/30 p-4 flex gap-3"
          >
            <StickyNote
              size={14}
              className="text-amber-600 shrink-0 mt-0.5"
            />
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200 leading-snug whitespace-pre-line">
              {note.notes}
            </p>
          </motion.section>
        )}

        {/* Acciones del repartidor (solo si está logueado como staff/admin) */}
        {session && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 gap-2"
          >
            <button
              type="button"
              onClick={() => handleMarkStatus("picked_up")}
              disabled={updating || note.status === "delivered"}
              className="h-12 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press disabled:opacity-50"
            >
              {updating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ArrowRight size={12} />
              )}
              Voy en camino
            </button>
            <button
              type="button"
              onClick={() => handleMarkStatus("delivered")}
              disabled={updating}
              className="h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press disabled:opacity-50"
            >
              <CheckCircle2 size={12} />
              Entregado
            </button>
          </motion.section>
        )}

        {/* Footer */}
        <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center italic pt-2">
          Comanda generada {formatDateTime(note.created_at)}
        </p>
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          {label}
        </p>
        <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-snug">
          {value}
        </p>
      </div>
    </div>
  )
}

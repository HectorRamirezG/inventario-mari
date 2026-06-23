import { useCallback, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import {
  Truck,
  MapPin,
  Phone,
  CheckCircle2,
  ExternalLink,
} from "lucide-react"
import toast from "react-hot-toast"

import SafeSection from "../../components/ui/SafeSection"
import { formatRelative, shortId } from "../../lib/format"
import {
  listActiveDeliveryNotes,
  updateDeliveryStatus,
  DELIVERY_STATUS_LABEL,
  publicDeliveryUrl,
  type DeliveryNote,
} from "../delivery/deliveryService"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"

const QUERY_KEY = ["dashboard", "today-deliveries"] as const

function TodayDeliveriesCardInner() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listActiveDeliveryNotes(),
    staleTime: 30_000,
  })

  // Refresca cuando cualquier delivery cambia (realtime via multiplex).
  useRealtimeSubscription("delivery_notes", () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  })

  const handleDelivered = useCallback(
    async (note: DeliveryNote) => {
      // Optimistic: la quitamos de la lista YA y revertimos si la BD falla.
      const prev = queryClient.getQueryData<DeliveryNote[]>(QUERY_KEY)
      queryClient.setQueryData<DeliveryNote[]>(QUERY_KEY, (list) =>
        (list ?? []).filter((n) => n.id !== note.id),
      )
      try {
        await updateDeliveryStatus(note.id, "delivered")
        toast.success("Marcada como entregada")
      } catch (e: any) {
        if (prev) queryClient.setQueryData(QUERY_KEY, prev)
        toast.error(e?.message ?? "No se pudo actualizar")
      }
    },
    [queryClient],
  )

  useEffect(() => {
    // Sin uso, solo para que ESLint no se queje del unused.
  }, [])

  if (isLoading) return null
  if (!data || data.length === 0) return null

  return (
    <section className="rounded-3xl border border-sky-200/70 dark:border-sky-500/30 bg-gradient-to-br from-sky-50/80 to-indigo-50/80 dark:from-sky-500/10 dark:to-indigo-500/10 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white flex items-center justify-center shadow-sm">
          <Truck size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-none">
            Entregas activas
          </h3>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            Comandas enviadas o en camino · marca como entregada en 1 toque
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-black tabular-nums">
          {data.length}
        </span>
      </div>

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {data.slice(0, 6).map((note) => {
            const phone = (note.driver_phone ?? "").replace(/\D/g, "")
            const fullPhone = phone.length === 10 ? `52${phone}` : phone
            const statusTone =
              note.status === "picked_up"
                ? "text-sky-600 dark:text-sky-300"
                : "text-amber-600 dark:text-amber-300"
            return (
              <motion.li
                key={note.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3 rounded-2xl p-2.5 border border-sky-100 dark:border-sky-500/20 bg-white/70 dark:bg-slate-900/40"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[11.5px] font-black text-slate-800 dark:text-slate-100 truncate">
                      Folio {shortId(note.sale_id)}
                    </p>
                    <span className={`text-[9px] font-black uppercase tracking-wider shrink-0 ${statusTone}`}>
                      · {DELIVERY_STATUS_LABEL[note.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400 flex-wrap">
                    {note.driver_name && (
                      <span className="flex items-center gap-1">
                        <Truck size={9} /> {note.driver_name}
                      </span>
                    )}
                    {note.delivery_zone && (
                      <span className="flex items-center gap-1">
                        <MapPin size={9} /> {note.delivery_zone}
                      </span>
                    )}
                    <span>· {formatRelative(note.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {fullPhone && (
                    <a
                      href={`tel:${fullPhone}`}
                      title="Llamar al repartidor"
                      className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center press"
                    >
                      <Phone size={12} />
                    </a>
                  )}
                  <a
                    href={publicDeliveryUrl(note.public_token)}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir comanda pública"
                    className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center press"
                  >
                    <ExternalLink size={12} />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelivered(note)}
                    title="Marcar como entregada"
                    className="h-8 px-3 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 press shadow-sm"
                  >
                    <CheckCircle2 size={11} /> Listo
                  </button>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      {data.length > 6 && (
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-2 text-center">
          + {data.length - 6} más
        </p>
      )}
    </section>
  )
}

export default function TodayDeliveriesCard() {
  return (
    <SafeSection scope="dashboard:today-deliveries">
      <TodayDeliveriesCardInner />
    </SafeSection>
  )
}

import { useEffect, useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { Clock, Send, Check, AlertTriangle } from "lucide-react"

import SafeSection from "../../components/ui/SafeSection"
import { formatMoney, shortId } from "../../lib/format"
import {
  APARTADO_TEMPLATES,
  openTemplateInWhatsApp,
} from "../apartados/waTemplates"
import {
  getDueReminders,
  markReminderSent,
  type DueReminder,
} from "./dueRemindersService"

const QUERY_KEY = ["dashboard", "due-reminders"] as const

function DueRemindersCardInner() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getDueReminders(5, 2),
    staleTime: 60_000,
  })
  // Estado local que refleja los "ya recordados hoy" sin esperar refetch.
  const [pulse, setPulse] = useState(0)

  // Cuando otro lugar dispara el evento, re-renderizamos para refrescar chips.
  useEffect(() => {
    const handler = () => setPulse((p) => p + 1)
    window.addEventListener("mari:due-reminder-sent", handler)
    return () => window.removeEventListener("mari:due-reminder-sent", handler)
  }, [])

  const handleRemind = useCallback(
    (item: DueReminder) => {
      // Elige plantilla según urgencia: vencido o ≤1 día = last_chance,
      // 2-3 días = due_tomorrow, resto = friendly_reminder.
      const template =
        item.daysLeft <= 1
          ? APARTADO_TEMPLATES.find((t) => t.id === "last_chance")
          : item.daysLeft <= 3
            ? APARTADO_TEMPLATES.find((t) => t.id === "due_tomorrow")
            : APARTADO_TEMPLATES.find((t) => t.id === "friendly_reminder")
      if (!template) return
      openTemplateInWhatsApp(template, item.sale)
      markReminderSent(item.sale.id)
      // Invalida cache para que el flag remindedToday se reconcilie pronto.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    [queryClient],
  )

  if (isLoading) return null
  if (!data || data.length === 0) return null

  // Recordados hoy se calculan al render (pulse forza re-eval).
  void pulse
  return (
    <section className="rounded-3xl border border-amber-200/70 dark:border-amber-500/30 bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-500/10 dark:to-orange-500/10 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-sm">
          <Clock size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-none">
            Por avisar hoy
          </h3>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            Apartados con saldo que vencen pronto · mandar recordatorio en 1 toque
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {data.slice(0, 6).map((item) => {
            const overdue = item.daysLeft < 0
            const tomorrow = item.daysLeft === 0 || item.daysLeft === 1
            const tone = overdue
              ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30"
              : tomorrow
                ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
                : "bg-white/70 dark:bg-slate-900/40 border-amber-100 dark:border-amber-500/20"
            const status = overdue
              ? `Venció hace ${Math.abs(item.daysLeft)}d`
              : item.daysLeft === 0
                ? "Vence hoy"
                : item.daysLeft === 1
                  ? "Vence mañana"
                  : `Vence en ${item.daysLeft}d`
            const phone = (item.sale.customer_phone ?? "").replace(/\D/g, "")
            return (
              <motion.li
                key={item.sale.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-3 rounded-2xl p-2.5 border ${tone}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-black text-slate-800 dark:text-slate-100 truncate">
                    {item.sale.customer_name || "Cliente sin nombre"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="tabular-nums">
                      Folio {shortId(item.sale.id)}
                    </span>
                    <span>·</span>
                    <span
                      className={`flex items-center gap-1 ${overdue ? "text-rose-600 dark:text-rose-300 font-black" : "text-amber-700 dark:text-amber-300 font-black"}`}
                    >
                      {overdue && <AlertTriangle size={10} />}
                      {status}
                    </span>
                  </div>
                </div>

                <span className="text-[12px] font-black tabular-nums text-slate-800 dark:text-slate-100 shrink-0">
                  {formatMoney(Number(item.sale.balance) || 0)}
                </span>

                <button
                  type="button"
                  onClick={() => handleRemind(item)}
                  disabled={!phone}
                  title={
                    phone
                      ? "Mandar recordatorio por WhatsApp"
                      : "Sin teléfono registrado"
                  }
                  className={`shrink-0 h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 press disabled:opacity-40 ${
                    item.remindedToday
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-emerald-500 text-white shadow-sm"
                  }`}
                >
                  {item.remindedToday ? (
                    <>
                      <Check size={11} /> Listo
                    </>
                  ) : (
                    <>
                      <Send size={11} /> Recordar
                    </>
                  )}
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      {data.length > 6 && (
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-2 text-center">
          + {data.length - 6} más en la sección Pendientes
        </p>
      )}
    </section>
  )
}

export default function DueRemindersCard() {
  return (
    <SafeSection scope="dashboard:due-reminders">
      <DueRemindersCardInner />
    </SafeSection>
  )
}

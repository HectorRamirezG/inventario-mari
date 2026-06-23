/**
 * MyPromosPage — Calendario de promociones del cliente.
 *
 * Vista mensual estilo Google Calendar lite:
 *   - Header con mes/año + botones ← → para navegar
 *   - Grid 7×N con días (encabezado de día abreviado: L M M J V S D)
 *   - Cada día con evento se pinta con dot de color según tone
 *   - Click en día con evento(s) → muestra detalle abajo
 *   - Sección debajo: próximos 5 eventos en lista (resumen)
 *
 * Si la regla `promo_calendar_enabled` está apagada, redirige a /.
 * Lee los eventos desde `bRules.promo_events` (config de admin).
 *
 * NO requiere SQL — todo vive en `app_settings.business_rules.promo_events`.
 */
import { useMemo, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Tag,
  Sparkles,
  XCircle,
  Star,
} from "lucide-react"

import { useBusinessRules } from "../settings/businessRulesService"
import type { PromoEvent } from "../settings/businessRulesService"
import PageHeader from "../../components/ui/PageHeader"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"

/* ────────────── Helpers ────────────── */

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

const DAY_HEADERS = ["L", "M", "M", "J", "V", "S", "D"]

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function ymd(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

const TONE_META: Record<
  PromoEvent["tone"],
  { dot: string; bg: string; text: string; icon: typeof Tag; label: string }
> = {
  discount: {
    dot: "bg-rose-500",
    bg: "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30",
    text: "text-rose-700 dark:text-rose-300",
    icon: Tag,
    label: "Descuento",
  },
  launch: {
    dot: "bg-primary",
    bg: "bg-primary/5 dark:bg-primary/15 border-primary/20",
    text: "text-primary",
    icon: Sparkles,
    label: "Lanzamiento",
  },
  closed: {
    dot: "bg-slate-500",
    bg: "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700",
    text: "text-slate-600 dark:text-slate-300",
    icon: XCircle,
    label: "Cerrado",
  },
  event: {
    dot: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30",
    text: "text-amber-700 dark:text-amber-300",
    icon: Star,
    label: "Evento",
  },
}

export default function MyPromosPage() {
  const bRules = useBusinessRules()
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  // 0-indexado (0=Enero ... 11=Diciembre)
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (!bRules.promo_calendar_enabled) {
    return <Navigate to="/" replace />
  }

  // Eventos agrupados por fecha YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, PromoEvent[]>()
    for (const e of bRules.promo_events) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [bRules.promo_events])

  // Próximos 5 eventos (desde hoy)
  const upcoming = useMemo(() => {
    const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate())
    return bRules.promo_events
      .filter((e) => e.date >= todayStr)
      .slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bRules.promo_events])

  // Grid del mes: empieza en lunes
  const firstDay = new Date(year, month, 1)
  const firstWeekday = (firstDay.getDay() + 6) % 7 // 0=Lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ day: number | null; date: string | null }> = []
  // Espacios vacíos antes del día 1
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, date: null })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: ymd(year, month, d) })
  }
  // Rellenar hasta múltiplo de 7
  while (cells.length % 7 !== 0) cells.push({ day: null, date: null })

  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate())

  function changeMonth(delta: number) {
    const m = month + delta
    if (m < 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else if (m > 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else {
      setMonth(m)
    }
    setSelectedDate(null)
  }

  const selectedEvents = selectedDate
    ? eventsByDate.get(selectedDate) ?? []
    : []

  return (
    <div className="max-w-2xl mx-auto pb-32 px-1 pt-1 space-y-4">
      <PageHeader
        icon={CalendarIcon}
        iconTone="primary"
        title="Promociones"
        subtitle={
          bRules.promo_events.length === 0
            ? "Sin eventos publicados todavía"
            : `${bRules.promo_events.length} fechas marcadas`
        }
      />

      {/* Navegación de mes */}
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Mes anterior"
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
        >
          <ChevronLeft size={14} />
        </button>
        <p className="text-sm font-black tracking-tight text-center flex-1">
          {MONTH_NAMES[month]} {year}
        </p>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Mes siguiente"
          className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Calendario mensual */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3">
        {/* Encabezado de días */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={i}
              className="text-center text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid de días */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c.day || !c.date) {
              return <div key={i} className="h-11" />
            }
            const events = eventsByDate.get(c.date) ?? []
            const isToday = c.date === todayStr
            const isSelected = c.date === selectedDate
            const tones = Array.from(new Set(events.map((e) => e.tone)))
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDate(c.date)}
                disabled={events.length === 0}
                className={`relative h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all ${
                  isSelected
                    ? "bg-primary/15 ring-2 ring-primary"
                    : isToday
                    ? "bg-primary/5 ring-1 ring-primary/30"
                    : events.length > 0
                    ? "bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 press"
                    : ""
                } ${events.length === 0 ? "cursor-default" : "cursor-pointer"}`}
              >
                <span
                  className={`text-[12px] font-black tabular-nums leading-none ${
                    isToday
                      ? "text-primary"
                      : events.length > 0
                      ? "text-slate-900 dark:text-slate-100"
                      : "text-slate-400 dark:text-slate-600"
                  }`}
                >
                  {c.day}
                </span>
                {tones.length > 0 && (
                  <div className="flex gap-0.5">
                    {tones.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className={`w-1 h-1 rounded-full ${TONE_META[t].dot}`}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Detalle del día seleccionado */}
      <AnimatePresence>
        {selectedEvents.length > 0 && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 px-1 mb-2">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("es-MX", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
            <div className="space-y-2">
              {selectedEvents.map((e) => (
                <PromoCard key={e.id} event={e} />
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Próximos eventos */}
      {upcoming.length > 0 && !selectedDate && (
        <section className="space-y-2">
          <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 px-1">
            Próximos eventos
          </h2>
          <div className="space-y-2">
            {upcoming.map((e) => (
              <PromoCard key={e.id} event={e} showDate />
            ))}
          </div>
        </section>
      )}

      {/* Vacío total */}
      {bRules.promo_events.length === 0 && (
        <EmptyStateIllustration
          variant="no-orders"
          title="Aún sin eventos"
          subtitle="Cuando Beauty's Me programe descuentos, lanzamientos o días especiales aparecerán aquí."
          cta={
            <button
              type="button"
              onClick={() => navigate("/")}
              className="h-10 px-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest shadow-bloom press-hard mx-auto"
            >
              Ir al catálogo
            </button>
          }
        />
      )}
    </div>
  )
}

function PromoCard({
  event,
  showDate = false,
}: {
  event: PromoEvent
  showDate?: boolean
}) {
  const meta = TONE_META[event.tone]
  const Icon = meta.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-3 ${meta.bg}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.text}`}
          style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }}
        >
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-[12px] font-black leading-tight ${meta.text}`}>
              {event.title}
            </p>
            <span
              className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${meta.text}`}
              style={{
                background: "color-mix(in srgb, currentColor 18%, transparent)",
              }}
            >
              {meta.label}
            </span>
          </div>
          {showDate && (
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
              {new Date(event.date + "T00:00:00").toLocaleDateString("es-MX", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
          )}
          {event.description && (
            <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug mt-1">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

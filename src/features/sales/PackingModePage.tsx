import { useEffect, useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Check from "lucide-react/dist/esm/icons/check"
import Phone from "lucide-react/dist/esm/icons/phone"
import MapPin from "lucide-react/dist/esm/icons/map-pin"
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw"
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw"
import Package from "lucide-react/dist/esm/icons/package"
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left"
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right"
import Plane from "lucide-react/dist/esm/icons/plane"
import Bookmark from "lucide-react/dist/esm/icons/bookmark"
import MessageCircle from "lucide-react/dist/esm/icons/message-circle"
import Truck from "lucide-react/dist/esm/icons/truck"

import {
  listPackingQueue,
  markAsPacked,
  unmarkAsPacked,
  type PackingOrder,
} from "./packingService"
import { formatMoney, formatRelative, cleanPhone } from "../../lib/format"
import { imageAvatar } from "../../lib/imageTransform"
import { useFeedback } from "../../lib/useFeedback"
import { toastSuccess, toastInfo } from "../../lib/toast"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import Avatar from "../../components/ui/Avatar"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"

/**
 * Modo Empaque (fullscreen) — workflow una-venta-a-la-vez para que Mari
 * deje de andar buscando "cuál era el de Karla". El patrón es:
 *
 *   1. Lee la cola: ventas pagadas, no entregadas, sin marcar como empacadas.
 *   2. Muestra UNA venta en grande (cliente, items con foto, dirección, mapa).
 *   3. Tap ✓ Empacado → marca local + pasa a la siguiente con animación.
 *   4. Tap ← Deshacer si se equivocó (saca de localStorage).
 *   5. Atajos: Space/→ marca, ← retrocede.
 *
 * NO toca la BD (el "empacado" es una etiqueta local, no un estado del
 * negocio). La idea es darle a Mari un workflow zen sin agregar campos.
 */

export default function PackingModePage() {
  const [queue, setQueue] = useState<PackingOrder[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<string[]>([])
  const { tap, success, strong } = useFeedback()

  const refresh = useCallback(async () => {
    try {
      const list = await listPackingQueue()
      setQueue(list)
      setIdx((i) => Math.min(i, Math.max(0, list.length - 1)))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const debouncedRefresh = useDebouncedCallback(refresh, 800)
  useRealtimeSubscription("sales", debouncedRefresh)
  useRealtimeSubscription("payments", debouncedRefresh)
  useRealtimeSubscription("delivery_notes", debouncedRefresh)

  const current = queue[idx]

  const handlePack = useCallback(() => {
    if (!current) return
    success()
    markAsPacked(current.sale_id)
    setHistory((h) => [...h, current.sale_id])
    // Quitar de la cola con animación
    setQueue((q) => q.filter((o) => o.sale_id !== current.sale_id))
    // El idx puede quedar fuera si era el último — corregimos
    setIdx((i) => Math.min(i, Math.max(0, queue.length - 2)))
    toastSuccess(`✓ Empacado: ${current.customer_name}`)
  }, [current, queue.length, success])

  const handleUndo = useCallback(() => {
    const last = history[history.length - 1]
    if (!last) return
    strong()
    unmarkAsPacked(last)
    setHistory((h) => h.slice(0, -1))
    toastInfo("Deshecho — recargando cola…")
    refresh()
  }, [history, refresh, strong])

  const handleSkip = useCallback(() => {
    tap()
    setIdx((i) => Math.min(queue.length - 1, i + 1))
  }, [tap, queue.length])

  const handlePrev = useCallback(() => {
    tap()
    setIdx((i) => Math.max(0, i - 1))
  }, [tap])

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault()
        handlePack()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrev()
      } else if (e.key.toLowerCase() === "u") {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [handlePack, handlePrev, handleUndo])

  const totalItems = useMemo(
    () => current?.items.reduce((s, i) => s + i.qty, 0) ?? 0,
    [current],
  )

  /* ─────────── Render ─────────── */
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
      </div>
    )
  }

  if (!current) {
    return (
      <div className="p-6 max-w-md mx-auto flex flex-col items-center text-center gap-4 min-h-[60vh] justify-center">
        <EmptyStateIllustration variant="no-orders" />
        <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
          ¡Cola vacía! 🎉
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
          No hay pedidos pagados pendientes de empacar. Cuando entre uno nuevo
          aparece automáticamente.
        </p>
        {history.length > 0 && (
          <button
            onClick={handleUndo}
            className="mt-2 px-4 h-11 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-[12px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-2 press-hard"
          >
            <RotateCcw size={14} /> Deshacer último
          </button>
        )}
        <button
          onClick={refresh}
          className="px-4 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-[12px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-2 press-hard"
        >
          <RefreshCw size={14} /> Refrescar
        </button>
      </div>
    )
  }

  return (
    <div className="relative max-w-[860px] mx-auto pb-32 px-3 pt-4">
      {/* Header con progreso y botones globales */}
      <header className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[9px] uppercase tracking-widest font-black text-amber-600 dark:text-amber-300 flex items-center gap-1">
            <Package size={11} /> Modo empaque
          </p>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5">
            {queue.length}{" "}
            <span className="text-slate-400 text-base font-bold">
              pedido{queue.length !== 1 ? "s" : ""} por empacar
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              className="h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-1.5 press-hard"
              title="Deshacer última marca (U)"
            >
              <RotateCcw size={12} /> Deshacer
            </button>
          )}
          <button
            onClick={refresh}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-primary"
            aria-label="Refrescar cola"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* Barra de progreso del lote */}
      <div className="mb-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-400 to-pink-500"
          initial={{ width: 0 }}
          animate={{
            width: `${
              queue.length > 0
                ? ((history.length / (history.length + queue.length)) * 100).toFixed(1)
                : 0
            }%`,
          }}
          transition={{ duration: 0.35 }}
        />
      </div>

      {/* Card del pedido actual */}
      <AnimatePresence mode="popLayout">
        <motion.section
          key={current.sale_id}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: -120, scale: 0.95 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden shadow-lg shadow-slate-200/50 dark:shadow-slate-950/50"
        >
          {/* Bloque cliente */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
            <Avatar name={current.customer_name} size={56} />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 truncate">
                {current.customer_name}
              </h2>
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                {formatRelative(current.created_at)} ·{" "}
                {formatMoney(current.total)}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {current.is_layaway && (
                  <Chip tone="amber" icon={Bookmark} label="Era apartado" />
                )}
                {current.is_foreign_shipping && (
                  <Chip tone="violet" icon={Plane} label="Envío foráneo" />
                )}
                {current.delivery_status && (
                  <Chip
                    tone={
                      current.delivery_status === "picked_up" ? "sky" : "slate"
                    }
                    icon={Truck}
                    label={
                      current.delivery_status === "draft"
                        ? "Comanda creada"
                        : current.delivery_status === "sent"
                        ? "Enviada al repartidor"
                        : "En camino"
                    }
                  />
                )}
              </div>
            </div>
          </div>

          {/* Items con foto */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-400">
                {totalItems} pieza{totalItems !== 1 ? "s" : ""} en{" "}
                {current.items.length} línea{current.items.length !== 1 ? "s" : ""}
              </p>
              <p className="text-[10px] uppercase tracking-widest font-black text-amber-700 dark:text-amber-300">
                Checklist
              </p>
            </div>
            <ul className="space-y-2">
              {current.items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-2 pr-3"
                >
                  {it.image_url ? (
                    <img
                      src={imageAvatar(it.image_url) || it.image_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width={112}
                      height={112}
                      className="w-14 h-14 aspect-square rounded-xl object-cover bg-slate-200 dark:bg-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 aspect-square rounded-xl bg-slate-200 dark:bg-slate-700 grid place-items-center shrink-0">
                      <Package size={20} className="text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-slate-800 dark:text-slate-100 truncate">
                      {it.product_name}
                    </p>
                    {it.variant_name && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {it.variant_name}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 grid place-items-center font-black tabular-nums text-sm">
                    {it.qty}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Bloque entrega */}
          {(current.customer_address ||
            current.customer_phone ||
            current.customer_location ||
            current.notes) && (
            <div className="px-5 py-4 space-y-2 bg-slate-50/50 dark:bg-slate-800/30">
              {current.customer_address && (
                <div className="flex items-start gap-2">
                  <MapPin
                    size={14}
                    className="text-slate-500 dark:text-slate-400 mt-0.5 shrink-0"
                  />
                  <p className="text-[12px] text-slate-700 dark:text-slate-200 leading-snug">
                    {current.customer_address}
                  </p>
                </div>
              )}
              {current.notes && (
                <div className="flex items-start gap-2">
                  <MessageCircle
                    size={14}
                    className="text-amber-600 dark:text-amber-300 mt-0.5 shrink-0"
                  />
                  <p className="text-[12px] text-amber-800 dark:text-amber-200 leading-snug italic">
                    {current.notes}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {current.customer_phone && (
                  <a
                    href={`tel:${cleanPhone(current.customer_phone)}`}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-black flex items-center gap-1.5 text-slate-700 dark:text-slate-200 press"
                  >
                    <Phone size={12} /> Llamar
                  </a>
                )}
                {current.customer_phone && (
                  <a
                    href={`https://wa.me/${cleanPhone(current.customer_phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-3 rounded-xl bg-emerald-500 text-white text-[11px] font-black flex items-center gap-1.5 press shadow-sm shadow-emerald-200/60"
                  >
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                )}
                {current.customer_location && (
                  <a
                    href={current.customer_location}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-3 rounded-xl bg-sky-500 text-white text-[11px] font-black flex items-center gap-1.5 press shadow-sm shadow-sky-200/60"
                  >
                    <MapPin size={12} /> Abrir mapa
                  </a>
                )}
              </div>
            </div>
          )}
        </motion.section>
      </AnimatePresence>

      {/* Footer fijo de acciones grandes */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-slate-950 dark:via-slate-950/95 px-3 pt-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-[860px] mx-auto flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={idx === 0}
            className="w-12 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 grid place-items-center disabled:opacity-30 press"
            aria-label="Anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={handlePack}
            className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-[15px] tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/40 dark:shadow-emerald-900/30 press"
            aria-label="Marcar empacado (Space)"
          >
            <Check size={20} strokeWidth={3} />
            Empacado · Siguiente
          </button>
          <button
            onClick={handleSkip}
            disabled={idx >= queue.length - 1}
            className="w-12 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 grid place-items-center disabled:opacity-30 press"
            aria-label="Saltar"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <p className="text-[9px] uppercase tracking-widest text-center text-slate-400 mt-2">
          Space o → empacar · ← anterior · U deshacer
        </p>
      </div>
    </div>
  )
}

/* ───────── Chip auxiliar ───────── */

type ChipTone = "amber" | "violet" | "sky" | "slate"
const CHIP_TONE: Record<ChipTone, string> = {
  amber:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  slate:
    "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
}

function Chip({
  tone,
  icon: Icon,
  label,
}: {
  tone: ChipTone
  icon: typeof Truck
  label: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${CHIP_TONE[tone]}`}
    >
      <Icon size={10} />
      {label}
    </span>
  )
}

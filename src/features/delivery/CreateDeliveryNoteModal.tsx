import { useEffect, useMemo, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Truck,
  Phone,
  MapPin,
  Clock,
  DollarSign,
  StickyNote,
  Send,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  createDeliveryNote,
  listDeliveryNotesBySale,
  updateDeliveryStatus,
  deleteDeliveryNote,
  publicDeliveryUrl,
  openWhatsAppDelivery,
  rememberDriver,
  getKnownDrivers,
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  type DeliveryNote,
  type DeliveryStatus,
} from "./deliveryService"
import { formatMoney, formatRelative } from "../../lib/format"
import { copyToClipboard } from "../../lib/clipboard"
import { confirmAction } from "../../lib/confirm"
import type { Sale } from "../../types/database"

interface Props {
  open: boolean
  sale: Sale | null
  onClose: () => void
  onCreated?: (note: DeliveryNote) => void
}

type ViewMode = "list" | "form" | "success"

/**
 * Modal admin para comandas de entrega de una venta.
 *
 * VIEWS:
 *   - "list":    muestra las comandas existentes (si las hay). Cada una
 *                con su estatus, link, botones para reenviar por wa,
 *                copiar y BORRAR. Botón abajo para crear una nueva.
 *   - "form":    formulario de creación pre-llenado con datos de la venta.
 *   - "success": vista post-creación con link + botones.
 *
 * Cuando se abre con `sale` el modal arranca en `list` si hay comandas
 * previas; si no las hay arranca directo en `form`.
 */
export default function CreateDeliveryNoteModal({
  open,
  sale,
  onClose,
  onCreated,
}: Props) {
  const drivers = useMemo(() => getKnownDrivers(), [open])

  const [view, setView] = useState<ViewMode>("list")
  const [existing, setExisting] = useState<DeliveryNote[]>([])
  const [loadingList, setLoadingList] = useState(false)

  const [driverName, setDriverName] = useState("")
  const [driverPhone, setDriverPhone] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [locationUrl, setLocationUrl] = useState("")
  const [zone, setZone] = useState("")
  const [timeTarget, setTimeTarget] = useState("")
  const [meetingPoint, setMeetingPoint] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("efectivo")
  const [amountToCollect, setAmountToCollect] = useState(0)
  const [notes, setNotes] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [createdNote, setCreatedNote] = useState<DeliveryNote | null>(null)
  const [copied, setCopied] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  /** Carga las comandas existentes de esta venta al abrir. */
  const loadExisting = useCallback(async () => {
    if (!sale) return
    setLoadingList(true)
    try {
      const list = await listDeliveryNotesBySale(sale.id)
      setExisting(list)
      // Si ya hay alguna, arranca en lista. Si no, va directo a form.
      setView(list.length > 0 ? "list" : "form")
    } catch {
      // Si tabla no existe aún, vamos directo a form.
      setExisting([])
      setView("form")
    } finally {
      setLoadingList(false)
    }
  }, [sale])

  /** Reset al abrir/cerrar */
  useEffect(() => {
    if (!open || !sale) return
    setCreatedNote(null)
    setCopied(false)
    setDriverName("")
    setDriverPhone("")
    setDeliveryAddress(sale.customer_address ?? "")
    setLocationUrl(sale.customer_location ?? "")
    setZone("")
    setTimeTarget("")
    setMeetingPoint("")
    setAmountToCollect(Number(sale.balance) || 0)
    setPaymentMethod(Number(sale.balance) > 0 ? "efectivo" : "ya_pagado")
    setNotes("")
    setDeletingId(null)
    loadExisting()
  }, [open, sale, loadExisting])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function pickDriver(name: string, phone: string) {
    setDriverName(name)
    setDriverPhone(phone)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sale) return
    if (!driverPhone.trim() && !deliveryAddress.trim()) {
      toast.error("Necesitas al menos teléfono del repartidor o dirección")
      return
    }
    setSubmitting(true)
    const tid = toast.loading("Creando comanda...")
    try {
      const note = await createDeliveryNote({
        sale_id: sale.id,
        driver_name: driverName,
        driver_phone: driverPhone,
        delivery_address: deliveryAddress,
        delivery_location_url: locationUrl,
        delivery_zone: zone,
        delivery_time_target: timeTarget,
        meeting_point: meetingPoint,
        amount_to_collect: amountToCollect,
        payment_method_expected:
          paymentMethod === "ya_pagado" ? "ya pagado" : paymentMethod,
        notes,
      })
      // Guarda repartidor recurrente
      if (driverPhone.trim()) {
        rememberDriver(driverName, driverPhone)
      }
      setCreatedNote(note)
      setView("success")
      setExisting((prev) => [note, ...prev])
      toast.success("Comanda lista", { id: tid })
      onCreated?.(note)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear", { id: tid })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopyLink(token: string) {
    const url = publicDeliveryUrl(token)
    await copyToClipboard(url, "Link copiado")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSendWhats(note: DeliveryNote) {
    if (!sale) return
    if (!note.driver_phone) {
      toast.error("Esta comanda no tiene teléfono del repartidor")
      return
    }
    openWhatsAppDelivery(note, sale.customer_name)
    // marca como enviado
    if (note.status === "draft") {
      updateDeliveryStatus(note.id, "sent").catch(() => {})
      setExisting((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, status: "sent" } : n)),
      )
    }
  }

  async function handleDelete(note: DeliveryNote) {
    const ok = await confirmAction({
      title: "¿Borrar esta comanda?",
      description:
        "El link dejará de funcionar. Si ya se la mandaste al repartidor avísale antes.",
      confirmLabel: "Sí, borrar",
      tone: "danger",
    })
    if (!ok) return
    setDeletingId(note.id)
    const tid = toast.loading("Borrando...")
    try {
      await deleteDeliveryNote(note.id)
      setExisting((prev) => prev.filter((n) => n.id !== note.id))
      toast.success("Comanda eliminada", { id: tid })
      // Si quedó vacío, vamos al form
      if (existing.length <= 1) setView("form")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo borrar", { id: tid })
    } finally {
      setDeletingId(null)
    }
  }

  async function handleStatus(note: DeliveryNote, next: DeliveryStatus) {
    try {
      await updateDeliveryStatus(note.id, next)
      setExisting((prev) =>
        prev.map((n) => (n.id === note.id ? { ...n, status: next } : n)),
      )
      toast.success("Estatus actualizado")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo actualizar")
    }
  }

  if (typeof document === "undefined" || !sale) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[170] flex items-end md:items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !submitting && onClose()}
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-3xl shadow-2xl"
          >
            {/* Handle */}
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 pt-2 pb-1 flex justify-center md:hidden">
              <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>

            <div className="px-5 pb-6 pt-3 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-bloom shrink-0"
                    style={{
                      background: "linear-gradient(135deg,#0ea5e9,#6366f1)",
                    }}
                  >
                    <Truck size={18} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black uppercase tracking-tight">
                      {view === "list"
                        ? `Comandas (${existing.length})`
                        : view === "success"
                          ? "Comanda lista"
                          : existing.length > 0
                            ? "Nueva comanda"
                            : "Comanda de entrega"}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug">
                      {sale.customer_name || "Cliente"} ·{" "}
                      {formatMoney(sale.total)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center press"
                >
                  <X size={16} />
                </button>
              </div>

              {/* ─── VISTA: LIST ─── */}
              {view === "list" && (
                <div className="space-y-3">
                  {loadingList ? (
                    <div className="py-10 flex items-center justify-center">
                      <Loader2
                        size={20}
                        className="animate-spin text-primary"
                      />
                    </div>
                  ) : existing.length === 0 ? (
                    <EmptyHint onCreate={() => setView("form")} />
                  ) : (
                    <div className="space-y-2.5">
                      {existing.map((n) => (
                        <ExistingNoteCard
                          key={n.id}
                          note={n}
                          deleting={deletingId === n.id}
                          copied={copied}
                          onCopy={() => handleCopyLink(n.public_token)}
                          onSendWhats={() => handleSendWhats(n)}
                          onDelete={() => handleDelete(n)}
                          onStatus={(s) => handleStatus(n, s)}
                        />
                      ))}
                    </div>
                  )}

                  {existing.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setView("form")}
                      className="w-full h-12 rounded-2xl border-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 text-primary text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 press"
                    >
                      <Plus size={14} />
                      Crear otra comanda
                    </button>
                  )}
                </div>
              )}

              {/* ─── VISTA: SUCCESS ─── */}
              {view === "success" && createdNote && (
                <PostCreatedView
                  note={createdNote}
                  onCopy={() => handleCopyLink(createdNote.public_token)}
                  copied={copied}
                  onSendWhats={() => handleSendWhats(createdNote)}
                  hasDriverPhone={!!createdNote.driver_phone}
                  onBackToList={() => setView("list")}
                  onClose={onClose}
                />
              )}

              {/* ─── VISTA: FORM ─── */}
              {view === "form" && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Botón volver si hay lista previa */}
                  {existing.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setView("list")}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary"
                    >
                      ← Volver a la lista
                    </button>
                  )}

                  {/* Repartidores conocidos */}
                  {drivers.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                        Repartidores recientes
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {drivers.map((d) => (
                          <button
                            key={d.phone}
                            type="button"
                            onClick={() => pickDriver(d.name, d.phone)}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-primary/10 hover:text-primary border border-slate-200 dark:border-slate-700 press"
                          >
                            {d.name} · {d.phone}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Repartidor" icon={<Truck size={11} />}>
                      <input
                        type="text"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        placeholder="Nombre"
                        className="settings-input"
                        maxLength={40}
                      />
                    </Field>
                    <Field label="WhatsApp" icon={<Phone size={11} />}>
                      <input
                        type="tel"
                        value={driverPhone}
                        onChange={(e) => setDriverPhone(e.target.value)}
                        placeholder="55 1234 5678"
                        className="settings-input"
                        maxLength={20}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Dirección de entrega"
                    icon={<MapPin size={11} />}
                  >
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Calle, número, colonia, CP"
                      className="settings-input"
                    />
                  </Field>

                  <Field label="Pin de mapa (Google Maps / Waze)">
                    <input
                      type="url"
                      value={locationUrl}
                      onChange={(e) => setLocationUrl(e.target.value)}
                      placeholder="https://maps.google.com/..."
                      className="settings-input"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Zona" icon={<MapPin size={11} />}>
                      <input
                        type="text"
                        value={zone}
                        onChange={(e) => setZone(e.target.value)}
                        placeholder="Metro Hidalgo"
                        className="settings-input"
                      />
                    </Field>
                    <Field
                      label="Hora prometida"
                      icon={<Clock size={11} />}
                    >
                      <input
                        type="text"
                        value={timeTarget}
                        onChange={(e) => setTimeTarget(e.target.value)}
                        placeholder="Hoy 18:00"
                        className="settings-input"
                      />
                    </Field>
                  </div>

                  <Field label="Punto medio (si aplica)">
                    <input
                      type="text"
                      value={meetingPoint}
                      onChange={(e) => setMeetingPoint(e.target.value)}
                      placeholder="Estación Hidalgo, salida Av. Juárez"
                      className="settings-input"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Cobrar al cliente"
                      icon={<DollarSign size={11} />}
                    >
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={amountToCollect}
                        onChange={(e) =>
                          setAmountToCollect(Number(e.target.value) || 0)
                        }
                        className="settings-input text-right tabular-nums"
                      />
                    </Field>
                    <Field label="Método de pago">
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="settings-input"
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="tarjeta">Tarjeta (terminal)</option>
                        <option value="ya_pagado">Ya pagado</option>
                      </select>
                    </Field>
                  </div>

                  <Field
                    label="Notas para el repartidor"
                    icon={<StickyNote size={11} />}
                  >
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Timbre roto · pedir por la ventana · etc."
                      className="settings-input resize-none py-2"
                      maxLength={400}
                    />
                  </Field>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-12 mt-2 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-60 press-hard"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    Crear comanda
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ─────────── Sub-componentes ─────────── */

function EmptyHint({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 px-6 py-10 text-center">
      <div
        className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center text-white"
        style={{ background: "linear-gradient(135deg,#0ea5e9,#6366f1)" }}
      >
        <Truck size={20} />
      </div>
      <p className="text-[12px] font-black text-slate-700 dark:text-slate-200">
        Aún no hay comandas
      </p>
      <p className="text-[10px] font-bold text-slate-500 mt-1 leading-snug">
        Genera el link para que tu repartidor vea toda la info del pedido.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest"
      >
        <Plus size={12} />
        Crear comanda
      </button>
    </div>
  )
}

function ExistingNoteCard({
  note,
  deleting,
  copied,
  onCopy,
  onSendWhats,
  onDelete,
  onStatus,
}: {
  note: DeliveryNote
  deleting: boolean
  copied: boolean
  onCopy: () => void
  onSendWhats: () => void
  onDelete: () => void
  onStatus: (s: DeliveryStatus) => void
}) {
  const tone = DELIVERY_STATUS_TONE[note.status]
  const url = publicDeliveryUrl(note.public_token)
  const isFinal = note.status === "delivered" || note.status === "cancelled"

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2.5 bg-slate-50/60 dark:bg-slate-800/40">
      {/* Cabecera con estatus y meta */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span
            className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${tone.bg} ${tone.text}`}
          >
            {DELIVERY_STATUS_LABEL[note.status]}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate">
              {note.driver_name || "Sin repartidor asignado"}
            </p>
            <p className="text-[9px] font-bold text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Calendar size={9} />
              {formatRelative(note.created_at)}
              {note.driver_phone && (
                <>
                  <span className="text-slate-300">·</span>
                  <Phone size={9} /> {note.driver_phone}
                </>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 text-rose-500 flex items-center justify-center disabled:opacity-50 press"
          aria-label="Borrar comanda"
        >
          {deleting ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Trash2 size={11} />
          )}
        </button>
      </div>

      {/* Info entrega */}
      {(note.delivery_address || note.delivery_time_target || note.amount_to_collect > 0) && (
        <div className="text-[10px] text-slate-600 dark:text-slate-300 space-y-0.5">
          {note.delivery_address && (
            <p className="flex items-start gap-1 leading-snug">
              <MapPin size={9} className="mt-0.5 shrink-0 text-rose-400" />
              <span className="truncate">{note.delivery_address}</span>
            </p>
          )}
          {note.delivery_time_target && (
            <p className="flex items-start gap-1 leading-snug">
              <Clock size={9} className="mt-0.5 shrink-0 text-sky-400" />
              <span>{note.delivery_time_target}</span>
            </p>
          )}
          {note.amount_to_collect > 0 && (
            <p className="flex items-start gap-1 leading-snug font-black text-emerald-700 dark:text-emerald-300">
              <DollarSign size={9} className="mt-0.5 shrink-0" />
              <span>Cobrar {formatMoney(note.amount_to_collect)}</span>
            </p>
          )}
        </div>
      )}

      {/* Link mini */}
      <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1.5">
        <p className="text-[9px] font-mono text-slate-600 dark:text-slate-300 truncate">
          {url}
        </p>
      </div>

      {/* Acciones */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onCopy}
          className="h-9 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 press"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "OK" : "Copiar"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1"
        >
          <ExternalLink size={10} />
          Abrir
        </a>
        <button
          type="button"
          onClick={onSendWhats}
          disabled={!note.driver_phone}
          className="h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 press"
        >
          <Send size={10} />
          WhatsApp
        </button>
      </div>

      {/* Cambio rápido de estatus */}
      {!isFinal && (
        <div className="flex items-center gap-1 pt-1 border-t border-slate-200 dark:border-slate-700">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mr-1">
            Estatus →
          </span>
          {note.status !== "picked_up" && (
            <button
              type="button"
              onClick={() => onStatus("picked_up")}
              className="text-[9px] font-bold px-2 py-1 rounded-md bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 hover:bg-sky-100"
            >
              En camino
            </button>
          )}
          <button
            type="button"
            onClick={() => onStatus("delivered")}
            className="text-[9px] font-bold px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 flex items-center gap-1"
          >
            <CheckCircle2 size={9} /> Entregada
          </button>
          <button
            type="button"
            onClick={() => onStatus("cancelled")}
            className="text-[9px] font-bold px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-100 ml-auto flex items-center gap-1"
          >
            <XCircle size={9} /> Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

function PostCreatedView({
  note,
  onCopy,
  copied,
  onSendWhats,
  hasDriverPhone,
  onBackToList,
  onClose,
}: {
  note: DeliveryNote
  onCopy: () => void
  copied: boolean
  onSendWhats: () => void
  hasDriverPhone: boolean
  onBackToList: () => void
  onClose: () => void
}) {
  const url = publicDeliveryUrl(note.public_token)
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4">
        <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 leading-snug">
          La comanda está lista. Mándale el link al repartidor por WhatsApp,
          o cópialo si vas a mandarlo por otro medio.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
          Link del repartidor
        </p>
        <p className="text-[11px] font-mono text-slate-800 dark:text-slate-100 truncate">
          {url}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copiado" : "Copiar link"}
        </button>
        <button
          type="button"
          onClick={onSendWhats}
          disabled={!hasDriverPhone}
          className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 press"
        >
          <Send size={12} />
          WhatsApp
        </button>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-primary/40 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
      >
        <ExternalLink size={12} />
        Vista previa de la comanda
      </a>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={onBackToList}
          className="h-10 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 rounded-xl"
        >
          Ver todas
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
        {icon}
        {label}
      </span>
      {children}
    </label>
  )
}

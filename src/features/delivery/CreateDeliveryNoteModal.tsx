import { useEffect, useMemo, useState } from "react"
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
} from "lucide-react"
import toast from "react-hot-toast"

import {
  createDeliveryNote,
  updateDeliveryStatus,
  publicDeliveryUrl,
  openWhatsAppDelivery,
  rememberDriver,
  getKnownDrivers,
  type DeliveryNote,
} from "./deliveryService"
import { formatMoney } from "../../lib/format"
import { copyToClipboard } from "../../lib/clipboard"
import type { Sale } from "../../types/database"

interface Props {
  open: boolean
  sale: Sale | null
  onClose: () => void
  onCreated?: (note: DeliveryNote) => void
}

/**
 * Modal admin para armar una comanda de entrega asociada a una venta.
 * Pre-llena dirección/teléfono del cliente y monto pendiente.
 * Al crear, ofrece "Mandar por WhatsApp" + "Copiar link".
 */
export default function CreateDeliveryNoteModal({
  open,
  sale,
  onClose,
  onCreated,
}: Props) {
  const drivers = useMemo(() => getKnownDrivers(), [open])

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

  /** Prellenar campos cuando se abre con una sale nueva. */
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
  }, [open, sale])

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
      toast.success("Comanda lista", { id: tid })
      onCreated?.(note)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear", { id: tid })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopyLink() {
    if (!createdNote) return
    const url = publicDeliveryUrl(createdNote.public_token)
    await copyToClipboard(url, "Link copiado")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSendWhats() {
    if (!createdNote || !sale) return
    openWhatsAppDelivery(createdNote, sale.customer_name)
    // marca como enviado
    updateDeliveryStatus(createdNote.id, "sent").catch(() => {})
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

          <motion.form
            onSubmit={handleSubmit}
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
                      {createdNote ? "Comanda lista" : "Comanda de entrega"}
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

              {createdNote ? (
                /* ─── VISTA POST-CREACIÓN: link + WhatsApp ─── */
                <PostCreatedView
                  note={createdNote}
                  onCopy={handleCopyLink}
                  copied={copied}
                  onSendWhats={handleSendWhats}
                  hasDriverPhone={!!createdNote.driver_phone}
                  onClose={onClose}
                />
              ) : (
                /* ─── FORM DE CREACIÓN ─── */
                <>
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
                </>
              )}
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function PostCreatedView({
  note,
  onCopy,
  copied,
  onSendWhats,
  hasDriverPhone,
  onClose,
}: {
  note: DeliveryNote
  onCopy: () => void
  copied: boolean
  onSendWhats: () => void
  hasDriverPhone: boolean
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

      <button
        type="button"
        onClick={onClose}
        className="w-full h-10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
      >
        Cerrar
      </button>
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

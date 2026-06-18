import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Sparkles,
  Camera,
  Loader2,
  Heart,
  Image as ImageIcon,
  Trash2,
  CheckCircle2,
} from "lucide-react"
import toast from "react-hot-toast"

import { createWish, uploadWishImage } from "./wishesService"
import { useAuth } from "../../lib/useAuth"
import { fetchMyProfile, updateMyProfile } from "../profile/profileService"

interface Props {
  open: boolean
  onClose: () => void
  /** Si se pasa, prellena el wish con referencia al catálogo. */
  productRef?: {
    product_id?: string | null
    variant_id?: string | null
    title: string
    image_url?: string | null
  } | null
  /** Default email del invitado si no hay sesión. */
  defaultEmail?: string
  /** Callback al crear con éxito. */
  onCreated?: () => void
}

/**
 * Drawer bottom-sheet para que el cliente cree un "deseo":
 *   - Algo que YA tenemos pero quiere otra talla/color → con product_id.
 *   - Algo que NO tenemos y le gustaría que trajéramos → libre con foto.
 *
 * El admin lo ve en la sección "Sugerencias" y decide qué hacer.
 */
export default function WishesDrawer({
  open,
  onClose,
  productRef,
  defaultEmail,
  onCreated,
}: Props) {
  const { session, user, email: authEmail, fullName } = useAuth()
  const isLogged = !!session

  const [email, setEmail] = useState(defaultEmail ?? authEmail ?? "")
  const [name, setName] = useState(fullName ?? "")
  const [phone, setPhone] = useState("")
  /** Phone que YA estaba en el perfil al abrir (para saber si hay que actualizarlo). */
  const [profilePhone, setProfilePhone] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [title, setTitle] = useState(productRef?.title ?? "")
  const [description, setDescription] = useState("")
  const [size, setSize] = useState("")
  const [color, setColor] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(
    productRef?.image_url ?? null,
  )
  const [submitting, setSubmitting] = useState(false)

  // Cargar phone del perfil cuando el cliente está logueado.
  // Evita pedirle datos que ya nos dio en su registro.
  useEffect(() => {
    if (!open || !isLogged || !user) {
      setProfilePhone(null)
      return
    }
    let alive = true
    setLoadingProfile(true)
    fetchMyProfile(user.id)
      .then((p) => {
        if (!alive) return
        setProfilePhone(p?.phone ?? null)
        setPhone(p?.phone ?? "")
        if (p?.full_name) setName(p.full_name)
        if (p?.email) setEmail(p.email)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingProfile(false)
      })
    return () => {
      alive = false
    }
  }, [open, isLogged, user])

  // Reset al abrir (campos del wish, NO los datos personales)
  useEffect(() => {
    if (open) {
      setTitle(productRef?.title ?? "")
      setDescription("")
      setSize("")
      setColor("")
      setFile(null)
      setPreview(productRef?.image_url ?? null)
      if (!isLogged) {
        setEmail(defaultEmail ?? authEmail ?? "")
        setName(fullName ?? "")
        setPhone("")
      }
    }
  }, [open, productRef, isLogged, defaultEmail, authEmail, fullName])

  // Bloquear scroll body
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  function handleFile(f: File | null) {
    if (!f) {
      setFile(null)
      setPreview(productRef?.image_url ?? null)
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("La imagen pesa más de 5MB")
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !title.trim()) {
      toast.error("Email y título son obligatorios")
      return
    }

    setSubmitting(true)
    const tid = toast.loading("Enviando tu deseo...")

    try {
      let imageUrl = productRef?.image_url ?? null
      if (file) {
        imageUrl = await uploadWishImage(file, email)
      }

      await createWish({
        customer_email: email,
        customer_name: name || null,
        customer_phone: phone || null,
        product_id: productRef?.product_id ?? null,
        variant_id: productRef?.variant_id ?? null,
        title,
        description: description || null,
        image_url: imageUrl,
        size: size || null,
        color: color || null,
      })

      // Si el cliente está logueado y capturó un phone que NO tenía en su
      // perfil, lo guardamos ahí silenciosamente para no volver a pedirlo.
      if (isLogged && user && phone.trim() && phone.trim() !== profilePhone) {
        updateMyProfile(user.id, { phone: phone.trim() }).catch(() => {})
      }

      toast.success("¡Listo! BEAUTY'S ME recibió tu petición ✨", { id: tid })
      onCreated?.()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar tu deseo", { id: tid })
    } finally {
      setSubmitting(false)
    }
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="wish-drawer-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !submitting && onClose()}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.form
            onSubmit={handleSubmit}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl"
          >
            {/* Handle */}
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>

            <div className="px-5 pb-6 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-bloom shrink-0"
                    style={{
                      background: "linear-gradient(135deg,#e6007e,#a855f7)",
                    }}
                  >
                    <Sparkles size={18} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">
                      Pídelo a BEAUTY'S ME
                    </h2>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                      Dinos qué buscas (talla, color, modelo). Revisamos cada
                      petición y te avisamos.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center press disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Preview de imagen */}
              <div className="relative">
                {preview ? (
                  <div className="relative rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 aspect-video">
                    <img
                      src={preview}
                      alt="referencia"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {file && (
                      <button
                        type="button"
                        onClick={() => handleFile(null)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow press"
                        title="Quitar imagen"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <label className="block rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all">
                    <Camera
                      size={20}
                      className="mx-auto mb-1 text-slate-400 dark:text-slate-500"
                    />
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Sube una foto o captura
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                      Opcional · máximo 5MB
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}

                {preview && !file && (
                  <label className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-3 h-8 rounded-full bg-white/95 dark:bg-slate-900/95 text-[10px] font-black text-slate-700 dark:text-slate-200 shadow border border-slate-200 dark:border-slate-700 cursor-pointer press">
                    <ImageIcon size={11} /> Cambiar
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>

              {/* Form fields */}
              <Field label="¿Qué quieres?" required>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Ej. Tenis Nike Air rosa"
                  className="settings-input"
                  maxLength={120}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Talla">
                  <input
                    type="text"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="M, 26, etc"
                    className="settings-input"
                    maxLength={20}
                  />
                </Field>
                <Field label="Color / variante">
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Rosa, negro..."
                    className="settings-input"
                    maxLength={40}
                  />
                </Field>
              </div>

              <Field label="Detalles extra">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Marca, modelo, link de inspiración, para cuándo lo necesitas..."
                  className="settings-input resize-none"
                  maxLength={400}
                />
              </Field>

              {/* Datos del cliente — solo si NO está logueado o si falta phone */}
              {!isLogged && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    ¿Cómo te contactamos?
                  </p>
                  <Field label="Nombre">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tu nombre"
                      className="settings-input"
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Email" required>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="tu@email.com"
                      className="settings-input"
                    />
                  </Field>
                  <Field label="WhatsApp">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="55 1234 5678"
                      className="settings-input"
                      maxLength={20}
                    />
                  </Field>
                </div>
              )}

              {/* Logueado: ya sabemos quién eres. Si falta phone se lo pedimos
                  una sola vez y lo guardamos en su perfil al enviar. */}
              {isLogged && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  {loadingProfile ? (
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                      <Loader2 size={11} className="animate-spin" />
                      Cargando tus datos…
                    </div>
                  ) : profilePhone ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                      <CheckCircle2
                        size={13}
                        className="text-emerald-600 dark:text-emerald-400 shrink-0"
                      />
                      <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 leading-tight">
                        Te contactaremos al WhatsApp{" "}
                        <b>{profilePhone}</b> que ya tienes guardado.
                      </p>
                    </div>
                  ) : (
                    <Field label="Tu WhatsApp (lo guardamos en tu perfil)">
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="55 1234 5678"
                        className="settings-input"
                        maxLength={20}
                      />
                    </Field>
                  )}
                </div>
              )}

              {/* CTA */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 mt-3 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-60 press-hard"
              >
                {submitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Heart size={14} />
                )}
                Enviar petición
              </button>

              <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center italic pt-1">
                Revisamos cada deseo en persona y te respondemos por WhatsApp o
                en la sección "Mis deseos" 💛
              </p>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  )
}

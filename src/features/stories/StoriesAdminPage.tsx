import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Camera,
  Plus,
  RefreshCw,
  X as XIcon,
  Trash2,
  Eye,
  Clock,
  Power,
  PowerOff,
  PlusCircle,
  Loader2,
  Calendar,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react"
import toast from "react-hot-toast"

import {
  listAllStories,
  createStory,
  togglePublishStory,
  deleteStory,
  extendStory,
  uploadStoryImage,
  formatTimeRemaining,
  isVideoUrl,
  type Story,
} from "./storiesService"
import { useBusinessRules } from "../settings/businessRulesService"
import PageHeader from "../../components/ui/PageHeader"
import KpiCard from "../../components/ui/KpiCard"
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration"
import Skeleton from "../../components/ui/Skeleton"
import { confirmAction } from "../../lib/confirm"

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })

export default function StoriesAdminPage() {
  const rules = useBusinessRules()
  const [items, setItems] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [showExpired, setShowExpired] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listAllStories({
        includeExpired: showExpired,
        limit: 80,
      })
      setItems(data)
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron cargar las stories")
    } finally {
      setLoading(false)
    }
  }, [showExpired])

  useEffect(() => {
    load()
  }, [load])

  const active = items.filter(
    (s) => s.is_published && new Date(s.expires_at) > new Date(),
  )
  const totalViews = items.reduce((a, s) => a + (s.view_count || 0), 0)

  async function handleToggle(s: Story) {
    const tid = toast.loading(s.is_published ? "Pausando..." : "Publicando...")
    try {
      await togglePublishStory(s.id, !s.is_published)
      toast.success(s.is_published ? "Pausada" : "Publicada", { id: tid })
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló", { id: tid })
    }
  }

  async function handleExtend(s: Story) {
    const tid = toast.loading("Extendiendo 24h más...")
    try {
      await extendStory(s.id, 24)
      toast.success("Extendida 24h", { id: tid })
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló", { id: tid })
    }
  }

  async function handleDelete(s: Story) {
    if (
      !(await confirmAction({
        title: "¿Eliminar story?",
        description: "Se borra para siempre. Esta acción no se puede deshacer.",
        confirmLabel: "Sí, eliminar",
        tone: "danger",
      }))
    )
      return
    const tid = toast.loading("Eliminando...")
    try {
      await deleteStory(s.id)
      toast.success("Eliminada", { id: tid })
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "Falló", { id: tid })
    }
  }

  return (
    <div className="relative max-w-3xl mx-auto pb-32">
      <span className="deco-orb deco-orb-amber top-10 -left-16 w-64 h-64" />
      <span className="deco-orb deco-orb-pink top-32 -right-16 w-72 h-72" />

      <PageHeader
        icon={Camera}
        iconTone="primary"
        title="Stories del día"
        subtitle="Lo que tus clientes ven al abrir la tienda"
        right={
          <button
            onClick={load}
            className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center press"
            title="Refrescar"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : ""}
            />
          </button>
        }
      />

      {/* Banner si está desactivado */}
      {!rules.stories_enabled && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-start gap-3"
        >
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-base">
            ⚠️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-amber-900 dark:text-amber-100 leading-tight">
              Stories apagadas en la tienda
            </p>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 leading-tight mt-0.5">
              Puedes crearlas aquí pero el cliente no las verá hasta que
              actives <b>stories_enabled</b> en Reglas → Módulos del cliente.
            </p>
          </div>
        </motion.div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <KpiCard
          label="Activas"
          value={active.length}
          tone={active.length > 0 ? "primary" : "default"}
          icon={<Eye size={9} />}
        />
        <KpiCard
          label="Vistas totales"
          value={totalViews}
          tone="success"
          icon={<Eye size={9} />}
        />
        <KpiCard
          label="Promedio vistas"
          value={
            items.length
              ? Math.round(totalViews / items.length)
              : 0
          }
          tone="default"
          icon={<Eye size={9} />}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          onClick={() => setCreating(true)}
          className="h-11 px-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom press-hard"
        >
          <Plus size={14} strokeWidth={2.5} /> Nueva story
        </button>
        <label className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showExpired}
            onChange={(e) => setShowExpired(e.target.checked)}
            className="accent-primary"
          />
          Ver expiradas
        </label>
      </div>

      {/* Grid de stories */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {loading ? (
          [1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" rounded="xl" />
          ))
        ) : items.length === 0 ? (
          <div className="col-span-full">
            <EmptyStateIllustration
              variant="no-photos"
              title="Sin stories"
              subtitle="Crea tu primera story para que aparezca arriba en la tienda"
              cta={
                <button
                  onClick={() => setCreating(true)}
                  className="h-10 px-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-bloom press-hard mx-auto"
                >
                  <PlusCircle size={13} /> Crear story
                </button>
              }
            />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {items.map((s, i) => {
              const expired = new Date(s.expires_at) <= new Date()
              const muted = !s.is_published || expired
              return (
                <motion.article
                  key={s.id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ delay: Math.min(i * 0.03, 0.2) }}
                  className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shadow-sm group"
                >
                  {isVideoUrl(s.image_url) ? (
                    <video
                      src={s.image_url}
                      className={`w-full h-full object-cover ${muted ? "opacity-50" : ""}`}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={s.image_url}
                      alt={s.caption || ""}
                      className={`w-full h-full object-cover ${muted ? "opacity-50" : ""}`}
                      loading="lazy"
                    />
                  )}

                  {/* Gradiente para legibilidad */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40 pointer-events-none" />

                  {/* Status badge */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 flex-wrap">
                    {!s.is_published && (
                      <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white">
                        Pausada
                      </span>
                    )}
                    {expired && (
                      <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-rose-500/90 text-white">
                        Expirada
                      </span>
                    )}
                    {!muted && (
                      <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white">
                        En vivo
                      </span>
                    )}
                  </div>

                  {/* Vistas */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-black text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md">
                    <Eye size={9} /> {s.view_count}
                  </div>

                  {/* Caption + tiempo */}
                  <div className="absolute bottom-0 inset-x-0 p-3 text-white">
                    {s.caption && (
                      <p className="text-[11px] font-black line-clamp-2 leading-tight drop-shadow">
                        {s.caption}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[9px] font-bold opacity-90">
                      <span className="flex items-center gap-1">
                        <Calendar size={8} /> {fmtDate(s.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={8} /> {formatTimeRemaining(s.expires_at)}
                      </span>
                    </div>
                  </div>

                  {/* Acciones overlay */}
                  <div className="absolute inset-x-0 bottom-0 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <div className="px-2 py-2 flex items-center justify-center gap-1 bg-black/40 backdrop-blur-sm">
                      <ActionBtn
                        title={s.is_published ? "Pausar" : "Publicar"}
                        onClick={() => handleToggle(s)}
                      >
                        {s.is_published ? (
                          <PowerOff size={12} />
                        ) : (
                          <Power size={12} />
                        )}
                      </ActionBtn>
                      <ActionBtn
                        title="Extender +24h"
                        onClick={() => handleExtend(s)}
                      >
                        <Clock size={12} />
                      </ActionBtn>
                      {s.link_url && (
                        <a
                          href={s.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir link"
                          className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center press"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <ActionBtn
                        title="Eliminar"
                        onClick={() => handleDelete(s)}
                        danger
                      >
                        <Trash2 size={12} />
                      </ActionBtn>
                    </div>
                  </div>
                </motion.article>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      <CreateStoryModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={load}
      />
    </div>
  )
}

function ActionBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-white press ${
        danger ? "bg-rose-500/80 hover:bg-rose-500" : "bg-white/20 hover:bg-white/30"
      }`}
    >
      {children}
    </button>
  )
}

/* ────────── Modal de creación ────────── */
function CreateStoryModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [ttlHours, setTtlHours] = useState(24)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setFile(null)
      setPreview(null)
      setCaption("")
      setLinkUrl("")
      setTtlHours(24)
    }
  }, [open])

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
      setPreview(null)
      return
    }
    const isVideo = f.type.startsWith("video/")
    const limit = isVideo ? 25 * 1024 * 1024 : 5 * 1024 * 1024
    if (f.size > limit) {
      toast.error(isVideo ? "El video pesa más de 25MB" : "La imagen pesa más de 5MB")
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.error("Sube una foto primero")
      return
    }
    setBusy(true)
    const tid = toast.loading("Publicando story...")
    try {
      const url = await uploadStoryImage(file)
      await createStory({
        image_url: url,
        caption: caption || null,
        link_url: linkUrl || null,
        ttl_hours: ttlHours,
      })
      toast.success("¡Publicada!", { id: tid })
      onCreated()
      onClose()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo publicar", { id: tid })
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-end md:items-center justify-center"
      >
        <div
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => !busy && onClose()}
        />

        <motion.form
          onSubmit={handleSubmit}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 280, damping: 30 }}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-3xl shadow-2xl"
        >
          {/* Handle (mobile) */}
          <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 pt-2 pb-1 flex justify-center md:hidden">
            <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>

          <div className="px-5 pb-6 pt-3 md:pt-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-bloom shrink-0"
                  style={{
                    background: "linear-gradient(135deg,#e6007e,#f97316)",
                  }}
                >
                  <Camera size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tight">
                    Nueva story
                  </h2>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-snug">
                    Aparece arriba en la tienda · expira automático
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center press"
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* Preview (imagen o video) */}
            {preview ? (
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                {file?.type.startsWith("video/") ? (
                  <video
                    src={preview}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img
                    src={preview}
                    alt="preview"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleFile(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center shadow press"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <label className="block aspect-[3/4] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all">
                <ImageIcon
                  size={28}
                  className="text-slate-400 dark:text-slate-500"
                />
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Sube una foto
                </p>
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
                  Foto o video vertical · imagen ≤5MB · video ≤25MB
                </p>
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}

            <Field label="Mensaje (opcional)">
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Llegó nuevo color..."
                className="settings-input"
                maxLength={80}
              />
            </Field>

            <Field label="Link para 'Ver más' (opcional)">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://wa.me/52... o link de producto"
                className="settings-input"
                maxLength={500}
              />
            </Field>

            <Field label={`Duración: ${ttlHours}h`}>
              <input
                type="range"
                min={6}
                max={72}
                step={6}
                value={ttlHours}
                onChange={(e) => setTtlHours(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-1">
                <span>6h</span>
                <span>24h</span>
                <span>48h</span>
                <span>72h</span>
              </div>
            </Field>

            <button
              type="submit"
              disabled={busy || !file}
              className="w-full h-12 mt-2 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom disabled:opacity-60 press-hard"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              Publicar story
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  )
}

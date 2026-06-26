import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X, Save, Tag as TagIcon, NotebookPen, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"
import { useBodyScrollLock } from "../../lib/bodyScrollLock"
import { translateError } from "../../lib/supabaseErrors"
import { debug } from "../../lib/debug"

/**
 * Drawer admin para escribir notas privadas + tags sobre un cliente.
 *
 * Las columnas viven en `user_profiles`:
 *   - `private_notes` TEXT  (libre, hasta 1000 chars)
 *   - `tags` TEXT[] o JSONB array de strings ("vip", "novata", etc.)
 *
 * El read/save es TOLERANTE: si la columna aún no existe (SQL fix no
 * corrido), el drawer muestra un aviso amable en lugar de fallar.
 *
 * Solo los admins/staff lo ven (el caller decide cuándo renderizar).
 */

interface Props {
  open: boolean
  email: string | null
  customerName?: string | null
  onClose: () => void
}

/** Sugerencias rápidas de tags. Mari puede agregar libremente otros. */
const SUGGESTED_TAGS = [
  "VIP",
  "Mayorista",
  "Novata",
  "Difícil",
  "Recomendada",
  "Foránea",
  "Local",
  "Paga tarde",
  "Cumpleañera",
]

export default function CustomerNotesDrawer({
  open,
  email,
  customerName,
  onClose,
}: Props) {
  const [notes, setNotes] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [supported, setSupported] = useState(true)

  useBodyScrollLock(open)

  // Carga al abrir
  useEffect(() => {
    if (!open || !email) return
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("private_notes,tags")
          .eq("email", email.toLowerCase())
          .maybeSingle()
        if (!alive) return
        if (error) {
          // Si la columna no existe, Postgres devuelve 42703.
          const code = String((error as any)?.code ?? "")
          if (code === "42703" || /column.*does not exist/i.test(error.message)) {
            setSupported(false)
            return
          }
          debug.warn("[customer-notes] load:", error.message)
        }
        const row = (data ?? {}) as any
        setNotes(String(row.private_notes ?? ""))
        const rawTags = row.tags
        const parsedTags: string[] = Array.isArray(rawTags)
          ? rawTags.filter((t): t is string => typeof t === "string")
          : typeof rawTags === "string"
          ? rawTags.split(",").map((s) => s.trim()).filter(Boolean)
          : []
        setTags(parsedTags)
      } catch (e: any) {
        debug.warn("[customer-notes] load fail:", e?.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [open, email])

  function addTag(tag: string) {
    const clean = tag.trim()
    if (!clean) return
    if (tags.includes(clean)) return
    setTags((prev) => [...prev, clean])
    setNewTag("")
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  async function save() {
    if (!email || saving) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({
          private_notes: notes.slice(0, 1000),
          tags: tags.slice(0, 12),
        })
        .eq("email", email.toLowerCase())
      if (error) {
        const code = String((error as any)?.code ?? "")
        if (code === "42703") {
          setSupported(false)
          toast.error(
            "Tu BD no tiene aún las columnas private_notes y tags · corre el SQL pendiente.",
          )
          return
        }
        throw error
      }
      toast.success("Notas guardadas 💾")
      onClose()
    } catch (e) {
      toast.error(translateError(e, "No se pudo guardar"))
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={saving ? undefined : onClose}
            aria-hidden
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[2rem] pb-safe max-h-[88vh] flex flex-col shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.45)]"
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            <div className="flex items-center justify-between px-5 pb-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-black leading-none">
                  Notas privadas
                </p>
                <h3 className="text-lg font-black tracking-tight mt-1 truncate flex items-center gap-1.5">
                  <NotebookPen size={16} className="text-primary shrink-0" />
                  {customerName || email}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                  Solo tú las ves. El cliente NO sabe que existen.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 press disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3 scroll-container-ios space-y-4">
              {!supported ? (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
                  <p className="text-[12px] font-black text-amber-800 dark:text-amber-200">
                    Esta función necesita columnas nuevas en BD
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-200/70 mt-1 leading-snug">
                    Corre este SQL en tu Supabase para habilitar notas y
                    tags por cliente:
                  </p>
                  <pre className="mt-2 text-[10px] bg-white dark:bg-slate-900/40 rounded-lg p-2 overflow-x-auto font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
{`ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS private_notes TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';`}
                  </pre>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : (
                <>
                  {/* Tags */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                      <TagIcon size={11} />
                      Etiquetas
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tags.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">
                          Sin etiquetas todavía
                        </span>
                      ) : (
                        tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/15 transition-colors"
                            title="Quitar etiqueta"
                          >
                            {tag}
                            <X size={9} />
                          </button>
                        ))
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map(
                        (t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => addTag(t)}
                            className="h-6 px-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider press"
                          >
                            + {t}
                          </button>
                        ),
                      )}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        addTag(newTag)
                      }}
                      className="flex gap-1.5 mt-2"
                    >
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Nueva etiqueta…"
                        maxLength={24}
                        className="flex-1 h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] focus:outline-none focus:border-primary"
                      />
                      <button
                        type="submit"
                        disabled={!newTag.trim()}
                        className="h-9 px-3 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        Agregar
                      </button>
                    </form>
                  </div>

                  {/* Notas */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                      <NotebookPen size={11} />
                      Notas libres ({notes.length}/1000)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) =>
                        setNotes(e.target.value.slice(0, 1000))
                      }
                      placeholder="Ej. Le gusta el rojo · paga 2 días tarde · referida por Karla…"
                      rows={6}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[12px] leading-relaxed focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black uppercase tracking-widest press disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !supported}
                className="flex-[1.4] h-11 rounded-2xl bg-brand text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow-bloom disabled:opacity-50 press-hard"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    <Save size={13} />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

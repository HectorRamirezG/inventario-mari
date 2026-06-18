import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Plus, Play } from "lucide-react"

import { listActiveStories, isVideoUrl, type Story } from "./storiesService"
import StoryViewer from "./StoryViewer"
import Skeleton from "../../components/ui/Skeleton"
import { imageAvatar } from "../../lib/imageTransform"

interface Props {
  /** Solo visible si la regla `stories_enabled` está activa. */
  enabled: boolean
  /** Opcional: si es admin/staff puede mostrar "agregar story" */
  showAddCta?: boolean
  onAdd?: () => void
}

/**
 * Fila horizontal estilo Instagram con stories activas.
 * Click en una abre el viewer fullscreen.
 *
 * Si `enabled = false` o no hay stories activas, no renderiza nada.
 */
export default function StoriesBar({ enabled, showAddCta, onAdd }: Props) {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!enabled) {
      setStories([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await listActiveStories()
      setStories(data)
    } catch {
      setStories([])
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    load()
    // Refrescar al volver a focus (cambio de pestaña)
    const handler = () => load()
    window.addEventListener("focus", handler)
    return () => window.removeEventListener("focus", handler)
  }, [load])

  if (!enabled) return null

  if (loading) {
    return (
      <div className="flex gap-3 mb-4 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton
            key={i}
            className="w-16 h-16 rounded-full shrink-0"
            rounded="full"
          />
        ))}
      </div>
    )
  }

  if (stories.length === 0 && !showAddCta) return null

  return (
    <>
      <div className="flex gap-3 mb-4 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
        {showAddCta && (
          <button
            onClick={onAdd}
            className="shrink-0 flex flex-col items-center gap-1 press"
            aria-label="Agregar story"
          >
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center text-primary">
              <Plus size={20} strokeWidth={2.5} />
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Crear
            </span>
          </button>
        )}

        {stories.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setViewerIndex(i)}
            className="shrink-0 flex flex-col items-center gap-1 press"
            aria-label={s.caption || "Ver story"}
          >
            <div
              className="w-16 h-16 rounded-full p-[2px]"
              style={{
                background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
              }}
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-slate-900 p-[2px]">
                {isVideoUrl(s.image_url) ? (
                  <div className="relative w-full h-full rounded-full overflow-hidden">
                    <video
                      src={s.image_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play size={14} className="text-white" fill="white" />
                    </div>
                  </div>
                ) : (
                  <img
                    src={imageAvatar(s.image_url) || s.image_url}
                    alt={s.caption || ""}
                    loading="lazy"
                    decoding="async"
                    width={128}
                    height={128}
                    className="w-full h-full rounded-full object-cover"
                  />
                )}
              </div>
            </div>
            <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 dark:text-slate-400 max-w-[64px] truncate">
              {s.caption || "Story"}
            </span>
          </button>
        ))}
      </div>

      {viewerIndex !== null && (
        <StoryViewer
          stories={stories}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  )
}

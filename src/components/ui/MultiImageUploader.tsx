import { useRef, useState } from "react"
import { motion, AnimatePresence, Reorder } from "framer-motion"
import {
  Camera,
  Image as ImageIcon,
  X,
  Loader2,
  Star,
  GripVertical,
} from "lucide-react"
import toast from "react-hot-toast"

import { supabase } from "../../lib/supabase"

interface Props {
  /** Array de URLs. La primera es la principal (portada). */
  value: string[]
  onChange: (urls: string[]) => void
  /** Carpeta dentro del bucket `product-images`. Ej: `variants/abc-123` */
  folder?: string
  /** Cuántas fotos como máximo (default 6) */
  max?: number
  label?: string
}

/**
 * Sube múltiples imágenes al bucket `product-images` y maneja un array
 * ordenado. La primera foto es la "portada" (`image_url` heredado).
 * Permite reordenar (drag) y borrar individualmente.
 */
export default function MultiImageUploader({
  value,
  onChange,
  folder = "variants",
  max = 6,
  label = "Agregar foto",
}: Props) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const remaining = Math.max(0, max - value.length)
  const atLimit = remaining === 0

  async function uploadOne(file: File): Promise<string | null> {
    if (!file.type.startsWith("image/")) {
      toast.error(`"${file.name}" no es una imagen`)
      return null
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`"${file.name}" pesa más de 5MB`)
      return null
    }
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "31536000", upsert: false })
    if (error) {
      console.error("[MultiImageUploader.upload]", { path, error })
      toast.error(`No se pudo subir "${file.name}": ${error.message}`)
      return null
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(path)
    return publicUrl
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const arr = Array.from(files).slice(0, remaining)
    if (arr.length === 0) {
      toast.error(`Máximo ${max} fotos`)
      return
    }
    setUploading(true)
    const tid = toast.loading(
      arr.length === 1 ? "Subiendo foto..." : `Subiendo ${arr.length} fotos...`
    )
    try {
      const uploaded: string[] = []
      for (const f of arr) {
        const url = await uploadOne(f)
        if (url) uploaded.push(url)
      }
      if (uploaded.length > 0) {
        onChange([...value, ...uploaded])
        toast.success(
          uploaded.length === 1
            ? "Foto agregada · pulsa Guardar para persistir"
            : `${uploaded.length} fotos agregadas · pulsa Guardar para persistir`,
          { id: tid, duration: 3500 }
        )
      } else {
        // Ningún archivo se subió correctamente
        toast.error("No se subió ninguna foto. Revisa permisos / tamaño.", {
          id: tid,
        })
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function removeAt(url: string) {
    onChange(value.filter((u) => u !== url))
  }

  function makePrimary(url: string) {
    if (value[0] === url) return
    onChange([url, ...value.filter((u) => u !== url)])
  }

  return (
    <div className="space-y-3">
      {/* Galería actual (reordenable) */}
      {value.length > 0 && (
        <Reorder.Group
          axis="x"
          values={value}
          onReorder={onChange}
          className="flex gap-2 flex-wrap"
          as="div"
        >
          <AnimatePresence>
            {value.map((url, i) => (
              <Reorder.Item
                key={url}
                value={url}
                className="relative w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 group cursor-grab active:cursor-grabbing touch-none"
                as="div"
                whileDrag={{ scale: 1.08, zIndex: 10 }}
              >
                <motion.img
                  src={url}
                  alt={`Foto ${i + 1}`}
                  className="w-full h-full object-cover pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                />
                {/* Indicador de principal */}
                {i === 0 && (
                  <span
                    className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-amber-400/95 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-0.5 shadow"
                    title="Foto principal"
                  >
                    <Star size={8} fill="currentColor" />
                    1
                  </span>
                )}
                {i !== 0 && (
                  <button
                    type="button"
                    onClick={() => makePrimary(url)}
                    className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white/85 backdrop-blur text-slate-700 hover:text-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Hacer principal"
                  >
                    <Star size={10} />
                  </button>
                )}
                {/* Grip visual (solo desktop) */}
                <span className="absolute bottom-1 left-1 w-4 h-4 rounded bg-black/40 text-white hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <GripVertical size={10} />
                </span>
                {/* Eliminar */}
                <button
                  type="button"
                  onClick={() => removeAt(url)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow"
                  aria-label="Quitar foto"
                >
                  <X size={11} />
                </button>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}

      {/* Botones de subida */}
      {!atLimit && (
        <div className="flex gap-2">
          <label
            className={`flex-1 cursor-pointer h-20 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
              uploading
                ? "border-slate-200 bg-slate-50 text-slate-400"
                : "border-slate-200 hover:border-primary hover:bg-primary/5 text-slate-500"
            }`}
          >
            {uploading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <ImageIcon size={18} />
                <span className="text-[9px] font-black uppercase tracking-widest">
                  {value.length === 0 ? label : "Otra foto"}
                </span>
                <span className="text-[8px] text-slate-400">
                  Quedan {remaining}
                </span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={uploading}
            />
          </label>
          <label className="cursor-pointer w-20 h-20 rounded-2xl bg-slate-50 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-slate-500">
            <Camera size={18} />
            <span className="text-[8px] font-black uppercase tracking-widest">
              Cámara
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={uploading}
            />
          </label>
        </div>
      )}
      {atLimit && (
        <p className="text-[10px] text-slate-400 text-center">
          Tope de {max} fotos. Quita alguna para subir otra.
        </p>
      )}
    </div>
  )
}

import { useState, useRef } from "react"
import { Camera, Image as ImageIcon, X, Loader2, Upload } from "lucide-react"
import { motion } from "framer-motion"
import toast from "react-hot-toast"
import { supabase } from "../../lib/supabase"
import { compressImage } from "../../lib/imageCompress"

interface Props {
  value: string | null
  onChange: (url: string | null) => void
  /** Sufijo de carpeta para organizar dentro del bucket */
  folder?: string
  /** Texto del botón (default: "Agregar foto") */
  label?: string
}

/**
 * Sube una imagen al bucket `product-images` y devuelve la URL pública.
 * Soporta cámara (capture="environment") en móviles + galería.
 */
export default function ProductImageUploader({
  value,
  onChange,
  folder = "products",
  label = "Agregar foto",
}: Props) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Sólo imágenes")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB")
      return
    }

    setUploading(true)
    try {
      // Comprime client-side (5MB del cel → 200-400KB) antes de subir.
      const compact = await compressImage(file, { maxWidth: 1600, quality: 0.82 })
      const ext = compact.name.split(".").pop() || "jpg"
      const path = `${folder}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, compact, { cacheControl: "31536000", upsert: false })
      if (error) throw error
      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(path)
      onChange(publicUrl)
      toast.success("Foto subida ✓")
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo subir")
    } finally {
      setUploading(false)
    }
  }

  if (value) {
    return (
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full aspect-square max-h-48 rounded-2xl overflow-hidden bg-slate-100 group"
      >
        <img src={value} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 p-2 flex gap-2 bg-gradient-to-t from-black/60 to-transparent">
          <label className="flex-1 cursor-pointer h-9 rounded-xl bg-white/90 backdrop-blur text-slate-900 text-[10px] font-black uppercase flex items-center justify-center gap-1.5">
            <Upload size={12} />
            Cambiar
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center"
            aria-label="Quitar foto"
          >
            <X size={14} />
          </button>
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="text-white animate-spin" />
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <div className="flex gap-2">
      <label className="flex-1 cursor-pointer h-24 rounded-2xl border-2 border-dashed border-slate-200 hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-slate-500 transition-colors">
        {uploading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <>
            <ImageIcon size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {label}
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </label>
      <label className="cursor-pointer w-24 h-24 rounded-2xl bg-slate-50 hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-slate-500">
        <Camera size={20} />
        <span className="text-[9px] font-black uppercase tracking-widest">
          Cámara
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </label>
    </div>
  )
}

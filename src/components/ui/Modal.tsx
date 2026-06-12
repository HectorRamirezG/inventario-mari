import { X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { clsx } from "clsx"
import { createPortal } from "react-dom" // Vital para que no se encime nada

interface ModalProps {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  size?: "sm" | "md" | "lg"
}

export default function Modal({
  open,
  title,
  children,
  onClose,
  size = "md"
}: ModalProps) {
  
  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl"
  }

  // Si no está abierto, no renderizamos nada para ahorrar recursos
  if (typeof document === "undefined") return null;

  const modalContent = (
    <AnimatePresence>
      {open && (
        /* Z-INDEX ALTO: z-[100] asegura que esté por encima de navbars y botones */
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          
          {/* BACKDROP: Más oscuro y con más blur para aislar el contenido de atrás */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[8px]"
          />

          {/* CONTENEDOR DEL MODAL */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              transition: { type: "spring", damping: 25, stiffness: 300 } 
            }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={clsx(
              "relative w-full overflow-hidden flex flex-col",
              "rounded-[2.5rem] bg-white shadow-[0_32px_80px_-20px_rgba(0,0,0,0.3)]",
              "border border-white/20 ring-1 ring-black/5",
              sizes[size]
            )}
          >
            {/* HEADER: Estilo "Soft-Tech" con degradado sutil */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-gradient-to-r from-pink-50/50 to-transparent">
              <h3 className="text-xl font-black text-slate-800 italic tracking-tight">
                {title}
              </h3>

              <button
                onClick={onClose}
                className="group flex items-center justify-center rounded-2xl h-10 w-10 bg-slate-50 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500 hover:rotate-90"
                aria-label="Cerrar"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            {/* CUERPO: Scrollbar invisible/elegante y límite de altura */}
            <div className="px-8 py-8 overflow-y-auto max-h-[75vh] custom-scrollbar">
              <div className="space-y-6">
                {children}
              </div>
            </div>

            {/* DECORACIÓN INFERIOR SUTIL */}
            <div className="h-2 bg-gradient-to-r from-transparent via-primary/5 to-transparent opacity-50" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // El Portal lo envía al final del <body>, saltándose cualquier restricción de CSS del layout
  return createPortal(modalContent, document.body);
}
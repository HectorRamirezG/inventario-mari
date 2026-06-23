import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LifeBuoy,
  MessageCircle,
  X,
  ChevronDown,
  Wallet,
  Truck,
  Receipt,
  HelpCircle,
  Sparkles,
} from "lucide-react"

import { useStoreInfo } from "../../lib/useStoreInfo"
import { cleanPhone } from "../../lib/format"
import { reopenOnboardingTour } from "./OnboardingTour"

/**
 * Centro de ayuda flotante para el cliente. Reemplaza al FAB de soporte
 * que abría ticket directo. Ahora:
 *  - Si el cliente tiene pedidos activos, ofrece opciones contextuales
 *    (status, pago, entrega).
 *  - Si no, redirige a WhatsApp del negocio sin abrir un ticket inútil
 *    (no hay sale_id que asociar).
 *  - Si quiere abrir ticket, el callback `onOpenSupport` lo conecta al
 *    SupportModal con saleId del pedido más reciente con ventana abierta.
 */

interface FaqEntry {
  q: string
  a: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const FAQ: FaqEntry[] = [
  {
    q: "¿Cómo abono a mi apartado?",
    a: "Abre el pedido → toca 'Pagar saldo' → elige depósito o transferencia → sube el comprobante. Mari lo valida y tu saldo baja al instante.",
    icon: Wallet,
  },
  {
    q: "¿Cuándo me entregan?",
    a: "En tu pedido, el stepper te muestra: Preparando → En camino → Entregado. Cuando el repartidor sale, te llega notificación.",
    icon: Truck,
  },
  {
    q: "¿Dónde está mi ticket?",
    a: "Cada pedido tiene su botón 'Ticket'. También llega por WhatsApp al apartar. Lo puedes compartir como link sin importar dónde estés.",
    icon: Receipt,
  },
  {
    q: "¿Cuánto tiempo tengo para apartar?",
    a: "Tu apartado vive 30 días. Entre más rápido liquides, antes liberas el producto.",
    icon: HelpCircle,
  },
]

interface Props {
  open: boolean
  onClose: () => void
  /** Sale al que asociar el ticket (más reciente con canClaim). */
  contextualSaleId?: string | null
  /** Llama al modal de support con el saleId. */
  onOpenSupport: (saleId: string | null) => void
}

export default function OrderHelpCenter({
  open,
  onClose,
  contextualSaleId,
  onOpenSupport,
}: Props) {
  const store = useStoreInfo()
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const waUrl = store.phone
    ? `https://wa.me/${cleanPhone(store.phone)}?text=${encodeURIComponent(
        "Hola, necesito ayuda con mi pedido.",
      )}`
    : null

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/50"
          />
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border-t border-slate-200 dark:border-slate-700 sm:border shadow-2xl max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-bloom"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
                }}
              >
                <LifeBuoy size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black tracking-tight">¿En qué te ayudo?</p>
                <p className="text-[10px] text-slate-500 font-bold">
                  Mira las preguntas frecuentes primero
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center hover:bg-slate-200"
              >
                <X size={13} />
              </button>
            </div>

            {/* Cuerpo scrolleable */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-container-ios">
              {/* FAQ */}
              <div className="space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Preguntas frecuentes
                </p>
                {FAQ.map((entry, i) => {
                  const Icon = entry.icon
                  const open = expandedFaq === i
                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFaq(open ? null : i)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-100/60 dark:hover:bg-slate-700/40 transition-colors"
                      >
                        <Icon
                          size={14}
                          className={open ? "text-primary" : "text-slate-500"}
                        />
                        <p className="flex-1 text-[12px] font-black text-slate-800 dark:text-slate-100">
                          {entry.q}
                        </p>
                        <ChevronDown
                          size={13}
                          className={`text-slate-400 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 px-3 pb-3 leading-relaxed">
                              {entry.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>

              {/* Sigues con dudas? */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  ¿Sigues con dudas?
                </p>

                {/* Reabrir el tutorial guiado de la app. Útil para usuarios
                    nuevos que cerraron sin terminar o quieren refrescar. */}
                <button
                  type="button"
                  onClick={() => {
                    reopenOnboardingTour()
                    onClose()
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/15 text-sky-700 dark:text-sky-300 press-hard transition-colors"
                >
                  <Sparkles size={16} />
                  <div className="text-left flex-1">
                    <p className="text-[12px] font-black">Ver tutorial guiado</p>
                    <p className="text-[10px] font-bold opacity-75">
                      Te explico cada botón en 30 segundos
                    </p>
                  </div>
                </button>

                {contextualSaleId && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSupport(contextualSaleId)
                      onClose()
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary press-hard transition-colors"
                  >
                    <Receipt size={16} />
                    <div className="text-left flex-1">
                      <p className="text-[12px] font-black">Reportar mi pedido</p>
                      <p className="text-[10px] font-bold opacity-75">
                        Abre un ticket vinculado a tu pedido
                      </p>
                    </div>
                  </button>
                )}

                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white press-hard transition-colors"
                  >
                    <MessageCircle size={16} />
                    <div className="text-left flex-1">
                      <p className="text-[12px] font-black">
                        WhatsApp directo
                      </p>
                      <p className="text-[10px] font-bold opacity-90">
                        Te respondemos en horario de tienda
                      </p>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

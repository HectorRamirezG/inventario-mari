import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { HelpCircle, Send, MessageSquare, Loader2 } from "lucide-react"
import toast from "react-hot-toast"

import {
  createQuestion,
  listProductQuestions,
  type ProductQuestion,
} from "../../features/products/productQAService"
import { useAuth } from "../../lib/useAuth"

interface Props {
  productId: string
  productName: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function ProductQA({ productId, productName }: Props) {
  const { email, fullName } = useAuth()
  const [items, setItems] = useState<ProductQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setItems(await listProductQuestions(productId))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  async function submit() {
    if (!email) {
      toast.error("Inicia sesión para preguntar")
      return
    }
    if (text.trim().length < 3) return
    setBusy(true)
    try {
      await createQuestion({
        product_id: productId,
        customer_email: email,
        customer_name: fullName,
        question: text.trim(),
      })
      toast.success("Pregunta enviada — Mari te responde pronto")
      setText("")
      setOpen(false)
      load()
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo enviar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <MessageSquare size={12} className="text-primary" />
          Preguntas
          {items.length > 0 && (
            <span className="text-[9px] text-slate-400">({items.length})</span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-7 px-2.5 rounded-lg bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest flex items-center gap-1 press"
        >
          <HelpCircle size={11} /> Preguntar
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <textarea
                value={text}
                maxLength={500}
                onChange={(e) => setText(e.target.value)}
                placeholder={`¿Tienes alguna duda sobre ${productName}?`}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] outline-none focus:ring-2 focus:ring-primary/20 text-slate-900 dark:text-slate-100 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-400">
                  {text.length}/500 · Tu nombre aparecerá en la respuesta
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || text.trim().length < 3}
                  className="h-8 px-3 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-50 press"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  Enviar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-[10px] text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-[10px] text-slate-400 italic">
          Sé la primera en preguntar
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((q) => (
            <li
              key={q.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 text-[9px] font-black flex items-center justify-center">
                  {(q.customer_name?.[0] ?? q.customer_email[0]).toUpperCase()}
                </span>
                <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 truncate">
                  {q.customer_name ?? q.customer_email}
                </span>
                <span className="text-[9px] text-slate-400 tabular-nums">{timeAgo(q.created_at)}</span>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug">
                {q.question}
              </p>
              {q.answer && (
                <div className="mt-2 pl-3 border-l-2 border-primary/40">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-0.5">
                    Beauty's Me responde
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                    {q.answer}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

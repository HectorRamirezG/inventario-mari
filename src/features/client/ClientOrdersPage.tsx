import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Receipt, Clock, CheckCircle2, ArrowRight, Loader2 } from "lucide-react"

import { supabase } from "../../lib/supabase"
import { formatMoney, formatDate, shortId } from "../../lib/format"
import { useAuth } from "../../lib/useAuth"

interface MyOrder {
  id: string
  total: number
  paid: number
  balance: number
  status: string
  is_layaway: boolean
  created_at: string
  public_token: string | null
}

export default function ClientOrdersPage() {
  const { email } = useAuth()
  const [orders, setOrders] = useState<MyOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!email) return
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from("sales")
        .select("id,total,paid,balance,status,is_layaway,created_at,public_token")
        .eq("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(50)
      if (!alive) return
      setOrders((data as MyOrder[]) ?? [])
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [email])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" />
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <Receipt size={40} className="mx-auto text-slate-300 mb-3" />
        <p className="font-bold text-slate-600">Aún no tienes pedidos</p>
        <p className="text-xs text-slate-400 mt-1">
          Arma tu carrito desde el catálogo.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-24">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Mis pedidos</h1>
        <p className="text-sm text-slate-500">
          Aquí ves todos tus apartados y compras.
        </p>
      </div>
      {orders.map((o) => {
        const pct = o.total > 0 ? Math.min(100, (o.paid / o.total) * 100) : 0
        const paid = o.balance <= 0
        return (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-2xl p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">
                  Folio
                </p>
                <p className="text-sm font-black">{shortId(o.id)}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                  paid
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                {paid ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                {paid ? "Pagado" : "Pendiente"}
              </span>
            </div>
            <p className="text-xs text-slate-500">{formatDate(o.created_at)}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500">Total</span>
              <span className="text-base font-black">{formatMoney(o.total)}</span>
            </div>
            {!paid && (
              <>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: "linear-gradient(90deg,#e6007e,#a855f7)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px]">
                  <span className="text-slate-500">
                    Pagado {formatMoney(o.paid)}
                  </span>
                  <span className="font-black text-primary">
                    Falta {formatMoney(o.balance)}
                  </span>
                </div>
              </>
            )}
            <Link
              to={`/ticket/${o.public_token ?? o.id}`}
              className="mt-3 flex items-center justify-center gap-1 h-9 rounded-xl bg-slate-50 dark:bg-slate-700 text-xs font-black"
            >
              Ver ticket
              <ArrowRight size={12} />
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}

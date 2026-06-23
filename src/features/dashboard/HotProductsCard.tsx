import { useQuery } from "@tanstack/react-query"
import { Flame, Eye, Users as UsersIcon, ShoppingBag } from "lucide-react"

import SafeSection from "../../components/ui/SafeSection"
import { getHotProducts } from "./hotProductsService"

/**
 * Card que muestra los productos "calientes" — vistos repetidamente por
 * múltiples visitors en los últimos 7 días. Mari puede usarla para
 * priorizar publicaciones / stories / promos.
 *
 * Cache 5 min: este dato no cambia minuto a minuto.
 */
function HotProductsCardInner() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "hot-products", 7, 3],
    queryFn: () => getHotProducts(7, 3),
    staleTime: 5 * 60_000,
  })

  if (isLoading) return null
  if (!data || data.length === 0) return null

  return (
    <section className="rounded-3xl border border-orange-200/70 dark:border-orange-500/30 bg-gradient-to-br from-orange-50/80 to-rose-50/80 dark:from-orange-500/10 dark:to-rose-500/10 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 text-white flex items-center justify-center shadow-sm">
          <Flame size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[12px] font-black text-slate-900 dark:text-slate-100 leading-none">
            Productos calientes
          </h3>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
            Visto seguido por varias clientas · últimos 7 días
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {data.slice(0, 5).map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 bg-white/70 dark:bg-slate-900/40 rounded-2xl p-2 border border-orange-100 dark:border-orange-500/20"
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <ShoppingBag size={14} className="text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-black text-slate-800 dark:text-slate-100 truncate">
                {p.name}
              </p>
              <div className="flex items-center gap-3 mt-0.5 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <UsersIcon size={10} /> {p.visitorCount} clientas
                </span>
                <span className="flex items-center gap-1">
                  <Eye size={10} /> {p.totalViews} vistas
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {data.length > 5 && (
        <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 mt-2 text-center">
          + {data.length - 5} más
        </p>
      )}
    </section>
  )
}

export default function HotProductsCard() {
  return (
    <SafeSection scope="dashboard:hot-products">
      <HotProductsCardInner />
    </SafeSection>
  )
}

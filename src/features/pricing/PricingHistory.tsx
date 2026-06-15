import { RefreshCw, Search, Calendar, TrendingUp, Layers, Tag, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { usePricingHistory } from "./usePricingHistory";

const fmtDate = (dt: string) =>
  new Date(dt).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

import { formatMoney } from "../../lib/format";

const fmtMoney = (n: number | string | null | undefined) => formatMoney(n);

export default function PricingHistory() {
  const { q, setQ, filtered, loading, refresh } = usePricingHistory();

  return (
    <div className="flex flex-col gap-4 pb-44">

      {/* 1. SECCIÓN DE BÚSQUEDA Y TÍTULO (No fija) */}
      <div className="px-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2">
              <Clock size={14} className="text-primary" /> Historial Live
            </h2>
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">
              {filtered.length} registros encontrados
            </p>
          </div>

          <button
            onClick={refresh}
            className={`h-10 w-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-400 shadow-sm active:scale-90 transition-all ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Buscador Estilo Minimalista */}
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="BUSCAR PRODUCTO..."
            className="w-full h-12 pl-12 pr-6 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-sm focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>
      </div>

      {/* 2. LISTADO DE COTIZACIONES */}
      <div className="space-y-4">
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-40 w-full bg-white border border-slate-100 rounded-[2rem] animate-pulse" />
          ))
        ) : filtered.length > 0 ? (
          filtered.map((r) => {
            const aplicado = Number(r.price_applied || 0);
            const isHighMargin = Number(r.margin_percent) >= 20;

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={r.id}
                className="bg-white p-5 rounded-[2rem] border border-slate-50 shadow-sm relative overflow-hidden group"
              >
                {/* Indicador visual de margen */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isHighMargin ? 'bg-emerald-400' : 'bg-orange-400'}`} />

                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-[7px] font-black uppercase text-slate-400 mb-1">
                      <Calendar size={10} /> {fmtDate(r.created_at)}
                    </div>
                    <h3 className="font-black text-slate-900 italic text-lg truncate leading-tight uppercase tracking-tighter">
                      {r.product_name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[8px] font-black text-primary uppercase bg-primary/5 px-2 py-0.5 rounded-md border border-primary/10">
                        {r.variant_name || 'Estándar'}
                      </span>
                      <div className={`flex items-center gap-0.5 text-[8px] font-black px-2 py-0.5 rounded-md ${isHighMargin ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                        <TrendingUp size={10} /> {Number(r.margin_percent).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-[7px] font-black uppercase text-slate-300 tracking-widest leading-none mb-1">Aplicado</p>
                    <span className="text-xl font-black tabular-nums tracking-tighter text-slate-900 italic">
                      {fmtMoney(aplicado)}
                    </span>
                  </div>
                </div>

                {/* ESCALAS DE PRECIOS COMPACTAS */}
                <div className="pt-3 border-t border-slate-50">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'MENUDEO', val: r.price_menudeo || aplicado, color: 'text-slate-500' },
                      { label: 'MEDIO', val: r.price_medio, color: 'text-primary' },
                      { label: 'MAYOREO', val: r.price_mayoreo, color: 'text-violet-600' }
                    ].map((s, i) => (
                      <div key={i} className="bg-slate-50/50 rounded-xl p-2 text-center">
                        <p className="text-[6px] font-black text-slate-400 uppercase mb-0.5">{s.label}</p>
                        <p className={`text-[9px] font-black tabular-nums ${s.color}`}>{fmtMoney(s.val).replace('$', '')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="py-20 text-center opacity-30">
            <Tag className="mx-auto mb-2 text-slate-300" size={32} />
            <p className="text-[10px] font-black uppercase tracking-widest">Sin registros</p>
          </div>
        )}
      </div>
    </div>
  );
}
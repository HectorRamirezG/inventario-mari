import { useMemo } from "react";
import {
  Search,
  Calendar,
  Clock,
  RefreshCw,
  Tag,
  TrendingUp,
  Layers,
  Package,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";

import { usePricingHistory } from "./usePricingHistory";
import { formatMoney } from "../../lib/format";
import KpiCard from "../../components/ui/KpiCard";
import Skeleton from "../../components/ui/Skeleton";
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration";
import TabBar, { type TabItem } from "../../components/ui/TabBar";

const fmtDate = (dt: string) =>
  new Date(dt).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const dayKey = (dt: string) => {
  const d = new Date(dt);
  return d.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
};

const TIER_META: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  menudeo: {
    label: "Menudeo",
    cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  medio: {
    label: "Medio",
    cls: "bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  mayoreo: {
    label: "Mayoreo",
    cls: "bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300",
    dot: "bg-violet-500",
  },
};

export default function PricingHistory() {
  const {
    q,
    setQ,
    filtered,
    loading,
    refresh,
    range,
    setRange,
    tier,
    setTier,
  } = usePricingHistory();

  /* KPIs derivadas del listado actual */
  const kpis = useMemo(() => {
    let count = 0;
    let totalApplied = 0;
    let totalCost = 0;
    let marginSum = 0;
    const marginSeries: number[] = [];
    filtered.forEach((r) => {
      count += 1;
      const applied = Number(r.price_applied) || 0;
      const cost = Number(r.cost_unit) || 0;
      totalApplied += applied;
      totalCost += cost;
      marginSum += Number(r.margin_percent) || 0;
      marginSeries.push(Number(r.margin_percent) || 0);
    });
    const avgMargin = count ? marginSum / count : 0;
    const avgPrice = count ? totalApplied / count : 0;
    return {
      count,
      avgMargin,
      avgPrice,
      totalCost,
      marginSeries: marginSeries.slice(-14).reverse(),
    };
  }, [filtered]);

  /* Agrupado por día */
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    filtered.forEach((r) => {
      const k = dayKey(r.created_at);
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4 pb-44 px-2 max-w-2xl mx-auto">
      {/* HEADER sticky con backdrop-blur */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-4 pb-2 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between px-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Clock size={14} className="text-primary" /> Historial
            </h2>
            <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {filtered.length}{" "}
              {filtered.length === 1 ? "cotización" : "cotizaciones"}
            </p>
          </div>
          <button
            onClick={refresh}
            aria-label="Refrescar"
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center press"
            title="Refrescar"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-4 gap-2">
          <KpiCard
            label="Análisis"
            value={kpis.count}
            tone="primary"
            icon={<Layers size={9} />}
          />
          <KpiCard
            label="Margen prom."
            value={`${kpis.avgMargin.toFixed(0)}%`}
            tone={kpis.avgMargin >= 25 ? "success" : "warn"}
            icon={<TrendingUp size={9} />}
            sparkline={kpis.marginSeries}
          />
          <KpiCard
            label="Precio prom."
            value={formatMoney(kpis.avgPrice)}
            tone="default"
            icon={<Wallet size={9} />}
          />
          <KpiCard
            label="Costo total"
            value={formatMoney(kpis.totalCost)}
            tone="default"
            icon={<Package size={9} />}
          />
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            size={16}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="BUSCAR PRODUCTO..."
            className="w-full h-12 pl-12 pr-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 outline-none shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Filtro de rango temporal unificado */}
        <TabBar<"7" | "30" | "90">
          tabs={[
            { id: "7", label: "7 días" } as TabItem<"7" | "30" | "90">,
            { id: "30", label: "30 días" } as TabItem<"7" | "30" | "90">,
            { id: "90", label: "90 días" } as TabItem<"7" | "30" | "90">,
          ]}
          active={range as "7" | "30" | "90"}
          onChange={(id) => setRange(id as any)}
          layoutId="pricing-range-tab"
        />

        {/* Filtro de tier unificado */}
        <TabBar<"all" | "menudeo" | "medio" | "mayoreo">
          tabs={[
            { id: "all", label: "Todos" } as TabItem<"all" | "menudeo" | "medio" | "mayoreo">,
            { id: "menudeo", label: "Menudeo" } as TabItem<"all" | "menudeo" | "medio" | "mayoreo">,
            { id: "medio", label: "Medio" } as TabItem<"all" | "menudeo" | "medio" | "mayoreo">,
            { id: "mayoreo", label: "Mayoreo" } as TabItem<"all" | "menudeo" | "medio" | "mayoreo">,
          ]}
          active={tier as "all" | "menudeo" | "medio" | "mayoreo"}
          onChange={(id) => setTier(id as any)}
          layoutId="pricing-tier-tab"
        />
      </div>

      {/* LISTADO */}
      <div className="space-y-5">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" rounded="xl" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyStateIllustration
            variant="no-orders"
            title="Sin cotizaciones"
            subtitle={
              q
                ? "No encontramos coincidencias con tu búsqueda"
                : "Cuando uses la calculadora, cada análisis se guarda aquí"
            }
          />
        ) : (
          grouped.map(([day, rows]) => (
            <section key={day}>
              <div className="sticky top-0 z-10 -mx-2 px-3 py-1.5 mb-2 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-md flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {day}
                </span>
                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500">
                  · {rows.length}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-slate-200 dark:from-slate-700 to-transparent" />
              </div>

              <div className="space-y-3">
                {rows.map((r, index) => {
                  const applied = Number(r.price_applied) || 0;
                  const cost = Number(r.cost_unit) || 0;
                  const marginPct = Number(r.margin_percent) || 0;
                  const isHighMargin = marginPct >= 25;
                  const isLowMargin = marginPct < 10;
                  const tierMeta =
                    TIER_META[r.tier as string] ?? TIER_META.menudeo;

                  return (
                    <motion.div
                      key={r.id ?? `${index}-${r.created_at}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.2) }}
                      className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden hover:shadow-md hover:border-primary/30 dark:hover:border-primary/40 transition-all"
                    >
                      {/* Barra lateral de color por margen */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 ${
                          isHighMargin
                            ? "bg-emerald-400"
                            : isLowMargin
                            ? "bg-rose-400"
                            : "bg-amber-400"
                        }`}
                      />

                      <div className="flex items-start gap-3 mb-3 pl-2">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Tag size={14} className="text-primary" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 mb-0.5">
                            <Calendar size={9} /> {fmtDate(r.created_at)}
                          </div>
                          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate leading-tight">
                            {r.product_name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md uppercase tracking-widest">
                              {r.variant_name || "Estándar"}
                            </span>
                            <span
                              className={`flex items-center gap-1 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${tierMeta.cls}`}
                            >
                              <span
                                className={`w-1 h-1 rounded-full ${tierMeta.dot}`}
                              />
                              {tierMeta.label}
                            </span>
                            <span
                              className={`flex items-center gap-1 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest ${
                                isHighMargin
                                  ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                                  : isLowMargin
                                  ? "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300"
                                  : "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300"
                              }`}
                            >
                              <TrendingUp size={9} />
                              {marginPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-[7px] font-black uppercase text-slate-400 dark:text-slate-500 mb-0.5 tracking-widest">
                            Aplicado
                          </p>
                          <span className="text-lg font-black tabular-nums text-slate-900 dark:text-slate-100">
                            {formatMoney(applied)}
                          </span>
                          {cost > 0 && (
                            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">
                              costo {formatMoney(cost)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Escalas de precio compactas */}
                      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
                        {[
                          {
                            label: "Menudeo",
                            val: Number(r.price_menudeo) || applied,
                            cls: "text-slate-600 dark:text-slate-300",
                          },
                          {
                            label: "Medio",
                            val: Number(r.price_medio) || 0,
                            cls: "text-primary",
                          },
                          {
                            label: "Mayoreo",
                            val: Number(r.price_mayoreo) || 0,
                            cls: "text-violet-600 dark:text-violet-400",
                          },
                        ].map((s, i) => (
                          <div
                            key={i}
                            className={`rounded-xl p-2 text-center ${
                              s.label.toLowerCase() === r.tier
                                ? "bg-primary/5 ring-1 ring-primary/20"
                                : "bg-slate-50 dark:bg-slate-800/60"
                            }`}
                          >
                            <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
                              {s.label}
                            </p>
                            <p
                              className={`text-[10px] font-black tabular-nums ${s.cls}`}
                            >
                              {formatMoney(s.val)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

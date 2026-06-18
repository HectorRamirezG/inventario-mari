import { useMemo } from "react";
import { Search, Calendar, User, Clock, ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useMovementHistoryPage } from "./useMovementHistoryPage";
import PaymentModal from "../apartados/PaymentModal";
import { addPayment } from "../apartados/apartadosService";
import { sound } from "../../lib/sound";
import toast from "react-hot-toast";
import { formatMoney as fmtMoney } from "../../lib/format";
import KpiCard from "../../components/ui/KpiCard";
import Avatar from "../../components/ui/Avatar";
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration";
import { MovementCardSkeleton } from "../../components/ui/Skeletons";
import PageHeader from "../../components/ui/PageHeader";

const fmtDate = (dt: string) =>
  new Date(dt).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const dayKey = (dt: string) => {
  const d = new Date(dt);
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" });
};

export default function MovementHistoryPage() {
  const {
    type, setType, q, setQ, filtered, loading,
    selectedSale, setSelectedSale,
  } = useMovementHistoryPage();

  // KPIs derivadas del listado actual
  const kpis = useMemo(() => {
    let entradas = 0, ventas = 0, cobrado = 0, pendiente = 0;
    const ventasSeries: number[] = [];
    filtered.forEach((r) => {
      if (r.type === "entrada" || !r.sale_id) {
        entradas += Number(r.total_items) || 0;
      } else {
        ventas += 1;
        cobrado += Number(r.paid) || 0;
        pendiente += Number(r.balance) || 0;
        ventasSeries.push(Number(r.total) || 0);
      }
    });
    return { entradas, ventas, cobrado, pendiente, ventasSeries: ventasSeries.slice(-14).reverse() };
  }, [filtered]);

  // Agrupado por día
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

  // Adapter para PaymentModal
  const saleForModal = selectedSale
    ? {
        id: selectedSale.sale_id ?? selectedSale.id,
        customer_name: selectedSale.customer ?? selectedSale.customer_name ?? null,
        customer_phone: selectedSale.customer_phone ?? null,
        total: Number(selectedSale.total) || 0,
        paid: Number(selectedSale.paid) || 0,
        balance: Number(selectedSale.balance) || 0,
        status: selectedSale.status ?? "pending",
        is_layaway: !!selectedSale.is_layaway,
        created_at: selectedSale.created_at ?? new Date().toISOString(),
      } as any
    : null;

  async function handlePay(saleId: string, amount: number, method: string) {
    const tid = toast.loading("Registrando abono...");
    try {
      await addPayment(saleId, amount, method);
      sound.success();
      toast.success("Abono registrado", { id: tid });
      setSelectedSale(null);
      window.dispatchEvent(new CustomEvent("mari:apartado-refresh"));
      return true;
    } catch (e: any) {
      sound.error();
      toast.error(e?.message ?? "Error al abonar", { id: tid });
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-44 px-2 max-w-2xl mx-auto">
      {/* HEADER sticky con backdrop-blur */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-4 pb-2 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl space-y-3">
        <PageHeader
          icon={Clock}
          title="Historial"
          subtitle={`${filtered.length} ${filtered.length === 1 ? "movimiento" : "movimientos"}`}
          right={
            <button
              onClick={() => window.location.reload()}
              aria-label="Refrescar"
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center press"
              title="Refrescar"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          }
          noDivider
        />

        {/* KPI STRIP */}
        <div className="grid grid-cols-4 gap-2">
          <KpiCard
            label="Entradas"
            value={kpis.entradas}
            tone="success"
            icon={<ArrowDownToLine size={9} />}
          />
          <KpiCard
            label="Ventas"
            value={kpis.ventas}
            tone="primary"
            icon={<ArrowUpFromLine size={9} />}
            sparkline={kpis.ventasSeries}
          />
          <KpiCard
            label="Cobrado"
            value={fmtMoney(kpis.cobrado)}
            tone="default"
            icon={<Wallet size={9} />}
          />
          <KpiCard
            label="Pendiente"
            value={fmtMoney(kpis.pendiente)}
            tone={kpis.pendiente > 0 ? "danger" : "default"}
            icon={<TrendingUp size={9} />}
          />
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="BUSCAR CLIENTE O PRODUCTO..."
            className="w-full h-12 pl-12 pr-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100 outline-none shadow-sm focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Filtros */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800/60 rounded-2xl gap-1 border border-slate-200/60 dark:border-slate-700/60">
          <FilterBtn active={type === "all"} onClick={() => setType("all")} label="Todos" />
          <FilterBtn active={type === "entrada"} onClick={() => setType("entrada")} label="Stock" />
          <FilterBtn active={type === "venta"} onClick={() => setType("venta")} label="Ventas" />
        </div>
      </div>

      {/* LISTADO */}
      <div className="space-y-5">
        {loading ? (
          <MovementCardSkeleton count={5} />
        ) : filtered.length === 0 ? (
          <EmptyStateIllustration
            variant="no-orders"
            title="Sin movimientos"
            subtitle={
              q
                ? "No encontramos coincidencias con tu búsqueda"
                : type === "entrada"
                ? "Aún no se han registrado entradas de stock"
                : type === "venta"
                ? "Aún no hay ventas que mostrar"
                : "Cuando hagas tu primera venta o registres stock aparecerá aquí"
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
                  const isEntrada = r.type === "entrada" || !r.sale_id;
                  const isPending = !isEntrada && Number(r.balance) > 0;

                  return (
                    <motion.div
                      key={`${r.sale_id || "ent"}-${index}-${r.created_at}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.2) }}
                      className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden hover:shadow-md hover:border-primary/30 dark:hover:border-primary/40 transition-all"
                    >
                      {/* Barra lateral de color */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 ${
                          isEntrada ? "bg-emerald-400" : isPending ? "bg-rose-400" : "bg-slate-300 dark:bg-slate-600"
                        }`}
                      />

                      <div className="flex justify-between items-start gap-3 mb-3 pl-2">
                        <div className="flex-1 min-w-0 flex items-start gap-2.5">
                          {!isEntrada ? (
                            <Avatar name={r.customer || "Mostrador"} size={36} />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                              <ArrowDownToLine size={14} className="text-emerald-600 dark:text-emerald-400" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 mb-0.5">
                              <Calendar size={9} /> {fmtDate(r.created_at)}
                            </div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate leading-tight">
                              {r.total_items > 1
                                ? `${r.total_items} productos`
                                : r.items?.[0]?.name || "Movimiento"}
                            </h3>
                            {r.sale_id && (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 dark:text-slate-400">
                                  <User size={9} /> {r.customer || "Mostrador"}
                                </div>
                                <span
                                  className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${
                                    isPending
                                      ? "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300"
                                      : "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                                  }`}
                                >
                                  {isPending ? "Pendiente" : "Pagado"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-[7px] font-black uppercase text-slate-400 dark:text-slate-500 mb-0.5 tracking-widest">
                            {isEntrada ? "Entrada" : "Total"}
                          </p>
                          <span
                            className={`text-lg font-black tabular-nums ${
                              isEntrada ? "text-emerald-500 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {isEntrada ? `+${r.total_items}` : fmtMoney(r.total)}
                          </span>
                          {!isEntrada && Number(r.paid) > 0 && Number(r.paid) < Number(r.total) && (
                            <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {fmtMoney(r.paid)} cobrado
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Items mini-list */}
                      {r.items && r.items.length > 0 && (
                        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                          {r.items.slice(0, 3).map((item: any, i: number) => (
                            <div
                              key={i}
                              className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg"
                            >
                              <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                                {item.name}
                              </span>
                              <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 shrink-0 ml-2">
                                ×{item.qty}
                              </span>
                            </div>
                          ))}
                          {r.items.length > 3 && (
                            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 px-3">
                              + {r.items.length - 3} más
                            </p>
                          )}
                        </div>
                      )}

                      {isPending && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                          <button
                            onClick={() => setSelectedSale(r)}
                            className="text-[10px] font-black bg-primary text-white px-4 py-2 rounded-xl shadow-bloom press-hard uppercase tracking-widest"
                          >
                            Abonar {fmtMoney(r.balance)}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <PaymentModal
        open={!!selectedSale}
        sale={saleForModal}
        onClose={() => setSelectedSale(null)}
        onPay={handlePay}
      />
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-9 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
        active
          ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

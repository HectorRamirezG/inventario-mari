import { Search, Calendar, User, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useMovementHistoryPage } from "./useMovementHistoryPage";
import PaymentModal from "../apartados/PaymentModal";
import { addPayment } from "../apartados/apartadosService";
import { sound } from "../../lib/sound";
import toast from "react-hot-toast";

const fmtDate = (dt: string) =>
  new Date(dt).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

import { formatMoney as fmtMoney } from "../../lib/format";

export default function MovementHistoryPage() {
  const {
    type, setType, q, setQ, filtered, loading,
    selectedSale, setSelectedSale,
  } = useMovementHistoryPage();

  // Adaptamos el row del historial al shape `Sale` que usa PaymentModal.
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
      toast.success("Abono registrado 💖", { id: tid });
      // refresca el listado disparando un cambio en el filtro
      setSelectedSale(null);
      // Aviso global por si otras vistas se quieren refrescar
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
      {/* HEADER & SEARCH */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between px-2">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <Clock size={14} className="text-primary" /> Historial
            </h2>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
              {filtered.length} movimientos
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="BUSCAR..."
            className="w-full h-12 pl-12 pr-6 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none shadow-sm focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>

        <div className="flex p-1 bg-slate-50 rounded-xl gap-1 border border-slate-100">
          <FilterBtn active={type === "all"} onClick={() => setType("all")} label="Todos" />
          <FilterBtn active={type === "entrada"} onClick={() => setType("entrada")} label="Stock" />
          <FilterBtn active={type === "venta"} onClick={() => setType("venta")} label="Ventas" />
        </div>
      </div>

      {/* LISTADO */}
      <div className="space-y-4">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white border border-slate-100 rounded-[2rem] animate-pulse" />
          ))
        ) : (
          filtered.map((r, index) => {
            const isEntrada = r.type === "entrada";
            const isPending = Number(r.balance) > 0;

            return (
              <motion.div
                key={`${r.sale_id || "ent"}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                  isEntrada ? "bg-emerald-400" : isPending ? "bg-rose-400" : "bg-slate-300"
                }`} />

                <div className="flex justify-between items-start gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-[8px] font-black uppercase text-slate-400 mb-1">
                      <Calendar size={10} /> {fmtDate(r.created_at)}
                    </div>
                    <h3 className="text-lg font-black text-slate-900 truncate leading-tight uppercase tracking-tight">
                      {r.total_items > 1 ? `${r.total_items} productos` : (r.items?.[0]?.name || "Movimiento")}
                    </h3>
                    {r.sale_id && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1 text-[9px] font-black text-slate-500 uppercase">
                          <User size={10} /> {r.customer || "Mostrador"}
                        </div>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-md ${
                          isPending ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                        }`}>
                          {isPending ? "Pendiente" : "Pagado"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-[7px] font-black uppercase text-slate-300 mb-1">
                      {isEntrada ? "Entrada" : "Total"}
                    </p>
                    <span className={`text-xl font-black tabular-nums ${isEntrada ? "text-emerald-500" : "text-slate-900"}`}>
                      {isEntrada ? `+${r.total_items}` : fmtMoney(r.total)}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-50 space-y-2">
                  {r.items?.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center bg-slate-50/60 px-3 py-1.5 rounded-xl">
                      <span className="text-[11px] text-slate-600 truncate">{item.name}</span>
                      <span className="text-[11px] font-black text-slate-900">×{item.qty}</span>
                    </div>
                  ))}
                </div>

                {isPending && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                    <button
                      onClick={() => setSelectedSale(r)}
                      className="text-[10px] font-black bg-primary text-white px-5 py-2.5 rounded-xl shadow-bloom active:scale-95 transition-all"
                    >
                      Abonar {fmtMoney(r.balance)}
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })
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

function FilterBtn({ active, onClick, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-10 rounded-xl text-[10px] font-black uppercase transition-all ${
        active ? "bg-white text-primary shadow-sm" : "text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}
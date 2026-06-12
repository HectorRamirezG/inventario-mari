import { motion, AnimatePresence } from "framer-motion";
import { User, X, DollarSign } from "lucide-react";

export default function AbonoModal({
  selectedSale,
  setSelectedSale,
  montoAbono,
  setMontoAbono,
  isSavingAbono,
  ejecutarAbono,
  fmtMoney
}: any) {
  
  const nuevoSaldo = selectedSale 
    ? Number(selectedSale.balance) - Number(montoAbono || 0) 
    : 0;

  return (
    <AnimatePresence>
      {selectedSale && (
        <>
          <motion.div
            className="fixed inset-0 bg-slate-900/60 z-[60] backdrop-blur-sm"
            onClick={() => setSelectedSale(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="fixed bottom-0 inset-x-0 bg-white rounded-t-[3rem] z-[70] p-6 pb-12 shadow-2xl border-t border-slate-100"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="max-w-md mx-auto">
              <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-6" />

              <div className="flex items-center justify-between mb-8 px-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/5">
                    <User size={22} strokeWidth={2.5} />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] leading-none">Abono de Cliente</span>
                    <h4 className="text-sm font-black text-slate-800 uppercase truncate">
                      {selectedSale.customer || "Mostrador"}
                    </h4>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedSale(null)}
                  className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>

              {/* GRID DIVIDIDO: SALDO VS INPUT */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-rose-50/40 border border-rose-100/50 rounded-[2rem] p-5">
                  <span className="text-[8px] font-black uppercase text-rose-400 mb-1 block tracking-tighter">Deuda Actual</span>
                  <p className="text-xl font-black text-rose-500 tabular-nums italic leading-none">
                    {fmtMoney(selectedSale.balance)}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-5 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block tracking-tighter">Monto Abono</label>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-black text-sm">$</span>
                    <input
                      autoFocus
                      type="number"
                      inputMode="decimal"
                      value={montoAbono}
                      onChange={(e) => setMontoAbono(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent border-none p-0 text-xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {Number(montoAbono) > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 text-center bg-emerald-50/50 py-3 rounded-2xl border border-emerald-100"
                >
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                    Saldo final: <span className="text-lg ml-1 font-black">{fmtMoney(nuevoSaldo)}</span>
                  </p>
                </motion.div>
              )}

              <button
                onClick={ejecutarAbono}
                disabled={isSavingAbono || Number(montoAbono) <= 0 || nuevoSaldo < 0}
                className={`w-full h-16 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  isSavingAbono || Number(montoAbono) <= 0 || nuevoSaldo < 0
                  ? "bg-slate-100 text-slate-300 shadow-none" 
                  : "bg-slate-900 text-white shadow-slate-200"
                }`}
              >
                {isSavingAbono ? "REGISTRANDO..." : "Confirmar Abono"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
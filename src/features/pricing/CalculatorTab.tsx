import { Trash2, Plus, Calculator as CalcIcon, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";

interface CalculatorTabProps {
  products: any[];
  rows: any[];
  onAdd: () => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, data: any) => void;
  onSave: () => void;
  isSaving?: boolean;
}

const CalculatorTab = ({
  products,
  rows,
  onAdd,
  onRemove,
  onUpdate,
  onSave,
  isSaving
}: CalculatorTabProps) => {

  const money = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n || 0);

  return (
    <div className="flex flex-col gap-4 pb-44 px-1">

      {/* HEADER */}
      <div className="flex items-center justify-between px-2 mb-1">
        <div>
          <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2">
            <CalcIcon size={14} className="text-primary" /> Análisis Activo
          </h2>
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">
            {rows.length} {rows.length === 1 ? "línea" : "líneas"} en curso
          </p>
        </div>

        <button
          onClick={onAdd}
          className="h-10 px-4 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-90 transition-all"
        >
          <Plus size={14} strokeWidth={3} /> Añadir Producto
        </button>
      </div>

      {/* LISTADO */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {rows.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem]"
            >
              <Plus className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="text-[10px] font-black uppercase tracking-widest">
                Presiona "Añadir" para comenzar
              </p>
            </motion.div>
          ) : (
            rows.map((r) => {
              const product = products.find(p => p.id === r.productId);

              return (
                <motion.div
                  key={r.key}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 relative overflow-hidden"
                >

                  {/* DELETE */}
                  <button
                    onClick={() => onRemove(r.key)}
                    className="absolute right-4 top-4 p-2 text-slate-300 hover:text-rose-500 active:scale-90 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>

                  {/* PRODUCTO + CANTIDAD */}
                  <div className="flex flex-col gap-1.5 mb-4 pr-8">
                    <span className="text-[8px] font-black text-slate-400 uppercase ml-1 italic">
                      Producto a analizar
                    </span>

                    <div className="flex gap-2">
                      <select
                        className="flex-1 h-11 px-4 rounded-2xl bg-slate-50 border-none text-[11px] font-black text-slate-700 uppercase outline-none shadow-inner"
                        value={r.productId}
                        onChange={(e) =>
                          onUpdate(r.key, {
                            productId: e.target.value,
                            variantId: ""
                          })
                        }
                      >
                        <option value="">Seleccionar...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>

                      <div className="w-16">
                        <Input
                          type="number"
                          placeholder="Cant"
                          className="h-11 font-black text-center rounded-2xl bg-slate-50 border-none text-xs shadow-inner"
                          value={r.quantity}
                          onChange={(e) =>
                            onUpdate(r.key, { quantity: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* 🔥 VARIANTES FUNCIONANDO */}
                  {product?.variants?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto mb-4">
                      {product.variants.map((v: any) => {
                        const active = r.variantId === v.id;

                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() =>
                              onUpdate(r.key, { variantId: v.id })
                            }
                            className={`px-3 h-9 rounded-xl text-[9px] font-black uppercase whitespace-nowrap transition-all ${
                              active
                                ? "bg-primary text-white shadow-sm"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {v.name || v.variant_name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* COSTOS */}
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1 space-y-1">
                      <span className="text-[7px] font-black text-blue-400 uppercase ml-1 italic">
                        Gasto Extra Manual
                      </span>

                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full h-10 px-3 font-black text-[11px] rounded-xl bg-blue-50 border border-blue-100 text-blue-600 outline-none"
                        value={r.manualExtraCost || ""}
                        onChange={(e) =>
                          onUpdate(r.key, {
                            manualExtraCost: e.target.value
                          })
                        }
                      />
                    </div>

                    <div className="flex-[1.2] space-y-1">
                      <span className="text-[7px] font-black text-slate-400 uppercase ml-1 italic">
                        Costo Operativo
                      </span>

                      <div className="h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xs font-black">
                        {money(r.totalOperatingCost)}
                      </div>
                    </div>
                  </div>

                  {/* PRECIOS */}
                  <div className="bg-slate-50/50 rounded-[1.5rem] p-4 border border-slate-100">
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {(["menudeo", "medio", "mayoreo"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            onUpdate(r.key, {
                              manualPrice: Math.round(
                                r.suggestedPrices?.[t]
                              )
                            })
                          }
                          className={`py-2 rounded-xl shadow-sm text-center border ${
                            r.tierApplied === t
                              ? "bg-primary text-white"
                              : "bg-white"
                          }`}
                        >
                          <p className="text-[6px] font-black uppercase opacity-50">
                            {t}
                          </p>
                          <p className="text-[10px] font-black">
                            {money(r.suggestedPrices?.[t]).replace("$", "")}
                          </p>
                        </button>
                      ))}
                    </div>

                    <Input
                      type="number"
                      placeholder="Precio Final"
                      className="h-14 text-center font-black text-xl rounded-2xl"
                      value={r.manualPrice || ""}
                      onChange={(e) =>
                        onUpdate(r.key, {
                          manualPrice: e.target.value
                        })
                      }
                    />
                  </div>

                  {/* FOOTER */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                    <div>
                      <span className="text-[7px] text-slate-400 uppercase">
                        Margen
                      </span>
                      <p className="font-black">
                        {r.realMarginPercent?.toFixed(1)}%
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[7px] text-slate-400 uppercase">
                        Total
                      </span>
                      <p className="text-xl font-black">
                        {money(
                          (Number(r.manualPrice) || r.finalPrice || 0) *
                            (r.quantity || 0)
                        )}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* 🔥 SAVE INTEGRADO */}
{rows.length > 0 && (
  <div className="pt-2 pb-2">
    <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm flex items-center justify-between">

      {/* INFO */}
      <div className="flex flex-col">
        <span className="text-[9px] text-slate-400 uppercase">
          Análisis
        </span>
        <p className="text-sm font-black">
          {rows.length} {rows.length === 1 ? "producto" : "productos"}
        </p>
      </div>

      {/* BOTÓN */}
      <Button
        onClick={onSave}
        disabled={isSaving}
        className="h-10 px-4 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center gap-2"
      >
        {isSaving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          "Guardar"
        )}
      </Button>

    </div>
  </div>
)}

    </div>
  );
};

export default CalculatorTab;
import {
  Trash2,
  Plus,
  Calculator as CalcIcon,
  Loader2,
  Package,
  TrendingUp,
  Save,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import Button from "../../components/ui/Button";
import { formatMoney } from "../../lib/format";

interface CalculatorTabProps {
  products: any[];
  rows: any[];
  onAdd: () => void;
  onRemove: (key: string) => void;
  onUpdate: (key: string, data: any) => void;
  onSave: () => void;
  isSaving?: boolean;
}

type Tier = "menudeo" | "medio" | "mayoreo";

const TIER_LABEL: Record<Tier, string> = {
  menudeo: "Menudeo",
  medio: "Medio",
  mayoreo: "Mayoreo",
};

/** Color del % según rentabilidad */
function marginColor(pct: number): string {
  if (pct >= 30) return "text-emerald-500";
  if (pct >= 20) return "text-primary";
  return "text-orange-500";
}

/** Background suave de la card del tier según rentabilidad */
function marginBg(pct: number, active: boolean): string {
  if (active) return "bg-primary text-white border-primary shadow-bloom";
  if (pct >= 30)
    return "bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200/60";
  if (pct >= 20)
    return "bg-pink-50/60 dark:bg-pink-500/10 border-pink-200/60";
  return "bg-orange-50/60 dark:bg-orange-500/10 border-orange-200/60";
}

const CalculatorTab = ({
  products,
  rows,
  onAdd,
  onRemove,
  onUpdate,
  onSave,
  isSaving,
}: CalculatorTabProps) => {
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
          <Plus size={14} strokeWidth={3} /> Añadir
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
              <CalcIcon className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Toca "Añadir" para comenzar tu análisis
              </p>
            </motion.div>
          ) : (
            rows.map((r) => {
              const product = products.find((p) => p.id === r.productId);
              const variant = product?.variants?.find(
                (v: any) => v.id === r.variantId
              );

              const cost = Number(r.totalOperatingCost) || 0;
              const extra = Number(r.manualExtraCost) || 0;
              const suggested = r.suggestedPrices ?? {
                menudeo: 0,
                medio: 0,
                mayoreo: 0,
              };

              // Cálculo en tiempo real de cada tier (precio + margen + ganancia)
              const tierData = (["menudeo", "medio", "mayoreo"] as Tier[]).map(
                (t) => {
                  const price = Number(suggested[t]) || 0;
                  const profit = price - cost - extra;
                  const margin = price > 0 ? (profit / price) * 100 : 0;
                  return { tier: t, price, profit, margin };
                }
              );

              return (
                <motion.div
                  key={r.key}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-100 relative"
                >
                  {/* DELETE */}
                  <button
                    onClick={() => onRemove(r.key)}
                    className="absolute right-4 top-4 p-2 text-slate-300 hover:text-rose-500 active:scale-90 transition-all z-10"
                    aria-label="Quitar"
                  >
                    <Trash2 size={18} />
                  </button>

                  {/* PRODUCTO + CANTIDAD */}
                  <div className="flex flex-col gap-1.5 mb-3 pr-8">
                    <span className="text-[8px] font-black text-slate-400 uppercase ml-1 italic flex items-center gap-1">
                      <Package size={9} /> Producto a analizar
                    </span>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 h-11 px-4 rounded-2xl bg-slate-50 border-none text-[11px] font-black text-slate-700 uppercase outline-none shadow-inner"
                        value={r.productId}
                        onChange={(e) =>
                          onUpdate(r.key, {
                            productId: e.target.value,
                            variantId: "",
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
                      <input
                        type="number"
                        placeholder="Cant"
                        min={1}
                        className="w-16 h-11 font-black text-center rounded-2xl bg-slate-50 border-none text-xs shadow-inner tabular-nums outline-none"
                        value={r.quantity}
                        onChange={(e) =>
                          onUpdate(r.key, { quantity: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* VARIANTES (LayoutGroup → indicador animado entre chips) */}
                  {product?.variants?.length > 0 && (
                    <LayoutGroup id={`var-${r.key}`}>
                      <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1 -mx-1 px-1 scroll-container-ios">
                        {product.variants.map((v: any) => {
                          const active = r.variantId === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() =>
                                onUpdate(r.key, { variantId: v.id })
                              }
                              className={`relative px-3 h-8 rounded-full text-[9px] font-black uppercase whitespace-nowrap transition-colors ${
                                active
                                  ? "text-white"
                                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                              }`}
                            >
                              {active && (
                                <motion.span
                                  layoutId={`var-pill-${r.key}`}
                                  className="absolute inset-0 rounded-full"
                                  style={{
                                    background:
                                      "linear-gradient(135deg,#e6007e,#a855f7)",
                                  }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 380,
                                    damping: 28,
                                  }}
                                />
                              )}
                              <span className="relative z-10">
                                {v.name || v.variant_name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </LayoutGroup>
                  )}

                  {/* COSTOS BASE — inline limpio sin bloque gris central */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="space-y-1">
                      <span className="text-[7px] font-black text-slate-400 uppercase ml-1 italic">
                        Costo base
                      </span>
                      <div className="h-10 px-3 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xs font-black tabular-nums">
                        {formatMoney(cost)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[7px] font-black text-blue-500 uppercase ml-1 italic">
                        + Gasto extra
                      </span>
                      <input
                        type="number"
                        placeholder="0.00"
                        min={0}
                        step="0.01"
                        className="w-full h-10 px-3 font-black text-[11px] text-center rounded-xl bg-blue-50 border border-blue-100 text-blue-600 outline-none tabular-nums"
                        value={r.manualExtraCost || ""}
                        onChange={(e) =>
                          onUpdate(r.key, {
                            manualExtraCost: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* 🔥 MATRIZ SIMULTÁNEA: 3 tiers lado a lado */}
                  <div className="mb-4">
                    <span className="text-[8px] font-black text-slate-400 uppercase ml-1 italic flex items-center gap-1 mb-2">
                      <TrendingUp size={9} /> Análisis simultáneo · toca uno
                      para fijar precio
                    </span>
                    <motion.div
                      layout
                      className="grid grid-cols-3 gap-2"
                      // Re-render para que la animación de elasticidad dispare
                      // cuando cambia el producto o variante
                      key={`${r.productId}-${r.variantId}-${cost}-${extra}`}
                    >
                      {tierData.map(({ tier, price, profit, margin }) => {
                        const active = r.tierApplied === tier;
                        return (
                          <motion.button
                            key={tier}
                            type="button"
                            layout
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              type: "spring",
                              stiffness: 320,
                              damping: 24,
                            }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() =>
                              onUpdate(r.key, {
                                manualPrice: Math.round(price * 100) / 100,
                                tierApplied: tier,
                              })
                            }
                            className={`relative rounded-2xl p-2.5 border-2 transition-colors text-left ${marginBg(
                              margin,
                              active
                            )}`}
                          >
                            <p
                              className={`text-[8px] font-black uppercase tracking-widest leading-none ${
                                active ? "text-white/85" : "text-slate-500"
                              }`}
                            >
                              {TIER_LABEL[tier]}
                            </p>
                            <p
                              className={`text-base font-black tabular-nums leading-tight mt-1 ${
                                active ? "text-white" : "text-slate-900"
                              }`}
                            >
                              {formatMoney(price)}
                            </p>
                            <div
                              className={`flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t ${
                                active
                                  ? "border-white/25"
                                  : "border-slate-200/60"
                              }`}
                            >
                              <span
                                className={`text-[9px] font-black tabular-nums ${
                                  active ? "text-white" : marginColor(margin)
                                }`}
                              >
                                {margin.toFixed(1)}%
                              </span>
                              <span
                                className={`text-[9px] font-bold tabular-nums ${
                                  active
                                    ? "text-white/90"
                                    : profit >= 0
                                    ? "text-slate-700"
                                    : "text-rose-500"
                                }`}
                              >
                                {profit >= 0 ? "+" : ""}
                                {formatMoney(profit)}
                              </span>
                            </div>
                            {active && (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"
                              >
                                <Sparkles size={10} />
                              </motion.span>
                            )}
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  </div>

                  {/* PRECIO FINAL EDITABLE */}
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase ml-1 italic">
                      Precio final que aplicarás
                    </span>
                    <input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      className="w-full h-14 text-center font-black text-xl rounded-2xl bg-slate-50 border-2 border-primary/20 focus:border-primary outline-none tabular-nums"
                      value={r.manualPrice ?? ""}
                      onChange={(e) =>
                        onUpdate(r.key, { manualPrice: e.target.value })
                      }
                    />
                  </div>

                  {/* FOOTER: resumen con cantidad */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                    <div className="text-left">
                      <span className="text-[7px] text-slate-400 uppercase font-black">
                        {variant?.variant_name ?? "—"} · {r.quantity || 0} pz
                      </span>
                      <p
                        className={`font-black text-sm ${marginColor(
                          r.realMarginPercent || 0
                        )}`}
                      >
                        Margen final: {(r.realMarginPercent ?? 0).toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[7px] text-slate-400 uppercase font-black">
                        Total línea
                      </span>
                      <p className="text-xl font-black tabular-nums">
                        {formatMoney(
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

      {/* SAVE — botón principal que ACTUALIZA la BD */}
      {rows.length > 0 && (
        <div className="pt-2 pb-2 space-y-2">
          <div className="bg-gradient-to-r from-primary/10 via-pink-50 to-purple-50 dark:from-primary/20 dark:via-pink-500/10 dark:to-purple-500/10 border border-primary/20 rounded-2xl p-3 flex items-start gap-2">
            <Sparkles size={14} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-snug">
              Al guardar, los tres precios (menudeo / medio / mayoreo) se{" "}
              <span className="text-primary font-black">
                aplicarán directamente
              </span>{" "}
              a la variante seleccionada. Si no eliges variante, se aplican a
              todas las del producto.
            </p>
          </div>

          <Button
            onClick={onSave}
            disabled={isSaving}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary to-purple-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-[0.98] disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Aplicando precios...
              </>
            ) : (
              <>
                <Save size={14} />
                Guardar y Aplicar Precios
                <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-[9px]">
                  {rows.length} {rows.length === 1 ? "producto" : "productos"}
                </span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default CalculatorTab;

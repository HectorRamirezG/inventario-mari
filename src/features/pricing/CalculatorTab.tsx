import {
  Trash2,
  Plus,
  Loader2,
  Package,
  Save,
  Sparkles,
  ArrowRight,
  Layers,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  medio: "Medio mayoreo",
  mayoreo: "Mayoreo",
};

function marginColor(pct: number): string {
  if (pct >= 30) return "text-emerald-600";
  if (pct >= 20) return "text-primary";
  if (pct > 0) return "text-amber-600";
  return "text-rose-500";
}

function deltaPill(curr: number, next: number) {
  if (curr <= 0) {
    return {
      txt: "Nuevo",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10",
    };
  }
  const diff = next - curr;
  if (diff === 0)
    return { txt: "Sin cambio", cls: "bg-slate-100 text-slate-500" };
  const pct = (diff / curr) * 100;
  const sign = diff > 0 ? "+" : "";
  return {
    txt: `${sign}${pct.toFixed(0)}%`,
    cls:
      diff > 0
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10"
        : "bg-rose-50 text-rose-600 dark:bg-rose-500/10",
  };
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
  const validCount = rows.filter((r) => r.productId).length;

  return (
    <div className="flex flex-col gap-4 pb-44 px-1">
      <div className="bg-gradient-to-br from-primary/10 via-pink-50 to-purple-50 dark:from-primary/20 dark:via-pink-500/10 dark:to-purple-500/10 border border-primary/20 rounded-3xl p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-bloom shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
            }}
          >
            <Zap size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase tracking-tighter">
              Motor de precios
            </h2>
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-snug mt-0.5">
              Calcula y <span className="text-primary font-black">aplica</span>{" "}
              los 3 precios (menudeo / medio / mayoreo) directo a las variantes
              en la base de datos.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
          {rows.length} {rows.length === 1 ? "producto" : "productos"} en la
          mesa
        </p>
        <button
          onClick={onAdd}
          className="h-9 px-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 active:scale-90 transition-all"
        >
          <Plus size={12} strokeWidth={3} /> Agregar producto
        </button>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            rows.map((r) => (
              <PriceRow
                key={r.key}
                r={r}
                products={products}
                onRemove={onRemove}
                onUpdate={onUpdate}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {rows.length > 0 && (
        <div className="sticky bottom-2 pt-2 z-10">
          <Button
            onClick={onSave}
            disabled={isSaving || validCount === 0}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-primary via-pink-600 to-purple-600 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom active:scale-[0.98] disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Aplicando precios a la BD...
              </>
            ) : (
              <>
                <Save size={14} />
                Aplicar precios a las variantes
                <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-[9px]">
                  {validCount} {validCount === 1 ? "fila" : "filas"}
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

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2rem]"
    >
      <Package className="mx-auto mb-2 text-slate-300" size={32} />
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Toca "Agregar producto" para fijar precios
      </p>
    </motion.div>
  );
}

function PriceRow({
  r,
  products,
  onRemove,
  onUpdate,
}: {
  r: any;
  products: any[];
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: any) => void;
}) {
  const product = products.find((p) => p.id === r.productId);
  const variants: any[] = product?.variants ?? [];
  const variant = variants.find((v) => v.id === r.variantId) ?? null;

  const cost = Number(r.totalOperatingCost) || 0;
  const sug = r.suggestedPrices ?? { menudeo: 0, medio: 0, mayoreo: 0 };

  const newMenudeo =
    Number(r.overrideMenudeo) > 0 ? Number(r.overrideMenudeo) : sug.menudeo;
  const newMedio =
    Number(r.overrideMedio) > 0 ? Number(r.overrideMedio) : sug.medio;
  const newMayoreo =
    Number(r.overrideMayoreo) > 0 ? Number(r.overrideMayoreo) : sug.mayoreo;

  const refVariant = variant ?? variants[0] ?? null;
  const currMen = Number(refVariant?.price_menudeo) || 0;
  const currMed = Number(refVariant?.price_medio) || 0;
  const currMay = Number(refVariant?.price_mayoreo) || 0;

  const profit = newMenudeo - cost;
  const margin = newMenudeo > 0 ? (profit / newMenudeo) * 100 : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-100 dark:border-slate-700 relative"
    >
      <button
        onClick={() => onRemove(r.key)}
        className="absolute right-3 top-3 w-8 h-8 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 active:scale-90 transition-all flex items-center justify-center z-10"
        aria-label="Quitar"
      >
        <Trash2 size={14} />
      </button>

      <div className="flex flex-col gap-1.5 mb-3 pr-10">
        <span className="text-[8px] font-black text-slate-400 uppercase italic flex items-center gap-1">
          <Package size={10} /> 1. Elige el producto
        </span>
        <select
          className="h-11 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none text-[12px] font-black text-slate-700 dark:text-slate-200 uppercase outline-none shadow-inner"
          value={r.productId}
          onChange={(e) =>
            onUpdate(r.key, {
              productId: e.target.value,
              variantId: "",
            })
          }
        >
          <option value="">— Seleccionar —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {product && variants.length > 0 && (
        <div className="space-y-1.5 mb-3">
          <span className="text-[8px] font-black text-slate-400 uppercase italic flex items-center gap-1">
            <Layers size={10} /> 2. ¿A qué variante? (vacío = todas)
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              type="button"
              onClick={() => onUpdate(r.key, { variantId: "" })}
              className={`px-3 h-8 rounded-full text-[9px] font-black uppercase whitespace-nowrap transition-all shrink-0 ${
                !r.variantId
                  ? "bg-primary text-white shadow-bloom"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500"
              }`}
            >
              Todas ({variants.length})
            </button>
            {variants.map((v: any) => {
              const active = r.variantId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onUpdate(r.key, { variantId: v.id })}
                  className={`px-3 h-8 rounded-full text-[9px] font-black uppercase whitespace-nowrap transition-all shrink-0 ${
                    active
                      ? "bg-primary text-white shadow-bloom"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {v.variant_name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {product && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="space-y-1">
              <span className="text-[7px] font-black text-slate-400 uppercase italic">
                Costo base (BD)
              </span>
              <div className="h-10 px-3 bg-slate-900 dark:bg-slate-800 rounded-xl flex items-center justify-center text-white text-xs font-black tabular-nums">
                {formatMoney(Number(product.cost) || 0)}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[7px] font-black text-blue-500 uppercase italic">
                + Gasto extra
              </span>
              <input
                type="number"
                placeholder="0.00"
                min={0}
                step="0.01"
                className="w-full h-10 px-3 font-black text-[11px] text-center rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 text-blue-600 dark:text-blue-300 outline-none tabular-nums"
                value={r.manualExtraCost || ""}
                onChange={(e) =>
                  onUpdate(r.key, { manualExtraCost: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-1.5 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-black text-slate-400 uppercase italic flex items-center gap-1">
                <Sparkles size={10} /> 3. Precios a aplicar
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdate(r.key, {
                    overrideMenudeo: "",
                    overrideMedio: "",
                    overrideMayoreo: "",
                  })
                }
                className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-primary"
              >
                Resetear
              </button>
            </div>

            <div className="space-y-2">
              <TierRow
                tier="menudeo"
                current={currMen}
                suggested={sug.menudeo}
                value={newMenudeo}
                override={r.overrideMenudeo}
                onChange={(v) => onUpdate(r.key, { overrideMenudeo: v })}
              />
              <TierRow
                tier="medio"
                current={currMed}
                suggested={sug.medio}
                value={newMedio}
                override={r.overrideMedio}
                onChange={(v) => onUpdate(r.key, { overrideMedio: v })}
              />
              <TierRow
                tier="mayoreo"
                current={currMay}
                suggested={sug.mayoreo}
                value={newMayoreo}
                override={r.overrideMayoreo}
                onChange={(v) => onUpdate(r.key, { overrideMayoreo: v })}
              />
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[7px] font-black text-slate-400 uppercase">
                Costo final
              </p>
              <p className="text-[11px] font-black tabular-nums">
                {formatMoney(cost)}
              </p>
            </div>
            <div>
              <p className="text-[7px] font-black text-slate-400 uppercase">
                Ganancia/u (men)
              </p>
              <p
                className={`text-[11px] font-black tabular-nums ${
                  profit >= 0 ? "text-emerald-600" : "text-rose-500"
                }`}
              >
                {profit >= 0 ? "+" : ""}
                {formatMoney(profit)}
              </p>
            </div>
            <div>
              <p className="text-[7px] font-black text-slate-400 uppercase">
                Margen (men)
              </p>
              <p
                className={`text-[11px] font-black tabular-nums ${marginColor(
                  margin
                )}`}
              >
                {margin.toFixed(1)}%
              </p>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function TierRow({
  tier,
  current,
  suggested,
  value,
  override,
  onChange,
}: {
  tier: Tier;
  current: number;
  suggested: number;
  value: number;
  override: string | number | undefined;
  onChange: (v: string) => void;
}) {
  const delta = deltaPill(current, value);
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-2.5 flex items-center gap-2">
      <div className="w-14 shrink-0">
        <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">
          {TIER_LABEL[tier]}
        </p>
        <p className="text-[8px] font-bold text-slate-400 tabular-nums">
          Antes: {formatMoney(current)}
        </p>
      </div>

      <ArrowRight size={11} className="text-slate-300 shrink-0" />

      <div className="flex-1 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          className={`h-10 rounded-xl flex flex-col items-center justify-center text-center transition-all ${
            !override || Number(override) === 0
              ? "bg-primary text-white shadow-bloom"
              : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500"
          }`}
        >
          <p className="text-[7px] font-black uppercase tracking-widest leading-none">
            Sugerido
          </p>
          <p className="text-[11px] font-black tabular-nums leading-tight">
            {formatMoney(suggested)}
          </p>
        </button>

        <div className="relative">
          <input
            type="number"
            placeholder="Manual"
            min={0}
            step="0.01"
            value={override || ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-10 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-primary outline-none text-[11px] font-black text-center tabular-nums"
          />
        </div>
      </div>

      <span
        className={`shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${delta.cls}`}
      >
        {delta.txt}
      </span>
    </div>
  );
}

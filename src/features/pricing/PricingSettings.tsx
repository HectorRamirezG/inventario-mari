import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Save,
  Percent,
  Layers,
  Truck,
  Loader2,
  Check,
  Sparkles,
} from "lucide-react";
import { getPricingConfig, savePricingConfig } from "./pricingConfigService";
import type { PricingConfig } from "./pricingTypes";
import { toast } from "react-hot-toast";

/* ──────────────────────────────────────────────────────────
 * Inputs estilizados unificados
 * ────────────────────────────────────────────────────────── */

function PercentInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="relative w-full max-w-[140px]">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={0}
        max={100}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-11 px-4 pr-8 bg-white/5 hover:bg-white/10 border border-white/10 focus:border-primary focus:bg-white/10 rounded-xl text-center font-black text-sm text-white tabular-nums outline-none transition-colors"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-primary/70">
        %
      </span>
    </div>
  );
}

function PiecesInput({
  value,
  onChange,
  tone = "amber",
}: {
  value: number;
  onChange: (n: number) => void;
  tone?: "amber" | "emerald";
}) {
  const toneClasses =
    tone === "amber"
      ? "focus:border-amber-400 focus:bg-amber-500/10"
      : "focus:border-emerald-400 focus:bg-emerald-500/10";
  return (
    <div className="relative w-full">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-11 px-4 pr-12 bg-white/5 border border-white/10 hover:bg-white/10 ${toneClasses} rounded-xl text-center font-black text-sm text-white tabular-nums outline-none transition-colors`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/40 uppercase italic">
        pzs
      </span>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="relative w-full max-w-[180px]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-white/30 text-xs">
        $
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-11 pl-8 pr-3 bg-white/5 border border-white/10 hover:bg-white/10 focus:border-primary focus:bg-white/10 rounded-xl text-center font-black text-sm text-white tabular-nums outline-none transition-colors"
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 * Card oscura unificada
 * ────────────────────────────────────────────────────────── */

function DarkCard({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-white/10 p-5 md:p-6 shadow-premium relative overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 100%)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-white">
            {title}
          </h3>
          {hint && (
            <p className="text-[9px] font-bold text-white/40 leading-tight mt-0.5">
              {hint}
            </p>
          )}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

/* ──────────────────────────────────────────────────────────
 * Página principal
 * ────────────────────────────────────────────────────────── */

export default function PricingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [config, setConfig] = useState<PricingConfig>({
    id: 1,
    margen_menudeo: 30,
    margen_medio: 25,
    margen_mayoreo: 20,
    umbral_medio: 6,
    umbral_mayoreo: 12,
    costo_extra: 0,
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await getPricingConfig();
        setConfig(data);
      } catch (error) {
        toast.error("Error al cargar configuración");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePricingConfig(config);
      toast.success("Configuración guardada");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1600);
    } catch (error) {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto pb-12 px-1">
      {/* HEADER */}
      <div className="px-2 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2">
            <Settings size={14} className="text-primary" /> Preferencias
          </h2>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
            Reglas globales del cotizador
          </p>
        </div>
      </div>

      {/* SECCIÓN 1: MÁRGENES DE UTILIDAD */}
      <DarkCard
        icon={<Percent size={14} />}
        title="Márgenes de utilidad"
        hint="% que se aplica sobre el costo para sugerir el precio"
      >
        <div className="space-y-3">
          {[
            { label: "Menudeo", key: "margen_menudeo" as const, hint: "1 a 5 pz" },
            { label: "Medio Mayoreo", key: "margen_medio" as const, hint: "desde 6 pz" },
            { label: "Mayoreo Total", key: "margen_mayoreo" as const, hint: "desde 12 pz" },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 py-2 px-3 rounded-2xl bg-white/[0.03] border border-white/5"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase text-white tracking-wide">
                  {item.label}
                </p>
                <p className="text-[9px] font-bold text-white/40 uppercase italic">
                  {item.hint}
                </p>
              </div>
              <PercentInput
                value={config[item.key]}
                onChange={(n) => setConfig({ ...config, [item.key]: n })}
              />
            </div>
          ))}
        </div>
      </DarkCard>

      {/* SECCIÓN 2: ESCALA DE UNIDADES */}
      <DarkCard
        icon={<Layers size={14} />}
        title="Escala de unidades"
        hint="Cantidades que activan los precios mayoristas"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-amber-400/80 ml-1 tracking-widest">
              Medio desde
            </label>
            <PiecesInput
              tone="amber"
              value={config.umbral_medio}
              onChange={(n) => setConfig({ ...config, umbral_medio: n })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase text-emerald-400/80 ml-1 tracking-widest">
              Mayoreo desde
            </label>
            <PiecesInput
              tone="emerald"
              value={config.umbral_mayoreo}
              onChange={(n) => setConfig({ ...config, umbral_mayoreo: n })}
            />
          </div>
        </div>
        <p className="text-[9px] text-white/40 font-bold uppercase italic mt-3 text-center tracking-tighter">
          El precio cambia automáticamente al alcanzar estas piezas en el cotizador
        </p>
      </DarkCard>

      {/* SECCIÓN 3: COSTOS OPERATIVOS */}
      <DarkCard
        icon={<Truck size={14} />}
        title="Costos operativos"
        hint="Gasto fijo que se suma a cada análisis de la calculadora"
      >
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase text-white tracking-wide">
              Gasto fijo por análisis
            </p>
            <p className="text-[9px] font-bold text-white/40 uppercase italic">
              MXN — se suma como costo extra
            </p>
          </div>
          <MoneyInput
            value={config.costo_extra}
            onChange={(n) => setConfig({ ...config, costo_extra: n })}
          />
        </div>
      </DarkCard>

      {/* BOTÓN GUARDAR — integrado, no flotante */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <AnimatePresence>
          {justSaved && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1"
            >
              <Sparkles size={11} /> Guardado
            </motion.span>
          )}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSave}
          disabled={saving}
          className="h-11 px-5 rounded-2xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 shadow-bloom active:scale-95 transition-all disabled:opacity-50 relative overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {justSaved ? (
              <motion.span
                key="ok"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute inset-0 flex items-center justify-center gap-2 bg-emerald-500"
              >
                <Check size={14} /> Listo
              </motion.span>
            ) : null}
          </AnimatePresence>
          {saving ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Save size={14} />
          )}
          Guardar configuración
        </motion.button>
      </div>
    </div>
  );
}

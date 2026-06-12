import { useState, useEffect } from "react";
import { Settings, Save, Percent, Truck, Database, ShieldCheck, Cog, Loader2, Layers } from "lucide-react";
import Button from "../../components/ui/Button";
import { getPricingConfig, savePricingConfig } from "./pricingConfigService";
import type { PricingConfig } from "./pricingTypes";
import { toast } from "sonner";

export default function PricingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<PricingConfig>({
    id: 1,
    margen_menudeo: 30,
    margen_medio: 25,
    margen_mayoreo: 20,
    umbral_medio: 6,
    umbral_mayoreo: 12,
    costo_extra: 0
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
    } catch (error) {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="animate-spin text-primary" />
    </div>
  );

  return (
    <div className="flex flex-col gap-5 pb-44">
      
      <div className="px-2">
        <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2">
          <Settings size={14} className="text-primary" /> Preferencias
        </h2>
        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">
          Configuración global del sistema
        </p>
      </div>

      {/* SECCIÓN 1: MÁRGENES DE UTILIDAD */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-2">
          <Percent size={14} className="text-primary/50" />
          <h2 className="text-[9px] font-black uppercase italic tracking-widest text-slate-400">Márgenes de Utilidad</h2>
        </div>

        <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-50 space-y-3">
          {[
            { label: 'Menudeo', key: 'margen_menudeo' as const },
            { label: 'Medio Mayoreo', key: 'margen_medio' as const },
            { label: 'Mayoreo Total', key: 'margen_mayoreo' as const }
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
              <p className="text-[10px] font-black uppercase italic">{item.label}</p>
              <div className="relative">
                <input 
                  type="number" 
                  value={config[item.key]}
                  onChange={e => setConfig({...config, [item.key]: Number(e.target.value)})}
                  className="w-16 h-9 bg-slate-50 border-none rounded-xl text-center font-black text-[10px] text-primary shadow-inner pr-4"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-primary/40">%</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECCIÓN 2: UMBRALES DE CANTIDAD (Lo que pediste) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-2">
          <Layers size={14} className="text-amber-500/50" />
          <h2 className="text-[9px] font-black uppercase italic tracking-widest text-slate-400">Escala de Unidades</h2>
        </div>

        <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-50">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[8px] font-black uppercase text-slate-400 ml-1">Medio desde:</label>
              <div className="relative">
                <input 
                  type="number"
                  value={config.umbral_medio}
                  onChange={e => setConfig({...config, umbral_medio: Number(e.target.value)})}
                  className="w-full h-11 px-4 bg-amber-50/30 border border-amber-100/50 rounded-2xl font-black text-xs text-amber-700 shadow-sm outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-bold text-amber-600/50 uppercase italic">Pzs</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black uppercase text-slate-400 ml-1">Mayoreo desde:</label>
              <div className="relative">
                <input 
                  type="number"
                  value={config.umbral_mayoreo}
                  onChange={e => setConfig({...config, umbral_mayoreo: Number(e.target.value)})}
                  className="w-full h-11 px-4 bg-emerald-50/30 border border-emerald-100/50 rounded-2xl font-black text-xs text-emerald-700 shadow-sm outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[7px] font-bold text-emerald-600/50 uppercase italic">Pzs</span>
              </div>
            </div>
          </div>
          <p className="text-[7px] text-slate-300 font-bold uppercase italic mt-3 text-center tracking-tighter">
            * El precio cambiará automáticamente al alcanzar estas piezas en el cotizador
          </p>
        </div>
      </section>

      {/* SECCIÓN 3: LOGÍSTICA */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-2">
          <Truck size={14} className="text-blue-400" />
          <h2 className="text-[9px] font-black uppercase italic tracking-widest text-slate-400">Costos Operativos</h2>
        </div>

        <div className="bg-white rounded-[2rem] p-5 shadow-sm border border-slate-50">
           <div className="flex flex-col gap-1.5">
             <label className="text-[8px] font-black uppercase ml-1 text-slate-400 italic tracking-widest">Gasto Fijo por Análisis (MXN)</label>
             <div className="relative">
               <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-300 text-xs">$</span>
               <input 
                 type="number" 
                 value={config.costo_extra}
                 onChange={e => setConfig({...config, costo_extra: Number(e.target.value)})}
                 className="w-full h-11 pl-8 bg-slate-50 border-none rounded-xl font-black text-xs shadow-inner outline-none"
               />
             </div>
           </div>
        </div>
      </section>

      {/* BOTÓN GUARDAR */}
      <div className="fixed bottom-24 left-6 right-6 z-50">
        <Button 
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 rounded-[2rem] bg-slate-900 text-white shadow-xl flex items-center justify-center gap-3 font-black uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <>Guardar Configuración <Save size={16} className="opacity-50" /></>}
        </Button>
      </div>
    </div>
  );
}
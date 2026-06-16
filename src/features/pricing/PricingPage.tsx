import { useState } from "react";
import {
  Calculator,
  History,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { usePricingPage } from "./usePricingPage";
import CalculatorTab from "./CalculatorTab";
import PricingHistory from "./PricingHistory";
import PricingSettings from "./PricingSettings";

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState<"precios" | "historial" | "config">("precios");

  const {
    products,
    addRow,
    removeRow,
    updateRow,
    computed,
    saveAnalysis,
    isSaving
  } = usePricingPage();

  const tabs = [
    { id: "precios", label: "PRECIOS", icon: Calculator },
    { id: "historial", label: "HISTORIAL", icon: History },
    { id: "config", label: "CONFIG", icon: Settings },
  ] as const;

  return (
    <div className="flex flex-col text-slate-900">

      {/* 🔥 HEADER COMPACTO */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-pink-50 px-1 pt-1 pb-2 -mx-1">

        <nav className="flex bg-white border border-pink-50 p-1 rounded-[1.8rem] shadow-sm">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 py-2 rounded-[1.4rem] flex items-center justify-center gap-1 transition-all ${
                  isActive ? "text-white" : "text-slate-400"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-slate-900 rounded-[1.4rem]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}

                <tab.icon size={12} className="relative z-10" />
                <span className="relative z-10 text-[8px] font-black tracking-tight">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* 🔥 MAIN — sin h fijo, fluye con el shell padre */}
      <main className="pt-1">
        <AnimatePresence mode="wait">

          {activeTab === "precios" && (
            <motion.div
              key="calculator"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
            >
              <CalculatorTab
                products={products}
                rows={computed}
                onAdd={addRow}
                onRemove={removeRow}
                onUpdate={updateRow}
                onSave={saveAnalysis}
                isSaving={isSaving}
              />
            </motion.div>
          )}

          {activeTab === "historial" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              <PricingHistory />
            </motion.div>
          )}

          {activeTab === "config" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
            >
              <PricingSettings />
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
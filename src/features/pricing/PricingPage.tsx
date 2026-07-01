import { useState } from "react";
import {
  Calculator,
  History,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { usePricingPage } from "./usePricingPage";
import CalculatorTab from "./CalculatorTab";
import PricingHistory from "./PricingHistory";
import TierOverridesTab from "./TierOverridesTab";
import TabBar from "../../components/ui/TabBar";

export default function PricingPage() {
  const [activeTab, setActiveTab] = useState<"precios" | "historial" | "umbrales">("precios");

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
    { id: "precios", label: "Precios", icon: Calculator },
    { id: "umbrales", label: "Umbrales", icon: Layers },
    { id: "historial", label: "Historial", icon: History },
  ] as const;

  return (
    <div className="flex flex-col text-slate-900 dark:text-slate-100">

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl px-1 pt-1 pb-2 -mx-1">
        <TabBar
          tabs={tabs}
          active={activeTab}
          onChange={(id) => setActiveTab(id as typeof activeTab)}
          layoutId="pricingActiveTab"
        />
      </header>

      {/* MAIN */}
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

          {activeTab === "umbrales" && (
            <motion.div
              key="umbrales"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              <TierOverridesTab />
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

        </AnimatePresence>
      </main>
    </div>
  );
}
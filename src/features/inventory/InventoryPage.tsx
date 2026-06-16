import { useState, useEffect } from "react";
import { List, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ProductList from "../products/ProductList";
import MovementHistoryPage from "../movements/MovementHistoryPage";
import TabBar from "../../components/ui/TabBar";

type InventoryTab = "catalogo" | "historial";

const TABS = [
  { id: "catalogo" as const, label: "Catálogo", icon: List },
  { id: "historial" as const, label: "Movimientos", icon: History },
];

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>("catalogo");

  useEffect(() => {
    const saved = localStorage.getItem("inventory_view") as InventoryTab | null;
    if (saved && TABS.some(t => t.id === saved)) setActiveTab(saved);
  }, []);

  function changeTab(tab: InventoryTab) {
    setActiveTab(tab);
    localStorage.setItem("inventory_view", tab);
  }

  return (
    <div className="flex flex-col text-slate-900 dark:text-slate-100">

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-xl px-1 pt-1 pb-2 -mx-1">
        <TabBar
          tabs={TABS}
          active={activeTab}
          onChange={(id) => changeTab(id as InventoryTab)}
          layoutId="inventoryActiveTab"
        />
      </header>

      {/* MAIN */}
      <main className="pt-3">
        <AnimatePresence mode="wait">
          {activeTab === "catalogo" && (
            <motion.div
              key="catalogo"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
            >
              <ProductList />
            </motion.div>
          )}

          {activeTab === "historial" && (
            <motion.div
              key="historial"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: -8 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              <MovementHistoryPage />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
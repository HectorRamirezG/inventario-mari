import { useState, useEffect } from "react";
import { List, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ProductList from "../products/ProductList";
import MovementHistoryPage from "../movements/MovementHistoryPage";

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
    // Sin h-[calc(100vh-..)] ni overflow-hidden: ese contenedor cortaba
    // el scroll del shell padre. Ahora fluye como contenido normal.
    <div className="flex flex-col text-slate-900">

      {/* HEADER COMPACTO */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-pink-50 px-1 pt-1 pb-2 -mx-1">
        <nav className="flex bg-white border border-pink-50 p-1 rounded-[1.8rem] shadow-sm">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                className={`relative flex-1 py-2 rounded-[1.4rem] flex items-center justify-center gap-1 transition-all ${
                  isActive ? "text-white" : "text-slate-400"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="inventoryActiveTab"
                    className="absolute inset-0 bg-slate-900 rounded-[1.4rem]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon size={12} className="relative z-10" />
                <span className="relative z-10 text-[9px] font-black tracking-tight uppercase">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* MAIN — sin h fijo, deja al shell padre manejar el scroll */}
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
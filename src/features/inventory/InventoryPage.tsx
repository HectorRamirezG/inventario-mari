import { useState, useEffect } from "react";
import { 
  List, 
  ShoppingCart, 
  History 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ProductList from "../products/ProductList";
import SalesPage from "../sales/SalesPage";
import MovementHistoryPage from "../movements/MovementHistoryPage";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<"catalogo" | "caja" | "historial">("catalogo");

  useEffect(() => {
    const saved = localStorage.getItem("inventory_view") as typeof activeTab | null;
    if (saved) setActiveTab(saved);
  }, []);

  function changeTab(tab: typeof activeTab) {
    setActiveTab(tab);
    localStorage.setItem("inventory_view", tab);
  }

  const tabs = [
    { id: "catalogo", label: "CATÁLOGO", icon: List },
    { id: "caja", label: "CAJA", icon: ShoppingCart },
    { id: "historial", label: "HISTORIAL", icon: History },
  ] as const;

  return (
    <div className="flex flex-col h-[calc(100vh-75px)] bg-[#FFFAFA] text-slate-900 overflow-hidden">
      
      {/* 🔥 HEADER COMPACTO */}
      <header className="shrink-0 bg-white/80 backdrop-blur-xl border-b border-pink-50 px-4 pt-1 pb-2 z-50">

        <nav className="flex bg-white border border-pink-50 p-1 rounded-[1.8rem] shadow-sm">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

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

      {/* 🔥 MAIN */}
      <main className="flex-1 overflow-y-auto px-3 pt-1 scroll-smooth">
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

          {activeTab === "caja" && (
            <motion.div
              key="caja"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
            >
              <SalesPage />
            </motion.div>
          )}

          {activeTab === "historial" && (
            <motion.div
              key="historial"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              <MovementHistoryPage />
            </motion.div>
          )}

        </AnimatePresence>

        {/* 🔥 ESPACIO PARA DOCK */}
        <div className="h-28" />
      </main>

      {/* 🔥 GRADIENT FIX */}
      <div className="shrink-0 h-4 bg-gradient-to-t from-[#FFFAFA] to-transparent pointer-events-none" />
    </div>
  );
}
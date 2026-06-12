import { useEffect, useState } from "react"
import { Toaster } from "react-hot-toast"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"

import {
  LayoutDashboard,
  Package,
  Tag,
  ShoppingCart,
  Sparkles
} from "lucide-react"

import InventoryPage from "./features/inventory/InventoryPage"
import PricingPage from "./features/pricing/PricingPage"
import DashboardPage from "./features/dashboard/DashboardPage"
import SalesPage from "./features/sales/SalesPage"

type Tab = "dashboard" | "inventario" | "precios" | "ventas"

const TABS = [
  { id: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { id: "inventario", label: "Stock", icon: Package },
  { id: "precios", label: "Precios", icon: Tag },
  { id: "ventas", label: "Ventas", icon: ShoppingCart }
] as const

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard")

  useEffect(() => {
    const handler = (e: any) => {
      const t = e.detail?.tab
      if (TABS.some(x => x.id === t)) setTab(t)
    }
    window.addEventListener("app:navigate", handler)
    return () => window.removeEventListener("app:navigate", handler)
  }, [])

  return (
    <div className="fixed inset-0 flex flex-col bg-white overflow-hidden">
      <Toaster
        position="top-center"
        toastOptions={{
          style: { borderRadius: "1rem", fontWeight: "bold", fontSize: "12px" }
        }}
      />

      {/* HEADER */}
      <header className="z-50 bg-white/80 backdrop-blur-xl border-b border-pink-50 px-4 py-2 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 shrink-0"
          >
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-sm">
              <Sparkles className="text-white" size={16} />
            </div>
            <h1 className="text-base font-black tracking-tighter italic">
              Mari <span className="text-primary not-italic">Inv</span>
            </h1>
          </motion.div>

          {/* NAV HORIZONTAL EN DESKTOP */}
          <nav className="hidden md:flex flex-1 justify-end">
            <LayoutGroup id="desktop-nav">
              <div className="flex bg-slate-50 border border-slate-100 rounded-full p-1">
                {TABS.map(t => {
                  const active = tab === t.id
                  const Icon = t.icon
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`relative px-4 py-1.5 rounded-full flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tight transition-colors ${
                        active ? "text-white" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="desktop-pill"
                          className="absolute inset-0 bg-primary rounded-full shadow-bloom"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                        />
                      )}
                      <Icon size={12} className="relative z-10" />
                      <span className="relative z-10">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </LayoutGroup>
          </nav>
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="flex-1 overflow-y-auto scroll-container-ios bg-slate-50/30">
        <div className="w-full max-w-7xl mx-auto px-4 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="pb-20"
            >
              {tab === "dashboard" && <DashboardPage />}
              {tab === "inventario" && <InventoryPage />}
              {tab === "precios" && <PricingPage />}
              {tab === "ventas" && <SalesPage />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* DOCK MÓVIL */}
      <nav className="md:hidden sticky bottom-0 w-full bg-white/90 backdrop-blur-2xl border-t border-slate-100 z-50">
        <div className="flex justify-around items-center h-14 pb-safe">
          <LayoutGroup id="mobile-dock">
            {TABS.map(t => {
              const active = tab === t.id
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-col items-center justify-center flex-1 h-full relative active:scale-90 transition-all ${
                    active ? "text-primary" : "text-slate-400"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="active-pill"
                      className="absolute inset-x-2 inset-y-1 bg-primary/5 rounded-lg -z-10"
                    />
                  )}
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[9px] font-black uppercase tracking-tighter mt-0.5">
                    {t.label}
                  </span>
                </button>
              )
            })}
          </LayoutGroup>
        </div>
      </nav>
    </div>
  )
}

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ShoppingCart, Plus, Minus, Trash2, Search,
  Package2, Tag, TrendingUp, Sparkles
} from "lucide-react"

import Button from "../../components/ui/Button"
import Badge from "../../components/ui/Badge"
import { money } from "../../lib/money"
import { useSalesPage, type CartLine } from "./useSalesPage"
import type { Tier } from "../../types/database"

const tierLabel: Record<Tier, string> = {
  menudeo: "Menudeo",
  medio:   "Medio mayoreo",
  mayoreo: "Mayoreo",
}

const tierTone: Record<Tier, "neutral" | "info" | "ok"> = {
  menudeo: "neutral",
  medio:   "info",
  mayoreo: "ok",
}

export default function SalesPage() {
  const { state, actions } = useSalesPage()
  const [tab, setTab] = useState<"productos" | "paquetes">("productos")
  const [q, setQ] = useState("")

  const filteredCatalog = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return state.catalog
    return state.catalog.filter(c =>
      (`${c.variant_name} ${c.product.name} ${c.sku ?? ""}`).toLowerCase().includes(s)
    )
  }, [q, state.catalog])

  const filteredBundles = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return state.bundles
    return state.bundles.filter(b => b.name.toLowerCase().includes(s))
  }, [q, state.bundles])

  return (
    <div className="px-3 pt-1 pb-28">
      {/* HEADER */}
      <div className="mb-4 flex items-center justify-between max-w-5xl mx-auto">
        <div>
          <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-slate-900">
            <ShoppingCart size={14} className="text-primary" />
            Punto de Venta
          </h2>
          <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
            {state.totalPieces} pza · {tierLabel[state.cartTier]}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-primary">{money(state.total)}</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* ─── CATÁLOGO ─── */}
        <div className="bg-white rounded-[2rem] p-4 border border-slate-100 shadow-sm flex flex-col">

          {/* Tabs Productos / Paquetes */}
          <div className="flex bg-slate-50 p-1 rounded-2xl mb-3">
            <TabBtn active={tab === "productos"} onClick={() => setTab("productos")}>
              <Tag size={10} /> Productos
            </TabBtn>
            <TabBtn active={tab === "paquetes"} onClick={() => setTab("paquetes")}>
              <Package2 size={10} /> Paquetes
              {state.bundles.length > 0 && (
                <span className="ml-1 bg-primary text-white text-[8px] px-1.5 py-0.5 rounded-full">
                  {state.bundles.length}
                </span>
              )}
            </TabBtn>
          </div>

          {/* Búsqueda */}
          <div className="relative mb-3">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={tab === "productos" ? "Buscar producto..." : "Buscar paquete..."}
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-slate-50 border-none text-[10px] font-bold outline-none"
            />
          </div>

          {/* Lista */}
          <div className="h-[260px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            <AnimatePresence mode="wait">
              {tab === "productos" ? (
                <motion.div
                  key="prods"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  {filteredCatalog.length === 0 && (
                    <p className="text-center text-[10px] text-slate-400 py-10">Sin resultados</p>
                  )}
                  {filteredCatalog.map(v => {
                    const active = state.cart.some(c => c.kind === "variant" && c.variant_id === v.id)
                    return (
                      <button
                        key={v.id}
                        onClick={() => actions.addVariant(v)}
                        disabled={v.stock <= 0}
                        className={`w-full flex justify-between items-center p-3 rounded-xl border transition-all active:scale-[0.97] ${
                          active
                            ? "bg-primary text-white border-primary shadow-bloom"
                            : "bg-white border-slate-100 disabled:opacity-50"
                        }`}
                      >
                        <div className="text-left min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-tight leading-tight truncate">
                            {v.product.name}
                          </p>
                          <p className={`text-[9px] truncate ${active ? "text-white/70" : "text-slate-400"}`}>
                            {v.variant_name} · {v.stock} pz
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-xs font-black italic">
                            {money(v.price_menudeo > 0 ? v.price_menudeo : v.price)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="bundles"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  {filteredBundles.length === 0 && (
                    <p className="text-center text-[10px] text-slate-400 py-10">Sin paquetes</p>
                  )}
                  {filteredBundles.map(b => {
                    const active = state.cart.some(c => c.kind === "bundle" && c.bundle_id === b.id)
                    const pieces = (b.items ?? []).reduce((a, i) => a + i.qty, 0)
                    return (
                      <button
                        key={b.id}
                        onClick={() => actions.addBundle(b)}
                        className={`w-full flex justify-between items-center p-3 rounded-xl border transition-all active:scale-[0.97] ${
                          active
                            ? "bg-primary text-white border-primary shadow-bloom"
                            : "bg-white border-slate-100"
                        }`}
                      >
                        <div className="text-left min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-tight leading-tight truncate">
                            {b.name}
                          </p>
                          <p className={`text-[9px] truncate ${active ? "text-white/70" : "text-slate-400"}`}>
                            {pieces} pza {b.counts_as_wholesale ? "· cuenta mayoreo" : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-xs font-black italic">{money(b.price)}</p>
                        </div>
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ─── DETALLE ─── */}
        <div className="bg-white rounded-[2rem] p-4 border border-slate-100 shadow-sm">

          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-black uppercase text-slate-800">Detalle</h2>
            <div className="flex gap-1">
              <Badge tone={tierTone[state.cartTier]} className="text-[8px]">
                {tierLabel[state.cartTier]}
              </Badge>
              <Badge tone="primary" className="text-[8px]">
                {state.cart.length} ítem{state.cart.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>

          {/* BANNER UPSELL */}
          <AnimatePresence>
            {state.upsellHint && state.upsellHint.missing > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-3 p-3 rounded-2xl bg-gradient-to-r from-amber-50 to-pink-50 border border-amber-100"
              >
                <div className="flex items-start gap-2">
                  <Sparkles size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-amber-900">
                      Faltan <span className="text-primary">{state.upsellHint.missing} pza</span> para{" "}
                      <span className="uppercase">{tierLabel[state.upsellHint.nextTier]}</span>
                    </p>
                    {state.upsellHint.savings > 0 && (
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        Cliente ahorra {money(state.upsellHint.savings)} si llega al siguiente nivel
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* LISTA */}
          {state.cart.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-2xl">
              <ShoppingCart className="mx-auto mb-2 text-slate-300" size={24} />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Carrito vacío
              </p>
            </div>
          ) : (
            <div className="space-y-2 mb-4 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
              <AnimatePresence mode="popLayout">
                {state.cart.map(line => (
                  <CartLineRow
                    key={line.kind === "variant" ? line.variant_id : line.bundle_id}
                    line={line}
                    onQty={(q) => actions.updateQty(
                      line.kind === "variant" ? line.variant_id : line.bundle_id, q
                    )}
                    onRemove={() => actions.remove(
                      line.kind === "variant" ? line.variant_id : line.bundle_id
                    )}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* TOTAL + FORM */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="bg-slate-900 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg">
              <span className="text-[10px] text-slate-400 uppercase font-black">Total</span>
              <p className="text-xl font-black text-white">{money(state.total)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Pagado..."
                value={state.paid || ""}
                onChange={(e) => actions.setPaid(Number(e.target.value))}
                className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none"
              />
              <input
                type="text"
                placeholder="Cliente (opcional)"
                value={state.customer}
                onChange={(e) => actions.setCustomer(e.target.value)}
                className="h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none"
              />
            </div>

            {state.balance > 0 && (
              <p className="text-[9px] text-right font-black text-rose-500">
                Saldo pendiente: {money(state.balance)}
              </p>
            )}

            <Button
              onClick={actions.handleSave}
              disabled={state.loading || state.cart.length === 0}
              isLoading={state.loading}
              className="w-full h-12 rounded-xl text-xs font-black tracking-widest bg-primary text-white shadow-bloom"
            >
              Confirmar venta
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────── helpers ─────────────── */
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wide flex items-center justify-center gap-1 transition-all ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
      }`}
    >
      {children}
    </button>
  )
}

function CartLineRow({
  line, onQty, onRemove,
}: {
  line: CartLine
  onQty: (q: number) => void
  onRemove: () => void
}) {
  const isBundle = line.kind === "bundle"
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -10 }}
      className={`flex items-center gap-2 p-3 rounded-xl border ${
        isBundle ? "bg-pink-50/40 border-pink-100" : "bg-slate-50/50 border-slate-100"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-[9px] font-black uppercase ${isBundle ? "text-primary" : "text-primary"}`}>
          {isBundle ? "Paquete" : line.variant_name}
        </p>
        <p className="text-[11px] font-black text-slate-800 truncate">
          {isBundle ? line.name : line.name}
        </p>
      </div>

      <div className="flex items-center bg-white shadow-sm border border-slate-100 rounded-lg p-0.5">
        <button onClick={() => onQty(line.qty - 1)} className="p-1"><Minus size={10} /></button>
        <span className="w-5 text-center text-[10px] font-black">{line.qty}</span>
        <button onClick={() => onQty(line.qty + 1)} className="p-1"><Plus size={10} /></button>
      </div>

      <div className="text-right min-w-[60px]">
        <p className="text-sm font-black text-slate-900">{money(line.qty * line.unit_price)}</p>
        {!isBundle && line.tier !== "menudeo" && (
          <p className="text-[8px] text-emerald-600 font-black flex items-center justify-end gap-0.5">
            <TrendingUp size={8} /> {tierLabel[line.tier]}
          </p>
        )}
      </div>

      <button onClick={onRemove} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
    </motion.div>
  )
}

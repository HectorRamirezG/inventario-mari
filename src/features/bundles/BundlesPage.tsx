import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Package2, Plus, Trash2, Edit3, Search, Tag,
  Layers, Calculator, X, Check
} from "lucide-react"

import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import Badge from "../../components/ui/Badge"
import { money } from "../../lib/money"

import { useBundles } from "./useBundles"
import type { Bundle } from "../../types/database"

export default function BundlesPage() {
  const ui = useBundles()
  const [q, setQ] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQ, setPickerQ] = useState("")

  const filtered = ui.bundles.filter(b =>
    b.name.toLowerCase().includes(q.toLowerCase())
  )

  const draftSavings = (() => {
    if (!ui.draft.price || ui.computedCost === 0) return null
    const ahorro = ui.computedCost - Number(ui.draft.price)
    return ahorro // positivo = el bundle es más barato; negativo = el bundle cuesta más
  })()

  const availableCatalog = ui.catalog.filter(c =>
    !ui.draft.items.some(i => i.variant_id === c.id) &&
    (`${c.variant_name} ${c.product.name} ${c.sku ?? ""}`)
      .toLowerCase()
      .includes(pickerQ.toLowerCase())
  )

  return (
    <div className="flex flex-col h-[calc(100vh-75px)] bg-[#FFFAFA] overflow-hidden">

      {/* HEADER */}
      <header className="shrink-0 bg-white/80 backdrop-blur-xl border-b border-pink-50 px-4 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2">
              <Package2 size={14} className="text-primary" /> Paquetes
            </h2>
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mt-0.5">
              {ui.bundles.length} paquete{ui.bundles.length === 1 ? "" : "s"} activo{ui.bundles.length === 1 ? "" : "s"}
            </p>
          </div>

          <button
            onClick={ui.openNew}
            className="h-10 px-4 rounded-full bg-primary text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-90 transition-all"
          >
            <Plus size={14} strokeWidth={3} /> Nuevo
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto px-3 pt-3 scroll-smooth">
        <div className="max-w-5xl mx-auto space-y-4 pb-40">

          {/* SEARCH */}
          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar paquete..."
              className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white border border-slate-100 text-[11px] font-black text-slate-700 placeholder:text-slate-300 outline-none shadow-sm"
            />
          </div>

          {/* LIST */}
          {ui.loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl">
              <Package2 className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Aún no hay paquetes
              </p>
              <button
                onClick={ui.openNew}
                className="mt-4 text-[10px] font-black text-primary uppercase tracking-widest"
              >
                + Crear el primero
              </button>
            </div>
          ) : (
            <motion.div layout className="space-y-3">
              <AnimatePresence>
                {filtered.map(b => (
                  <BundleRow
                    key={b.id}
                    bundle={b}
                    onEdit={() => ui.openEditOf(b)}
                    onDelete={() => ui.remove(b.id)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </main>

      {/* EDITOR MODAL */}
      <Modal
        open={ui.openEdit}
        title={ui.draft.id ? "Editar Paquete" : "Nuevo Paquete"}
        onClose={() => ui.setOpenEdit(false)}
        size="lg"
      >
        <div className="space-y-6">

          {/* INFO BÁSICA */}
          <div className="space-y-3">
            <input
              value={ui.draft.name}
              onChange={e => ui.setField("name", e.target.value)}
              placeholder="Nombre del paquete (ej. Pack Belleza Total)"
              className="w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-100 text-[12px] font-black outline-none"
            />
            <textarea
              value={ui.draft.description}
              onChange={e => ui.setField("description", e.target.value)}
              placeholder="Descripción (opcional)"
              rows={2}
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-bold outline-none resize-none"
            />
          </div>

          {/* PRECIO + AHORRO */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-1">
                Precio paquete
              </label>
              <div className="relative mt-1">
                <Tag size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" />
                <input
                  type="number"
                  inputMode="decimal"
                  value={ui.draft.price}
                  onChange={e => ui.setField("price", e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className="w-full h-12 pl-10 pr-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-[13px] font-black text-emerald-700 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-1">
                Costo suma
              </label>
              <div className="mt-1 h-12 px-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
                <Calculator size={14} className="text-white/40" />
                <span className="text-[13px] font-black">{money(ui.computedCost)}</span>
              </div>
            </div>
          </div>

          {/* MAYOREO TOGGLE */}
          <label className="flex items-center gap-3 p-4 rounded-2xl bg-pink-50/40 border border-pink-100 cursor-pointer">
            <input
              type="checkbox"
              checked={ui.draft.counts_as_wholesale}
              onChange={e => ui.setField("counts_as_wholesale", e.target.checked)}
              className="w-5 h-5 accent-primary"
            />
            <div className="flex-1">
              <p className="text-[11px] font-black text-slate-800">
                Cuenta sus piezas para mayoreo
              </p>
              <p className="text-[9px] text-slate-500 mt-0.5">
                Suma {ui.computedPieces} pza al carrito para detectar tier
              </p>
            </div>
          </label>

          {/* AHORRO / MARGEN */}
          {draftSavings != null && (
            <div className={`rounded-2xl p-3 text-center border ${
              draftSavings >= 0
                ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                : "bg-rose-50 border-rose-100 text-rose-600"
            }`}>
              <p className="text-[9px] font-black uppercase tracking-widest">
                {draftSavings >= 0 ? "Cliente ahorra" : "Tú pierdes"}
              </p>
              <p className="text-lg font-black">{money(Math.abs(draftSavings))}</p>
            </div>
          )}

          {/* ITEMS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                Productos en el paquete
              </label>
              <button
                onClick={() => { setPickerQ(""); setPickerOpen(true) }}
                className="text-[9px] font-black text-primary uppercase flex items-center gap-1"
              >
                <Plus size={12} /> Agregar
              </button>
            </div>

            {ui.draft.items.length === 0 ? (
              <div className="py-6 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                <Layers className="mx-auto mb-2 text-slate-300" size={20} />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Aún sin productos
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {ui.draft.items.map(it => {
                  const v = ui.catalog.find(c => c.id === it.variant_id)
                  if (!v) return null
                  return (
                    <div key={it.variant_id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-800 truncate">{v.product.name}</p>
                        <p className="text-[9px] text-slate-400 truncate">{v.variant_name}</p>
                      </div>

                      <div className="flex items-center bg-white border border-slate-100 rounded-xl">
                        <button
                          onClick={() => ui.updateItemQty(it.variant_id, it.qty - 1)}
                          className="px-2 py-1 text-slate-400"
                        >−</button>
                        <span className="w-7 text-center text-[10px] font-black">{it.qty}</span>
                        <button
                          onClick={() => ui.updateItemQty(it.variant_id, it.qty + 1)}
                          className="px-2 py-1 text-slate-400"
                        >+</button>
                      </div>

                      <button
                        onClick={() => ui.removeItem(it.variant_id)}
                        className="text-rose-400 p-1"
                      ><Trash2 size={14} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => ui.setOpenEdit(false)} className="flex-1 h-12 rounded-2xl text-[10px]">
              Cancelar
            </Button>
            <Button onClick={ui.save} className="flex-[2] h-12 rounded-2xl bg-slate-900 text-white text-[10px]">
              {ui.draft.id ? "Guardar cambios" : "Crear paquete"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* PICKER MODAL */}
      <Modal
        open={pickerOpen}
        title="Agregar producto al paquete"
        onClose={() => setPickerOpen(false)}
      >
        <div className="space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              autoFocus
              value={pickerQ}
              onChange={e => setPickerQ(e.target.value)}
              placeholder="Buscar producto o variante..."
              className="w-full h-11 pl-10 pr-4 rounded-2xl bg-slate-50 border border-slate-100 text-[11px] font-black outline-none"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
            {availableCatalog.length === 0 && (
              <p className="text-center text-[10px] text-slate-400 py-6">
                No hay más productos disponibles
              </p>
            )}

            {availableCatalog.map(v => (
              <button
                key={v.id}
                onClick={() => { ui.addItem(v.id); setPickerOpen(false) }}
                className="w-full flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl active:scale-[0.98] transition-all"
              >
                <div className="text-left min-w-0">
                  <p className="text-[10px] font-black text-slate-800 truncate">{v.product.name}</p>
                  <p className="text-[9px] text-slate-400 truncate">{v.variant_name} · {money(v.effective_cost ?? 0)}</p>
                </div>
                <Check size={14} className="text-primary" />
              </button>
            ))}
          </div>

          <Button variant="ghost" onClick={() => setPickerOpen(false)} className="w-full h-11 rounded-2xl text-[10px]">
            <X size={14} /> Cerrar
          </Button>
        </div>
      </Modal>
    </div>
  )
}

/* ─────────────── Bundle Row ─────────────── */
function BundleRow({
  bundle, onEdit, onDelete,
}: {
  bundle: Bundle
  onEdit: () => void
  onDelete: () => void
}) {
  const items = bundle.items ?? []
  const totalPieces = items.reduce((a, i) => a + i.qty, 0)
  const sumCost = items.reduce((a, i) => {
    const v: any = i.variant
    const c = Number(v?.cost_override ?? v?.product?.cost ?? 0)
    return a + c * i.qty
  }, 0)
  const ahorro = sumCost - Number(bundle.price)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-900">{bundle.name}</h3>
          {bundle.description && (
            <p className="text-[10px] text-slate-400 truncate">{bundle.description}</p>
          )}
          <div className="flex gap-1 mt-2">
            <Badge tone="primary" className="text-[8px]">{items.length} prod.</Badge>
            <Badge tone="neutral" className="text-[8px]">{totalPieces} pz</Badge>
            {bundle.counts_as_wholesale && (
              <Badge tone="ok" className="text-[8px]">Mayoreo</Badge>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
            <Edit3 size={14} />
          </button>
          <button onClick={onDelete} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 hover:text-rose-500 flex items-center justify-center">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Precio" value={money(bundle.price)} tone="primary" />
        <Stat label="Costo" value={money(sumCost)} />
        <Stat
          label={ahorro >= 0 ? "Ahorro" : "Pérdida"}
          value={money(Math.abs(ahorro))}
          tone={ahorro >= 0 ? "emerald" : "rose"}
        />
      </div>
    </motion.div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "primary" | "emerald" | "rose" }) {
  const map = {
    primary: "bg-primary/5 text-primary border-primary/10",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    rose:    "bg-rose-50 text-rose-600 border-rose-100",
  } as const
  const cls = tone ? map[tone] : "bg-slate-50 text-slate-700 border-slate-100"
  return (
    <div className={`rounded-xl border p-2 text-center ${cls}`}>
      <p className="text-[8px] font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="text-[11px] font-black mt-0.5">{value}</p>
    </div>
  )
}

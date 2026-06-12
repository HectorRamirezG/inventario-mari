import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bookmark,
  Phone,
  MapPin,
  Wallet,
  XCircle,
  RefreshCcw,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  Receipt,
} from "lucide-react";

import { useApartados, type ApartadosFilter } from "./useApartados";
import PaymentModal from "./PaymentModal";
import Badge from "../../components/ui/Badge";
import type { Sale } from "../../types/database";
import { sendReceiptByWhatsApp } from "../../lib/receipt";

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  }).format(n || 0);

const dateFmt = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const daysSince = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

const cleanPhone = (raw?: string | null) =>
  (raw ?? "").replace(/[^\d]/g, "");

const waLink = (raw?: string | null) => {
  const p = cleanPhone(raw);
  if (!p) return null;
  // Asume MX (+52) si no trae código país
  return `https://wa.me/${p.length === 10 ? "52" + p : p}`;
};

const FILTERS: { id: ApartadosFilter; label: string; tone: string }[] = [
  { id: "pending", label: "Pendientes", tone: "text-rose-500" },
  { id: "paid", label: "Pagados", tone: "text-emerald-500" },
  { id: "all", label: "Todos", tone: "text-slate-500" },
];

export default function ApartadosPage() {
  const { state, actions } = useApartados();
  const [selected, setSelected] = useState<Sale | null>(null);

  return (
    <div className="px-3 pt-1 pb-28 max-w-5xl mx-auto">
      {/* HEADER */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-slate-900">
            <Bookmark size={14} className="text-amber-500" fill="currentColor" />
            Apartados & Cobros
          </h2>
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mt-1">
            {state.totals.count}{" "}
            {state.totals.count === 1 ? "venta" : "ventas"} ·{" "}
            <span className="text-rose-500">
              {money(state.totals.balance)} por cobrar
            </span>
          </p>
        </div>
        <button
          onClick={actions.refresh}
          className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-primary active:scale-90 transition-transform"
        >
          <RefreshCcw size={16} className={state.loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Kpi label="Por cobrar" value={money(state.totals.balance)} tone="rose" />
        <Kpi label="Cobrado" value={money(state.totals.paid)} tone="emerald" />
        <Kpi label="Total" value={money(state.totals.total)} tone="slate" />
      </div>

      {/* CONTROLES */}
      <div className="mb-3 space-y-2">
        {/* Buscador */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
          />
          <input
            type="text"
            placeholder="Buscar cliente o teléfono..."
            value={state.search}
            onChange={(e) => actions.setSearch(e.target.value)}
            className="w-full h-11 pl-11 pr-4 rounded-2xl bg-white border border-slate-100 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-full p-1 flex-1">
            {FILTERS.map((f) => {
              const active = state.filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => actions.setFilter(f.id)}
                  className={`relative flex-1 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors ${
                    active ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="apartados-filter"
                      className="absolute inset-0 bg-white shadow-sm rounded-full"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <span className="relative z-10">{f.label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => actions.setOnlyLayaway(!state.onlyLayaway)}
            className={`shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest border transition-all ${
              state.onlyLayaway
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-white border-slate-100 text-slate-400"
            }`}
          >
            <Bookmark
              size={11}
              fill={state.onlyLayaway ? "currentColor" : "none"}
            />
            Solo apartados
          </button>
        </div>
      </div>

      {/* LISTADO */}
      {state.loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-slate-100/60 animate-pulse"
            />
          ))}
        </div>
      ) : state.sales.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl">
          <CheckCircle2 className="mx-auto mb-2 text-slate-300" size={32} />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Sin resultados
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {state.sales.map((sale) => (
              <SaleCard
                key={sale.id}
                sale={sale}
                onPay={() => setSelected(sale)}
                onCancel={() => actions.handleCancelSale(sale.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <PaymentModal
        open={!!selected}
        sale={selected}
        onClose={() => setSelected(null)}
        onPay={actions.handleAddPayment}
      />
    </div>
  );
}

/* ---------- Sub-componentes ---------- */

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "emerald" | "slate";
}) {
  const toneClasses = {
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    slate: "bg-white text-slate-700 border-slate-100",
  };
  return (
    <div className={`rounded-2xl p-3 border ${toneClasses[tone]}`}>
      <p className="text-[7px] font-black uppercase tracking-widest opacity-70">
        {label}
      </p>
      <p className="text-sm font-black tabular-nums mt-1">{value}</p>
    </div>
  );
}

function SaleCard({
  sale,
  onPay,
  onCancel,
}: {
  sale: Sale;
  onPay: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const balance = Number(sale.balance) || 0;
  const total = Number(sale.total) || 1;
  const progress = Math.min(
    100,
    Math.max(0, ((Number(sale.paid) || 0) / total) * 100)
  );
  const isPaid = sale.status === "paid";
  const isCancelled = sale.status === "cancelled";
  const days = daysSince(sale.created_at);
  const wa = waLink(sale.customer_phone);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`bg-white rounded-2xl border p-4 shadow-sm relative overflow-hidden ${
        isCancelled
          ? "border-slate-100 opacity-60"
          : isPaid
          ? "border-emerald-100"
          : "border-slate-100"
      }`}
    >
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-[12px] font-black text-slate-900 truncate">
              {sale.customer_name ?? "Sin cliente"}
            </p>
            {sale.is_layaway && (
              <Badge
                tone="warn"
                className="text-[8px] px-2 py-0 rounded-full font-black"
              >
                APARTADO
              </Badge>
            )}
            {isPaid && (
              <Badge
                tone="ok"
                className="text-[8px] px-2 py-0 rounded-full font-black"
              >
                PAGADO
              </Badge>
            )}
            {isCancelled && (
              <Badge
                tone="bad"
                className="text-[8px] px-2 py-0 rounded-full font-black"
              >
                CANCELADO
              </Badge>
            )}
          </div>
          <p className="text-[8px] font-bold text-slate-400 flex items-center gap-1">
            <Clock size={9} />
            {dateFmt.format(new Date(sale.created_at))}
            {!isPaid && !isCancelled && days >= 7 && (
              <span className="ml-2 text-rose-500 font-black flex items-center gap-1">
                <AlertTriangle size={9} />
                {days} días
              </span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[8px] font-black uppercase text-slate-400">
            Saldo
          </p>
          <p
            className={`text-sm font-black tabular-nums ${
              balance > 0 ? "text-rose-500" : "text-emerald-600"
            }`}
          >
            {money(balance)}
          </p>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
          <span>
            {money(sale.paid)} / {money(sale.total)}
          </span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`h-full ${
              isPaid ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
        </div>
      </div>

      {/* Contactos rápidos */}
      <div className="flex flex-wrap gap-2 mb-3">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100"
          >
            <MessageCircle size={10} /> WhatsApp
          </a>
        )}
        {sale.customer_phone && (
          <a
            href={`tel:${cleanPhone(sale.customer_phone)}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 text-[9px] font-black uppercase tracking-widest hover:bg-slate-100"
          >
            <Phone size={10} /> {sale.customer_phone}
          </a>
        )}
        {sale.customer_location && (
          <a
            href={sale.customer_location}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[9px] font-black uppercase tracking-widest hover:bg-blue-100"
          >
            <MapPin size={10} /> Ubicación
          </a>
        )}
      </div>

      {sale.customer_address && (
        <p className="text-[9px] font-bold text-slate-500 mb-2 italic">
          📍 {sale.customer_address}
        </p>
      )}

      {sale.notes && (
        <p className="text-[9px] font-bold text-slate-500 mb-2 italic">
          💬 {sale.notes}
        </p>
      )}

      {/* Detalle expandible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-2"
      >
        {expanded ? "▲ Ocultar detalle" : `▼ Ver detalle (${sale.sale_items?.length ?? 0} items · ${sale.payments?.length ?? 0} pagos)`}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3 space-y-3"
          >
            {/* Items */}
            {sale.sale_items && sale.sale_items.length > 0 && (
              <div>
                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">
                  Productos
                </p>
                <div className="space-y-1">
                  {sale.sale_items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between text-[10px] bg-slate-50 rounded-lg px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <span className="font-black">{it.qty}×</span>{" "}
                        <span className="text-slate-700">
                          {it.product_name}
                          {it.variant_name && (
                            <span className="text-slate-400">
                              {" "}
                              · {it.variant_name}
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="font-black tabular-nums shrink-0">
                        {money(it.qty * it.unit_price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pagos */}
            {sale.payments && sale.payments.length > 0 && (
              <div>
                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">
                  Historial de pagos
                </p>
                <div className="space-y-1">
                  {sale.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between text-[10px] bg-emerald-50 rounded-lg px-2 py-1.5"
                    >
                      <span className="text-slate-600">
                        {dateFmt.format(new Date(p.created_at))}{" "}
                        <span className="text-slate-400 uppercase text-[8px] font-black">
                          {p.method ?? "efectivo"}
                        </span>
                      </span>
                      <span className="font-black tabular-nums text-emerald-700">
                        +{money(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Acciones */}
      {!isCancelled && (
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          {balance > 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onPay}
              className="flex-1 h-10 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom"
            >
              <Wallet size={12} /> Abonar
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => sendReceiptByWhatsApp(sale)}
            className="h-10 px-3 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-emerald-100 transition-colors"
            title="Enviar recibo por WhatsApp"
          >
            <Receipt size={12} /> Recibo
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onCancel}
            className="h-10 px-3 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
          >
            <XCircle size={12} /> Cancelar
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

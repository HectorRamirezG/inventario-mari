import { useEffect, useState } from "react";
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
  Printer,
  SlidersHorizontal,
} from "lucide-react";

import { useApartados, type ApartadosFilter } from "./useApartados";
import PaymentModal from "./PaymentModal";
import EditSaleAdjustModal from "./EditSaleAdjustModal";
import TicketView from "../../components/ui/TicketView";
import Badge from "../../components/ui/Badge";
import type { Sale } from "../../types/database";
import { sendReceiptByWhatsApp } from "../../lib/receipt";
import {
  formatMoney,
  formatDateTime,
  daysSince,
  cleanPhone,
  intlPhone,
} from "../../lib/format";
import {
  fetchProfilesByEmails,
  type UserProfileDetail,
} from "../profile/profileService";

const waLink = (raw?: string | null) => {
  const p = intlPhone(raw);
  return p ? `https://wa.me/${p}` : null;
};

const FILTERS: { id: ApartadosFilter; label: string; tone: string }[] = [
  { id: "pending", label: "Pendientes", tone: "text-rose-500" },
  { id: "paid", label: "Pagados", tone: "text-emerald-500" },
  { id: "all", label: "Todos", tone: "text-slate-500" },
];

export default function ApartadosPage() {
  const { state, actions } = useApartados();
  const [selected, setSelected] = useState<Sale | null>(null);
  const [ticketSale, setTicketSale] = useState<Sale | null>(null);
  const [adjustSale, setAdjustSale] = useState<Sale | null>(null);
  const [profiles, setProfiles] = useState<Record<string, UserProfileDetail>>({});

  // Carga lazy de avatars de clientes cuando cambian las ventas mostradas
  useEffect(() => {
    const emails = state.sales
      .map((s) => s.customer_email)
      .filter((e): e is string => !!e)
      .map((e) => e.toLowerCase());
    if (emails.length === 0) return;
    let alive = true;
    fetchProfilesByEmails(emails).then((map) => {
      if (alive) setProfiles((prev) => ({ ...prev, ...map }));
    });
    return () => {
      alive = false;
    };
  }, [state.sales]);

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
              {formatMoney(state.totals.balance)} por cobrar
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
        <Kpi label="Por cobrar" value={formatMoney(state.totals.balance)} tone="rose" />
        <Kpi label="Cobrado" value={formatMoney(state.totals.paid)} tone="emerald" />
        <Kpi label="Total" value={formatMoney(state.totals.total)} tone="slate" />
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
                profile={
                  sale.customer_email
                    ? profiles[sale.customer_email.toLowerCase()]
                    : undefined
                }
                hasPendingProof={state.pendingProofIds.has(sale.id)}
                onPay={() => setSelected(sale)}
                onTicket={() => setTicketSale(sale)}
                onAdjust={() => setAdjustSale(sale)}
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

      <TicketView
        open={!!ticketSale}
        sale={ticketSale}
        onClose={() => setTicketSale(null)}
      />

      <EditSaleAdjustModal
        open={!!adjustSale}
        sale={adjustSale}
        onClose={() => setAdjustSale(null)}
        onSaved={actions.refresh}
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
  profile,
  hasPendingProof,
  onPay,
  onTicket,
  onAdjust,
  onCancel,
}: {
  sale: Sale;
  profile?: UserProfileDetail;
  hasPendingProof?: boolean;
  onPay: () => void;
  onTicket: () => void;
  onAdjust: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const balance = Number(sale.balance) || 0;
  const total = Number(sale.total) || 1;
  const paidAmt = Number(sale.paid) || 0;
  const progress = Math.min(100, Math.max(0, (paidAmt / total) * 100));
  const isPaid = sale.status === "paid";
  const isCancelled = sale.status === "cancelled";
  const isLayaway = !!sale.is_layaway;
  const days = daysSince(sale.created_at);
  const wa = waLink(sale.customer_phone);

  // Vencimiento: usa apartado_due_date si existe, si no, asume 30 días.
  const dueDate = (() => {
    if (sale.apartado_due_date) return new Date(sale.apartado_due_date);
    const d = new Date(sale.created_at);
    d.setDate(d.getDate() + 30);
    return d;
  })();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  const overdue = daysLeft < 0;
  const urgent = !isPaid && !isCancelled && isLayaway && daysLeft <= 3;

  // Abono sugerido = saldo / días restantes (mínimo 1)
  const suggestedPayment =
    !isPaid && !isCancelled && balance > 0
      ? Math.max(50, Math.round(balance / Math.max(1, daysLeft)))
      : 0;

  // Iniciales del cliente para avatar
  const initials = (sale.customer_name ?? "??")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  // Semáforo: verde = comprobante esperando revisión / rosa-rojo = urgente /
  // ámbar = próximo a vencer / primary = normal / gris = vencido sin actividad
  const barColor = isPaid
    ? "bg-emerald-500"
    : hasPendingProof
    ? "bg-emerald-500"     // 🟢 cliente subió comprobante — atenderlo
    : overdue
    ? "bg-slate-400"       // ⚫ vencido sin movimiento
    : urgent
    ? "bg-rose-500"        // 🔴 vence pronto
    : daysLeft <= 7
    ? "bg-amber-500"       // 🟡 vence en menos de una semana
    : "bg-primary";        // 🟣 activo normal

  const cardBg = isCancelled
    ? "bg-slate-50 dark:bg-slate-900 opacity-60"
    : isPaid
    ? "bg-emerald-50/40 dark:bg-emerald-500/5"
    : urgent
    ? "bg-rose-50/40 dark:bg-rose-500/5"
    : "bg-white dark:bg-slate-900/60";

  const cardRing = isCancelled
    ? "border-slate-100 dark:border-slate-800"
    : isPaid
    ? "border-emerald-200 dark:border-emerald-500/30"
    : urgent
    ? "border-rose-200 dark:border-rose-500/30"
    : "border-slate-100 dark:border-slate-800";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`relative rounded-2xl border p-4 shadow-sm overflow-hidden transition-colors ${cardBg} ${cardRing}`}
    >
      {/* Stamp PAGADO (gigante de fondo) */}
      {isPaid && (
        <div className="pointer-events-none absolute -right-6 -top-2 rotate-12 select-none">
          <div className="text-[44px] font-black text-emerald-500/15 tracking-tighter leading-none">
            PAGADO
          </div>
        </div>
      )}

      {/* Cabecera */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar (foto del cliente si tiene perfil, sino iniciales) */}
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={sale.customer_name ?? ""}
            className="w-11 h-11 rounded-2xl object-cover shrink-0 shadow-sm ring-2 ring-white dark:ring-slate-800"
            loading="lazy"
          />
        ) : (
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm"
            style={{
              background: isPaid
                ? "linear-gradient(135deg,#10b981,#34d399)"
                : urgent
                ? "linear-gradient(135deg,#ef4444,#fb7185)"
                : "linear-gradient(135deg,#e6007e,#a855f7)",
            }}
          >
            {initials || "??"}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p className="text-[13px] font-black text-slate-900 dark:text-slate-100 truncate">
              {sale.customer_name ?? "Sin cliente"}
            </p>
            {isLayaway && !isPaid && !isCancelled && (
              <Badge tone="warn" className="text-[8px] px-1.5 py-0 rounded-full font-black">
                APARTADO
              </Badge>
            )}
            {hasPendingProof && !isPaid && !isCancelled && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex items-center gap-1 px-2 py-0 rounded-full bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest shadow-sm animate-pulse"
                title="El cliente subió un comprobante esperando validación"
              >
                💸 Comprobante
              </motion.span>
            )}
            {isPaid && (
              <Badge tone="ok" className="text-[8px] px-1.5 py-0 rounded-full font-black">
                ✓ PAGADO
              </Badge>
            )}
            {isCancelled && (
              <Badge tone="bad" className="text-[8px] px-1.5 py-0 rounded-full font-black">
                CANCELADO
              </Badge>
            )}
          </div>
          <p className="text-[9px] font-bold text-slate-400 flex items-center gap-1 flex-wrap">
            <Clock size={9} /> {formatDateTime(sale.created_at)}
            {isLayaway && !isPaid && !isCancelled && (
              <span
                className={`ml-1 font-black flex items-center gap-1 ${
                  urgent
                    ? "text-rose-600 dark:text-rose-400"
                    : daysLeft <= 7
                    ? "text-amber-600"
                    : "text-slate-500"
                }`}
              >
                {overdue ? (
                  <>
                    <AlertTriangle size={9} /> Venció hace {Math.abs(daysLeft)} d
                  </>
                ) : (
                  <>· Vence en {daysLeft} {daysLeft === 1 ? "día" : "días"}</>
                )}
              </span>
            )}
            {!isLayaway && days >= 7 && !isPaid && !isCancelled && (
              <span className="ml-1 text-rose-500 font-black flex items-center gap-1">
                <AlertTriangle size={9} /> {days} días sin cobrar
              </span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-[8px] font-black uppercase text-slate-400">Saldo</p>
          <p
            className={`text-base font-black tabular-nums leading-none ${
              balance > 0
                ? urgent
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-900 dark:text-slate-100"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {formatMoney(balance)}
          </p>
          <p className="text-[8px] font-bold text-slate-400 mt-0.5">
            de {formatMoney(total)}
          </p>
        </div>
      </div>

      {/* Barra de progreso con marca de meta */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">
          <span>
            {formatMoney(paidAmt)} <span className="text-slate-300">/</span>{" "}
            {formatMoney(total)}
          </span>
          <span className={isPaid ? "text-emerald-600" : "text-slate-500"}>
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`absolute inset-y-0 left-0 ${barColor}`}
          />
          {/* Marcas de los pagos */}
          {(sale.payments ?? []).map((p, i) => {
            // Posición acumulada de cada pago en la barra
            const sumBefore = (sale.payments ?? [])
              .slice(0, i + 1)
              .reduce((acc, pp) => acc + (Number(pp.amount) || 0), 0);
            const pct = Math.min(100, (sumBefore / total) * 100);
            return (
              <div
                key={p.id}
                className="absolute top-0 bottom-0 w-px bg-white/80 dark:bg-slate-100/40"
                style={{ left: `${pct}%` }}
              />
            );
          })}
        </div>
      </div>

      {/* Abono sugerido (solo si hay saldo) */}
      {suggestedPayment > 0 && isLayaway && (
        <div className="mb-3 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/10">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet size={12} className="text-primary shrink-0" />
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">
              Abono sugerido para no atrasarse:
            </p>
          </div>
          <p className="text-xs font-black text-primary tabular-nums shrink-0">
            {formatMoney(suggestedPayment)}
          </p>
        </div>
      )}

      {/* Contactos rápidos */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100"
          >
            <MessageCircle size={10} /> WhatsApp
          </a>
        )}
        {sale.customer_phone && (
          <a
            href={`tel:${cleanPhone(sale.customer_phone)}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-black uppercase tracking-widest"
          >
            <Phone size={10} /> {sale.customer_phone}
          </a>
        )}
        {sale.customer_location && (
          <a
            href={sale.customer_location}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[9px] font-black uppercase tracking-widest hover:bg-blue-100"
          >
            <MapPin size={10} /> Pin
          </a>
        )}
      </div>

      {sale.customer_address && (
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 italic">
          📍 {sale.customer_address}
        </p>
      )}

      {sale.notes && (
        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2 italic">
          💬 {sale.notes}
        </p>
      )}

      {/* Detalle expandible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-2"
      >
        {expanded
          ? "▲ Ocultar detalle"
          : `▼ Ver detalle (${sale.sale_items?.length ?? 0} items · ${
              sale.payments?.length ?? 0
            } pagos)`}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3 space-y-3"
          >
            {sale.sale_items && sale.sale_items.length > 0 && (
              <div>
                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">
                  Productos
                </p>
                <div className="space-y-1">
                  {sale.sale_items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between text-[10px] bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <span className="font-black">{it.qty}×</span>{" "}
                        <span className="text-slate-700 dark:text-slate-300">
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
                        {formatMoney(it.qty * it.unit_price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline de pagos */}
            {sale.payments && sale.payments.length > 0 && (
              <div>
                <p className="text-[8px] font-black uppercase text-slate-400 mb-1">
                  Historial de pagos
                </p>
                <div className="relative pl-3 border-l-2 border-emerald-200 dark:border-emerald-500/30 space-y-1.5">
                  {sale.payments.map((p) => (
                    <div key={p.id} className="relative">
                      <span className="absolute -left-[14px] top-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-500/20" />
                      <div className="flex items-center justify-between text-[10px] bg-emerald-50/70 dark:bg-emerald-500/10 rounded-lg px-2 py-1.5">
                        <span className="text-slate-600 dark:text-slate-300">
                          {formatDateTime(p.created_at)}{" "}
                          <span className="text-slate-400 uppercase text-[8px] font-black">
                            {p.method ?? "efectivo"}
                          </span>
                        </span>
                        <span className="font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                          +{formatMoney(p.amount)}
                        </span>
                      </div>
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
        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {balance > 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onPay}
              className={`flex-1 h-10 rounded-xl text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom ${
                urgent ? "" : ""
              }`}
              style={{
                background: urgent
                  ? "linear-gradient(135deg,#ef4444,#f43f5e)"
                  : "linear-gradient(135deg,#e6007e,#a855f7)",
              }}
            >
              <Wallet size={12} /> {urgent ? "Cobrar urgente" : "Abonar"}
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onAdjust}
            className="h-10 px-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            title="Forzar tier / aplicar descuento → notifica al cliente"
          >
            <SlidersHorizontal size={12} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onTicket}
            className="h-10 px-3 rounded-xl bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            title="Ver ticket / imprimir / enviar"
          >
            <Printer size={12} /> Ticket
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => sendReceiptByWhatsApp(sale, profile?.avatar_url)}
            className="h-10 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            title="Enviar recibo por WhatsApp (incluye foto del cliente)"
          >
            <Receipt size={12} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onCancel}
            className="h-10 px-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"
            title="Cancelar venta"
          >
            <XCircle size={12} />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

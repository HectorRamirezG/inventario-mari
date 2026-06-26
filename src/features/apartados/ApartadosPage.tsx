import { useEffect, useState, memo } from "react";
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
  AlertTriangle,
  MessageCircle,
  Receipt,
  Printer,
  SlidersHorizontal,
  Truck,
  MoreHorizontal,
} from "lucide-react";

import { useApartados, type ApartadosFilter } from "./useApartados";
import PaymentModal from "./PaymentModal";
import EditSaleAdjustModal from "./EditSaleAdjustModal";
import TicketView from "../../components/ui/TicketView";
import CreateDeliveryNoteModal from "../delivery/CreateDeliveryNoteModal";
import Badge from "../../components/ui/Badge";
import PageHeader from "../../components/ui/PageHeader";
import KpiCard from "../../components/ui/KpiCard";
import TabBar from "../../components/ui/TabBar";
import { SaleCardSkeleton } from "../../components/ui/Skeletons";
import EmptyStateIllustration from "../../components/ui/EmptyStateIllustration";
import {
  useBusinessRules,
  canCancelSale,
} from "../settings/businessRulesService";
import type { Sale } from "../../types/database";
import { sendReceiptByWhatsApp } from "../../lib/receipt";
import {
  formatMoney,
  formatDateTime,
  daysSince,
  cleanPhone,
  intlPhone,
} from "../../lib/format";
import { extractLatLng } from "../../lib/geocoding";
import { MapThumbnail } from "../../components/ui/MapThumbnail";
import { imageAvatar } from "../../lib/imageTransform";
import {
  fetchProfilesByEmails,
  type UserProfileDetail,
} from "../profile/profileService";
import { fetchCustomerStatsByEmails, type CustomerStat } from "./customerStatsService";
import RfmBadge from "../../components/ui/RfmBadge";
import DeliveryStatusChip from "../../components/ui/DeliveryStatusChip";
import WhatsAppTemplateMenu from "./WhatsAppTemplateMenu";

const waLink = (raw?: string | null) => {
  const p = intlPhone(raw);
  return p ? `https://wa.me/${p}` : null;
};

const FILTERS: { id: ApartadosFilter; label: string; tone: string }[] = [
  { id: "all", label: "Todos", tone: "text-slate-500" },
  { id: "pending", label: "Pendientes", tone: "text-rose-500" },
  { id: "paid", label: "Pagados", tone: "text-emerald-500" },
];

export default function ApartadosPage() {
  const { state, actions } = useApartados();
  const [selected, setSelected] = useState<Sale | null>(null);
  const [ticketSale, setTicketSale] = useState<Sale | null>(null);
  const [adjustSale, setAdjustSale] = useState<Sale | null>(null);
  const [deliverySale, setDeliverySale] = useState<Sale | null>(null);
  const [profiles, setProfiles] = useState<Record<string, UserProfileDetail>>({});
  const [customerStats, setCustomerStats] = useState<Record<string, CustomerStat>>({});
  /** ID de venta que llega vía notificación → la resaltamos visualmente
   *  por unos segundos y hacemos scroll para que sea fácil de ubicar. */
  const [highlightedSaleId, setHighlightedSaleId] = useState<string | null>(null);

  // Escuchar request de "abrir/resaltar una venta específica" desde
  // notificaciones. Funciona si la sale ya está en la lista; si todavía
  // no llega del realtime, reintenta una vez después de 500ms.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const saleId = detail?.saleId as string | undefined
      if (!saleId) return
      setHighlightedSaleId(saleId)
      // Scroll a la card una vez pintada
      requestAnimationFrame(() => {
        const node = document.getElementById(`apartado-${saleId}`)
        if (node) {
          node.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      })
      // Auto-clear del highlight tras 3.5s
      window.setTimeout(() => {
        setHighlightedSaleId((prev) => (prev === saleId ? null : prev))
      }, 3500)
    }
    window.addEventListener("apartados:highlight-sale", handler)
    return () => window.removeEventListener("apartados:highlight-sale", handler)
  }, [])

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
    fetchCustomerStatsByEmails(emails).then((map) => {
      if (alive) setCustomerStats((prev) => ({ ...prev, ...map }));
    });
    return () => {
      alive = false;
    };
  }, [state.sales]);

  const rules = useBusinessRules();

  return (
    <div className="px-3 pt-1 pb-28 max-w-5xl mx-auto">
      {/* HEADER limpio sin orbes decorativos (saturaban en mobile).
          Subtitle compacto que muta con el filtro activo. */}
      <PageHeader
        icon={Bookmark}
        iconTone="primary"
        title="Apartados & Cobros"
        subtitle={`${state.totals.count} ${
          state.totals.count === 1 ? "venta" : "ventas"
        }${
          state.totals.balance > 0
            ? ` · ${formatMoney(state.totals.balance)} por cobrar`
            : " · al día"
        }`}
        right={
          <button
            onClick={actions.refresh}
            aria-label="Refrescar"
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center text-primary active:scale-90 transition-all hover:shadow-md"
          >
            <RefreshCcw size={16} className={state.loading ? "animate-spin" : ""} />
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <KpiCard label="Por cobrar" value={formatMoney(state.totals.balance)} tone="danger" />
        <KpiCard label="Cobrado" value={formatMoney(state.totals.paid)} tone="success" />
        <KpiCard label="Total" value={formatMoney(state.totals.total)} tone="default" />
      </div>

      {/* CONTROL ROW — buscador, filtros y 'Solo apartados' en
          una secuencia visual mas compacta y ordenada. */}
      <div className="mb-3 space-y-2">
        {/* Buscador */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Buscar cliente o teléfono..."
            value={state.search}
            onChange={(e) => actions.setSearch(e.target.value)}
            className="field-input h-11 pl-11"
          />
        </div>

        {/* Filtros + 'Solo apartados' como toggle pill compacto en la
            misma fila para mantener jerarquia. En mobile el toggle
            queda mas chico al lado del TabBar scrolleable. */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <TabBar
              tabs={FILTERS.map((f) => ({ id: f.id, label: f.label })) as any}
              active={state.filter}
              onChange={(id) => actions.setFilter(id as ApartadosFilter)}
              layoutId="apartados-filter"
            />
          </div>

          <button
            onClick={() => actions.setOnlyLayaway(!state.onlyLayaway)}
            aria-pressed={state.onlyLayaway}
            title={state.onlyLayaway ? "Mostrando solo apartados" : "Solo apartados (filtro)"}
            className={`shrink-0 h-10 px-3 rounded-full flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest border transition-all ${
              state.onlyLayaway
                ? "bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 shadow-sm"
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500"
            }`}
          >
            <Bookmark
              size={11}
              fill={state.onlyLayaway ? "currentColor" : "none"}
            />
            <span className="hidden sm:inline">Solo apartados</span>
            <span className="sm:hidden">Aparts</span>
          </button>
        </div>
      </div>

      {/* LISTADO */}
      {state.loading ? (
        <SaleCardSkeleton count={4} />
      ) : state.sales.length === 0 ? (
        <EmptyStateIllustration
          variant="no-orders"
          title={
            state.filter === "paid"
              ? "Sin ventas pagadas"
              : state.filter === "pending"
              ? "Sin saldos pendientes"
              : "Sin apartados ni ventas"
          }
          subtitle={
            state.search
              ? "No encontramos coincidencias con tu búsqueda"
              : state.filter === "pending"
              ? "¡Excelente! Todas las ventas están cobradas."
              : "Cuando registres una venta o un apartado aparecerá aquí."
          }
        />
      ) : (
        <div className="space-y-2 stagger-list">
          <AnimatePresence mode="popLayout">
            {state.sales.map((sale) => {
              const stat = sale.customer_email
                ? customerStats[sale.customer_email.toLowerCase()]
                : undefined
              const isVip = stat?.tier === "vip"
              return (
                <SaleCard
                  key={sale.id}
                  sale={sale}
                  profile={
                    sale.customer_email
                      ? profiles[sale.customer_email.toLowerCase()]
                      : undefined
                  }
                  stats={stat}
                  hasPendingProof={state.pendingProofIds.has(sale.id)}
                  deliveryStatus={state.deliveryStatusBySale[sale.id] ?? null}
                  cancelGuard={canCancelSale(rules, sale, { isVip })}
                  highlighted={highlightedSaleId === sale.id}
                  onPay={() => setSelected(sale)}
                  onTicket={() => setTicketSale(sale)}
                  onAdjust={() => setAdjustSale(sale)}
                  onDelivery={() => setDeliverySale(sale)}
                  onCancel={() => actions.handleCancelSale(sale.id)}
                />
              )
            })}
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

      <CreateDeliveryNoteModal
        open={!!deliverySale}
        sale={deliverySale}
        onClose={() => setDeliverySale(null)}
      />
    </div>
  );
}

/* ---------- Sub-componentes ---------- */

/**
 * Memorizado con comparador shallow + chequeo del id y de los campos
 * que realmente disparan re-render (status, balance, paid). Cuando el
 * usuario cambia filtros o tipea en search, las tarjetas que no
 * cambiaron de datos no vuelven a renderizar — sube de 200ms a <16ms
 * el coste de re-render en grids grandes.
 */
const SaleCard = memo(function SaleCardImpl({
  sale,
  profile,
  stats,
  hasPendingProof,
  deliveryStatus,
  cancelGuard,
  highlighted = false,
  onPay,
  onTicket,
  onAdjust,
  onDelivery,
  onCancel,
}: {
  sale: Sale;
  profile?: UserProfileDetail;
  stats?: CustomerStat;
  hasPendingProof?: boolean;
  /** Status de la comanda más reciente (si existe). */
  deliveryStatus?: string | null;
  cancelGuard?: { allowed: boolean; reason?: string };
  /** Highlight pulse temporal cuando se navega desde notificación. */
  highlighted?: boolean;
  onPay: () => void;
  onTicket: () => void;
  onAdjust: () => void;
  onDelivery: () => void;
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

  // Teléfono efectivo del cliente:
  // 1) Si tiene perfil registrado y el perfil trae teléfono, ese gana —
  //    refleja el dato más actualizado (el cliente pudo corregir el que
  //    capturó al apartar).
  // 2) Si no hay perfil o el perfil no tiene teléfono, usamos el snapshot
  //    que quedó en la venta (sale.customer_phone).
  const profilePhone = (profile?.phone ?? "").trim();
  const salePhone = (sale.customer_phone ?? "").trim();
  const effectivePhone = profilePhone || salePhone || null;
  // Marca de "número actualizado en perfil" cuando difiere del snapshot.
  const phoneWasUpdated =
    !!profilePhone &&
    !!salePhone &&
    cleanPhone(profilePhone) !== cleanPhone(salePhone);
  const wa = waLink(effectivePhone);

  // Vencimiento: la DB no guarda fecha límite explícita, así que asumimos
  // plazo estándar de 30 días desde created_at (consistente con las
  // comunicaciones al cliente).
  const dueDate = (() => {
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
    ? "bg-emerald-50 dark:bg-emerald-500/10"
    : urgent
    ? "bg-rose-50 dark:bg-rose-500/10"
    : "bg-white dark:bg-slate-900";

  const cardRing = isCancelled
    ? "border-slate-200 dark:border-slate-800"
    : isPaid
    ? "border-emerald-200 dark:border-emerald-500/40"
    : urgent
    ? "border-rose-200 dark:border-rose-500/40"
    : "border-slate-200 dark:border-slate-800";

  return (
    <motion.div
      id={`apartado-${sale.id}`}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`relative rounded-2xl border p-3.5 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${cardBg} ${cardRing} ${
        highlighted
          ? "ring-4 ring-primary/40 ring-offset-2 ring-offset-white dark:ring-offset-slate-950 animate-pulse"
          : ""
      } ${
        isPaid
          ? "border-l-4 border-l-emerald-500"
          : urgent
          ? "border-l-4 border-l-rose-500"
          : isLayaway && daysLeft <= 7 && !isCancelled
          ? "border-l-4 border-l-amber-500"
          : ""
      }`}
    >
      {/* Cabecera */}
      <div className="flex items-start gap-3 mb-2.5">
        {/* Avatar (foto del cliente si tiene perfil, sino iniciales) */}
        {profile?.avatar_url ? (
          <img
            src={imageAvatar(profile.avatar_url) || profile.avatar_url}
            alt={sale.customer_name ?? ""}
            className="w-11 h-11 rounded-2xl object-cover shrink-0 shadow-sm ring-2 ring-white dark:ring-slate-800"
            loading="lazy"
            decoding="async"
            width={44}
            height={44}
          />
        ) : (
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm"
            style={{
              background: isPaid
                ? "linear-gradient(135deg,#10b981,#34d399)"
                : urgent
                ? "linear-gradient(135deg,#ef4444,#fb7185)"
                : "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
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
            {stats && <RfmBadge tier={stats.tier} />}
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
            {/* Chip de estatus de comanda (si la venta tiene comanda activa) */}
            {deliveryStatus && (
              <DeliveryStatusChip status={deliveryStatus} size="xs" />
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
        <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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
        {/* Abono sugerido inline al pie de la barra — antes era un
            bloque separado de ~40px. Ahora ahorra vertical y se lee
            como continuación natural del progreso. */}
        {suggestedPayment > 0 && isLayaway && (
          <p className="mt-1 text-[9px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Wallet size={9} className="text-primary" />
            Sugerido para no atrasarse:{" "}
            <span className="font-black text-primary tabular-nums">
              {formatMoney(suggestedPayment)}
            </span>
          </p>
        )}
      </div>

      {/* Contacto rápido — siempre visible (icon-only). Los 3 actions
          que Mari toca 95% del tiempo: WhatsApp, llamar y abrir mapa.
          Cada uno con tooltip; el ancho fijo evita reflow al cambiar
          cantidad de botones. */}
      <div className="flex items-center gap-1.5 mb-2.5">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 px-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-100 press"
            title="Abrir WhatsApp"
          >
            <MessageCircle size={11} /> WA
          </a>
        ) : null}
        {effectivePhone && <WhatsAppTemplateMenu sale={sale} compact />}
        {effectivePhone && (
          <a
            href={`tel:${cleanPhone(effectivePhone)}`}
            className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-100 press"
            title={
              phoneWasUpdated
                ? `Llamar · número actualizado · original: ${salePhone}`
                : `Llamar a ${effectivePhone}`
            }
          >
            <Phone size={12} />
            {phoneWasUpdated && (
              <span className="sr-only">Número actualizado</span>
            )}
          </a>
        )}
        {sale.customer_location && (
          <a
            href={sale.customer_location}
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center hover:bg-blue-100 press"
            title="Abrir ubicación en mapas"
          >
            <MapPin size={12} />
          </a>
        )}
        {/* "Más" — abre la sección que antes estaba siempre expandible.
            Ahora oculta a primera vista para limpiar la card. */}
        {(sale.customer_address || sale.notes || extractLatLng(sale.customer_location ?? "")) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto h-8 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 press"
            aria-expanded={expanded}
            title="Dirección · mapa · notas"
          >
            {expanded ? "▲ Menos" : "▼ Más"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3 space-y-2"
          >
            {sale.customer_address && (
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 italic">
                📍 {sale.customer_address}
              </p>
            )}

            {/* Mini preview del mapa si hay coordenadas en customer_location */}
            {(() => {
              const ll = extractLatLng(sale.customer_location ?? "")
              if (!ll) return null
              return (
                <MapThumbnail
                  lat={ll.lat}
                  lng={ll.lng}
                  href={sale.customer_location!}
                  alt="Ubicación del cliente"
                  className="w-full h-20 rounded-xl"
                >
                  <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-white/85 dark:bg-slate-900/85 backdrop-blur text-[8px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 flex items-center gap-1 pointer-events-none">
                    <MapPin size={8} className="text-primary" /> Abrir en Maps
                  </span>
                </MapThumbnail>
              )
            })()}

            {sale.notes && (
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 italic">
                💬 {sale.notes}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Acciones — botón principal + menú overflow.
          Antes había 6 botones lado a lado que saturaban la card. Mari
          pidió aprovechar los módulos existentes (Comanda vive en su
          propio drawer) y dejar solo lo crítico al frente: ABONAR. El
          resto entra en un menú "···" que mantiene todo accesible. */}
      {!isCancelled && (
        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          {balance > 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onPay}
              className="flex-1 h-10 rounded-xl text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-bloom"
              style={{
                background: urgent
                  ? "linear-gradient(135deg,#ef4444,#f43f5e)"
                  : "linear-gradient(135deg, var(--brand-from), var(--brand-to))",
              }}
            >
              <Wallet size={12} /> {urgent ? "Cobrar urgente" : "Abonar"}
            </motion.button>
          )}
          {balance <= 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onTicket}
              className="flex-1 h-10 rounded-xl bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
              title="Ver ticket completo"
            >
              <Receipt size={12} /> Ver ticket
            </motion.button>
          )}
          {/* Menú overflow: agrupa Tier, Ticket, Comanda, Recibo WA, Cancelar.
              Posicionado relativo al botón para alinear el dropdown. */}
          <SaleCardOverflowMenu
            onAdjust={onAdjust}
            onTicket={onTicket}
            onDelivery={onDelivery}
            onSendReceipt={() => sendReceiptByWhatsApp(sale, profile?.avatar_url)}
            onCancel={onCancel}
            cancelDisabled={cancelGuard ? !cancelGuard.allowed : false}
            cancelReason={cancelGuard?.reason}
            balance={balance}
          />
        </div>
      )}

      {/* Acción para ventas canceladas: re-pre-llenar el carrito de Caja
          con los mismos items y abrir SalesPage. Útil cuando el cliente
          dice "ya cambié de opinión, sí lo quiero". */}
      {isCancelled && (sale.sale_items ?? []).length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              const items = (sale.sale_items ?? []).map((it: any) => ({
                variant_id: it.variant_id,
                qty: Number(it.qty) || 1,
              }))
              // Dispatch ANTES de navegar para que SalesPage al montar (o si
              // ya estaba) reciba el detalle y precargue al llegar `results`.
              window.dispatchEvent(
                new CustomEvent("sales:prefill-cart", {
                  detail: {
                    items,
                    customer_name: sale.customer_name,
                    customer_phone: sale.customer_phone,
                    customer_email: sale.customer_email,
                  },
                }),
              )
              window.dispatchEvent(
                new CustomEvent("app:navigate", { detail: { tab: "ventas" } }),
              )
            }}
            className="w-full h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
            title="Recrear esta venta en Caja con los mismos productos"
          >
            ♻️ Volver a apartar (mismos productos)
          </motion.button>
        </div>
      )}
    </motion.div>
  );
});

/* ────────────────────────────────────────────────────────────────────
 * Menú overflow de acciones de la card.
 * Antes la card tenía 6 botones lado a lado (Abonar, Tier, Ticket,
 * Comanda, Recibo WA, Cancelar) y se veía saturada. Ahora solo Abonar
 * queda al frente y el resto vive aquí, accesible con un toque.
 * Cierre por click fuera, ESC o tras ejecutar acción.
 * ──────────────────────────────────────────────────────────────────── */
function SaleCardOverflowMenu({
  onAdjust,
  onTicket,
  onDelivery,
  onSendReceipt,
  onCancel,
  cancelDisabled,
  cancelReason,
  balance,
}: {
  onAdjust: () => void;
  onTicket: () => void;
  onDelivery: () => void;
  onSendReceipt: () => void;
  onCancel: () => void;
  cancelDisabled: boolean;
  cancelReason?: string;
  balance: number;
}) {
  const [open, setOpen] = useState(false);

  // Cierre por click fuera + ESC. No usamos createPortal porque el
  // dropdown es chico y queda bien posicionado relativo a la card.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-overflow-menu]")) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  type Item = {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    tone?: "default" | "danger";
    disabled?: boolean;
    title?: string;
    /** Si false, el item se oculta (p.ej. ticket cuando balance>0 ya está al frente). */
    show?: boolean;
  };

  const items: Item[] = [
    {
      label: "Forzar precio / descuento",
      icon: <SlidersHorizontal size={13} />,
      onClick: onAdjust,
      title: "Aplicar descuento o forzar tier — notifica al cliente",
    },
    {
      label: "Ver / imprimir ticket",
      icon: <Printer size={13} />,
      onClick: onTicket,
      title: "Abre el ticket completo",
      show: balance > 0, // si balance=0, ya hay botón "Ver ticket" al frente
    },
    {
      label: "Crear comanda de entrega",
      icon: <Truck size={13} />,
      onClick: onDelivery,
      title: "Genera la comanda para el repartidor",
    },
    {
      label: "Enviar recibo por WhatsApp",
      icon: <Receipt size={13} />,
      onClick: onSendReceipt,
      title: "Manda el recibo formateado al cliente",
    },
    {
      label: "Cancelar venta",
      icon: <XCircle size={13} />,
      onClick: onCancel,
      tone: "danger",
      disabled: cancelDisabled,
      title: cancelReason ?? "Cancelar este apartado",
    },
  ];

  const visibleItems = items.filter((it) => it.show !== false);

  return (
    <div className="relative" data-overflow-menu>
      <motion.button
        whileTap={{ scale: 0.96 }}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Más acciones"
        className="h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
      >
        <MoreHorizontal size={14} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className="absolute right-0 bottom-full mb-2 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden z-20"
          >
            <ul className="py-1">
              {visibleItems.map((it, i) => (
                <li key={i}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (it.disabled) return;
                      it.onClick();
                      setOpen(false);
                    }}
                    disabled={it.disabled}
                    title={it.title}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-bold text-left transition-colors ${
                      it.tone === "danger"
                        ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                  >
                    <span
                      className={`shrink-0 ${
                        it.tone === "danger" ? "text-rose-500" : "text-slate-400"
                      }`}
                    >
                      {it.icon}
                    </span>
                    <span className="flex-1">{it.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
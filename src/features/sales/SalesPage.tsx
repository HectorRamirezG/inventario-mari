import { useMemo, useState, useCallback, useEffect } from "react";
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Search,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Package,
  X,
  User,
  Phone,
  StickyNote,
  Bookmark,
  ChevronDown,
  ScanLine,
  Store,
  MapPin,
  Truck,
  PartyPopper,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { toast } from "react-hot-toast";

import { useSalesPage } from "./useSalesPage";
import { TIER_LABEL } from "./salesTier";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import BarcodeScanner from "../../components/ui/BarcodeScanner";
import TicketView from "../../components/ui/TicketView";
import SmartLocationInput from "../../components/ui/SmartLocationInput";
import PageHeader from "../../components/ui/PageHeader";
import { formatMoney } from "../../lib/format";
import { sound } from "../../lib/sound";
import { confirmAction } from "../../lib/confirm";
import {
  useBusinessRules,
  calculateAutoDiscount,
} from "../settings/businessRulesService";

const TIER_TONE: Record<string, { bg: string; text: string; ring: string }> = {
  menudeo: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    ring: "ring-slate-200",
  },
  medio: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  mayoreo: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
};

export default function SalesPage() {
  const { state, actions } = useSalesPage();
  const [search, setSearch] = useState("");
  const [showCustomer, setShowCustomer] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Permite abrir el scanner desde otras partes (ej. CommandPalette)
  useEffect(() => {
    const onScanner = () => setScannerOpen(true);
    const onClearCart = () => {
      if (state.cart.length === 0) return;
      actions.clearCart();
      sound.tap();
    };
    const onFocusCustomer = () => {
      setShowCustomer(true);
      // Esperamos a que el panel se expanda para enfocar el input por nombre
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>(
          "input[placeholder*='Nombre del cliente']"
        );
        el?.focus();
      }, 250);
    };
    window.addEventListener("sales:open-scanner", onScanner);
    window.addEventListener("sales:clear-cart", onClearCart);
    window.addEventListener("sales:focus-customer", onFocusCustomer);
    return () => {
      window.removeEventListener("sales:open-scanner", onScanner);
      window.removeEventListener("sales:clear-cart", onClearCart);
      window.removeEventListener("sales:focus-customer", onFocusCustomer);
    };
  }, [actions, state.cart.length]);

  // Hotkeys locales de la pantalla Caja.
  // Se evita capturar cuando el foco está en un input/textarea para no
  // interferir con la escritura del admin.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const inField =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable
      if (inField) {
        if (e.key === "Escape" && target instanceof HTMLElement) target.blur()
        return
      }
      if (e.key === "/") {
        e.preventDefault()
        document
          .querySelector<HTMLInputElement>("input[placeholder='Buscar...']")
          ?.focus()
        return
      }
      if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setScannerOpen(true)
        return
      }
      if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShowCustomer((v) => !v)
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.results;
    return state.results.filter(
      (p: any) =>
        (p.variant_name ?? "").toLowerCase().includes(q) ||
        (p.products?.name ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [search, state.results]);

  /**
   * Handler del scanner. Busca el SKU leído en el catálogo y lo agrega
   * al carrito. Devuelve true para cerrar el scanner inmediatamente al
   * encontrar match; si no se encuentra, deja el scanner abierto y avisa.
   */
  const handleScan = useCallback(
    (code: string) => {
      const norm = code.trim().toUpperCase();
      const match = state.results.find(
        (r: any) =>
          (r.sku ?? "").toUpperCase() === norm ||
          (r.variant_name ?? "").toUpperCase() === norm
      );
      if (match) {
        actions.addToCart(match);
        sound.scan();
        toast.success(`+ ${match.variant_name}`, { duration: 1500 });
        return true; // cierra scanner
      }
      sound.error();
      toast.error(`Código "${code}" no encontrado`, { duration: 2000 });
      return false;
    },
    [state.results, actions]
  );

  /**
   * Wrap del handleSave original para disparar confetti al cerrar
   * la venta cobrada por completo (no en apartados).
   */
  const handleSaveWithFx = useCallback(async () => {
    const wasFullyPaid = Number(state.balance) <= 0 && !state.isLayaway;
    await actions.handleSave();
    if (wasFullyPaid) {
      // Confetti tipo "explosión doble" desde abajo
      const fire = (origin: { x: number; y: number }) =>
        confetti({
          particleCount: 70,
          spread: 80,
          startVelocity: 45,
          origin,
          colors: ["#e6007e", "#ff6ab5", "#fbbf24", "#10b981"],
        });
      fire({ x: 0.25, y: 0.9 });
      setTimeout(() => fire({ x: 0.75, y: 0.9 }), 200);
    }
  }, [actions, state.balance, state.isLayaway]);

  // Cuánto se ahorraría el cliente vs menudeo (sólo si hay tier mejor activo)
  const savings = useMemo(() => {
    if (state.cartTier === "menudeo") return 0;
    const totalMenudeo = state.cart.reduce(
      (acc: number, i: any) => acc + (Number(i.price_menudeo) || 0) * i.qty,
      0,
    );
    return Math.max(0, totalMenudeo - state.total);
  }, [state.cart, state.total, state.cartTier]);

  const tone = TIER_TONE[state.cartTier];

  // Regla de negocio: descuento automático por volumen (sugerencia visual al admin)
  const rules = useBusinessRules();
  const autoDiscount = useMemo(
    () =>
      calculateAutoDiscount(rules, {
        totalItems: state.totalQty,
        subtotal: state.total,
      }),
    [rules, state.totalQty, state.total],
  );

  return (
    <div className="relative px-3 pt-1 pb-28">
      {/* Orbs decorativos */}
      <span className="deco-orb deco-orb-pink top-0 -left-12 w-64 h-64" />
      <span className="deco-orb deco-orb-violet top-32 -right-16 w-72 h-72" />

      {/* HEADER */}
      <div className="max-w-5xl mx-auto">
        <PageHeader
          icon={ShoppingCart}
          title="Venta activa"
          subtitle={`${state.cart.length} ${state.cart.length === 1 ? "item" : "items"} en el carrito`}
          right={
            <div className="flex items-center gap-2">
              {state.cart.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirmAction({
                      title: "¿Vaciar carrito?",
                      description: "Se perderán los productos agregados al carrito actual.",
                      confirmLabel: "Sí, vaciar",
                      tone: "danger",
                    });
                    if (ok) {
                      actions.clearCart()
                      sound.tap()
                    }
                  }}
                  className="flex items-center gap-1 h-9 px-3 rounded-full bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 text-[9px] font-black uppercase tracking-widest hover:shadow-md active:scale-95 transition-all"
                  title="Vaciar carrito"
                >
                  <Trash2 size={11} /> Vaciar
                </button>
              )}
              <span className="px-3 h-9 inline-flex items-center rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-black tabular-nums">
                {formatMoney(state.total)}
              </span>
            </div>
          }
        />
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* ────────── CATÁLOGO ────────── */}
        <section className="surface-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest shrink-0">
              Productos
            </h3>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="relative flex-1 max-w-[180px]">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  size={11}
                />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-50 border-none rounded-lg py-1.5 pl-7 pr-2 text-[10px] font-bold focus:ring-2 focus:ring-primary/30 transition-all outline-none"
                />
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                aria-label="Escanear código"
                className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center active:scale-90 transition-transform shadow-sm"
                title="Escanear código de barras"
              >
                <ScanLine size={14} />
              </button>
            </div>
          </div>

          {/* Lista responsiva */}
          <div className="h-[260px] md:h-[320px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {filteredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <Package size={28} />
                <p className="mt-2 text-[9px] font-black uppercase tracking-widest">
                  Sin resultados
                </p>
              </div>
            ) : (
              filteredProducts.map((r: any) => {
                const inCart = state.cart.find(
                  (c: any) => c.variant_id === r.id,
                );
                const active = !!inCart;
                const lowStock = (r.stock ?? 0) <= 0;

                return (
                  <motion.button
                    key={r.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => !lowStock && actions.addToCart(r)}
                    disabled={lowStock}
                    className={`w-full flex justify-between items-center p-3 rounded-2xl border transition-all text-left ${
                      lowStock
                        ? "bg-slate-50/60 border-slate-100 opacity-50 cursor-not-allowed"
                        : active
                        ? "bg-primary text-white border-primary shadow-bloom"
                        : "bg-white border-slate-100 hover:border-primary/20"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-[10px] font-black uppercase tracking-tight leading-tight truncate">
                        {r.variant_name}
                      </p>
                      <p
                        className={`text-[9px] truncate ${
                          active ? "text-white/70" : "text-slate-400"
                        }`}
                      >
                        {r.products?.name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black italic tabular-nums">
                        {formatMoney(r.price_menudeo || r.price)}
                      </p>
                      <p
                        className={`text-[8px] font-bold uppercase ${
                          lowStock
                            ? "text-rose-500"
                            : active
                            ? "text-white/70"
                            : "text-emerald-500"
                        }`}
                      >
                        {lowStock ? "Sin stock" : `${r.stock} pz`}
                      </p>
                      {inCart && (
                        <p className="text-[8px] font-black mt-0.5 text-white/80">
                          ×{inCart.qty}
                        </p>
                      )}
                    </div>
                  </motion.button>
                );
              })
            )}
          </div>
        </section>

        {/* ────────── DETALLE / CARRITO ────────── */}
        <section className="surface-card p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-black uppercase text-slate-800">
              Detalle
            </h3>
            <div className="flex items-center gap-2">
              <Badge
                tone="primary"
                className="text-[9px] px-3 py-0.5 rounded-full font-black"
              >
                {state.cart.length} ítems · {state.totalQty} pz
              </Badge>
              {state.cart.length > 0 && (
                <button
                  onClick={actions.clearCart}
                  className="p-1.5 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                  title="Vaciar carrito"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* TIER BANNER (cross-product wholesale) */}
          {state.cart.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-3 rounded-2xl px-3 py-2 ring-1 ${tone.bg} ${tone.ring}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={12} className={tone.text} />
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest ${tone.text}`}
                  >
                    {TIER_LABEL[state.cartTier]}
                  </span>
                </div>
                {savings > 0 && (
                  <span
                    className={`text-[9px] font-black tabular-nums ${tone.text}`}
                  >
                    Ahorras {formatMoney(savings)}
                  </span>
                )}
              </div>

              {state.nextTierHint ? (
                <p className="mt-1 text-[8px] font-bold text-slate-500 leading-tight">
                  Faltan{" "}
                  <span className="text-slate-900 font-black">
                    {state.nextTierHint.missing}
                  </span>{" "}
                  pz para activar{" "}
                  <span className="text-slate-900 font-black uppercase">
                    {TIER_LABEL[state.nextTierHint.tier]}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-[8px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  Mejor precio aplicado
                </p>
              )}
            </motion.div>
          )}

          {/* AUTO-DESCUENTO POR VOLUMEN (sugerencia) */}
          {state.cart.length > 0 && rules.auto_discount_enabled && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-3 rounded-2xl px-3 py-2 ring-1 ${
                autoDiscount.applies
                  ? "bg-emerald-50 dark:bg-emerald-500/10 ring-emerald-200 dark:ring-emerald-500/30"
                  : "bg-amber-50 dark:bg-amber-500/10 ring-amber-200 dark:ring-amber-500/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <PartyPopper
                    size={12}
                    className={
                      autoDiscount.applies
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }
                  />
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest leading-tight ${
                      autoDiscount.applies
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {autoDiscount.applies
                      ? `${autoDiscount.percent}% sugerido`
                      : `Promo ${rules.auto_discount_percent}%`}
                  </span>
                </div>
                {autoDiscount.applies && (
                  <span className="text-[9px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                    -{formatMoney(autoDiscount.amount)}
                  </span>
                )}
              </div>
              <p
                className={`mt-1 text-[8px] font-bold leading-tight ${
                  autoDiscount.applies
                    ? "text-emerald-700/80 dark:text-emerald-300/70"
                    : "text-amber-700/80 dark:text-amber-300/70"
                }`}
              >
                {autoDiscount.reason}
                {autoDiscount.applies && " (aplica como ajuste manual al cerrar)"}
              </p>
            </motion.div>
          )}

          {/* LISTA DEL CARRITO */}
          <div className="space-y-2 mb-4 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {state.cart.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-8 text-center text-slate-300"
                >
                  <Sparkles size={20} className="mx-auto mb-2" />
                  <p className="text-[9px] font-black uppercase tracking-widest">
                    Toca un producto para empezar
                  </p>
                </motion.div>
              ) : (
                state.cart.map((item: any) => {
                  const overStock = item.qty > item.stock;
                  return (
                    <motion.div
                      key={item.variant_id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={`flex items-center gap-2 p-3 rounded-xl border ${
                        overStock
                          ? "bg-rose-50/60 border-rose-100"
                          : "bg-slate-50/50 border-slate-100"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-black text-primary uppercase">
                          {item.variant_name}
                        </p>
                        <p className="text-[11px] font-black text-slate-800 truncate">
                          {item.name}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 tabular-nums">
                          {formatMoney(item.price)} c/u
                        </p>
                      </div>

                      <div className="flex items-center bg-white shadow-sm border border-slate-100 rounded-lg p-0.5">
                        <button
                          onClick={() =>
                            actions.updateQty(item.variant_id, item.qty - 1)
                          }
                          className="p-1 hover:bg-slate-50 rounded"
                          aria-label="Restar"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="w-5 text-center text-[10px] font-black tabular-nums">
                          {item.qty}
                        </span>
                        <button
                          onClick={() =>
                            actions.updateQty(item.variant_id, item.qty + 1)
                          }
                          className="p-1 hover:bg-slate-50 rounded"
                          aria-label="Sumar"
                        >
                          <Plus size={10} />
                        </button>
                      </div>

                      <div className="text-right min-w-[60px]">
                        <p className="text-sm font-black text-slate-900 tabular-nums">
                          {formatMoney(item.qty * item.price)}
                        </p>
                      </div>

                      <button
                        onClick={() => actions.removeFromCart(item.variant_id)}
                        className="text-slate-300 hover:text-rose-500 transition-colors"
                        aria-label="Quitar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>

          {/* INFO CLIENTE (colapsable) */}
          <div className="mb-3">
            <button
              onClick={() => setShowCustomer((v) => !v)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <User size={12} className="text-primary shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 truncate">
                  Cliente {state.customer && `· ${state.customer}`}
                </span>
                {state.selectedHistory && (
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[8px] font-black uppercase tracking-widest shrink-0">
                    Recurrente
                  </span>
                )}
              </div>
              <motion.div animate={{ rotate: showCustomer ? 180 : 0 }}>
                <ChevronDown size={14} className="text-slate-400" />
              </motion.div>
            </button>

            <AnimatePresence initial={false}>
              {showCustomer && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-2">
                    {/* Tarjeta de cliente recurrente — visible cuando se eligió
                        un cliente de las sugerencias. Muestra historial para
                        que el admin tenga contexto antes de cobrar. */}
                    {state.selectedHistory && (
                      <CustomerHistoryCard snap={state.selectedHistory} />
                    )}

                    <div className="relative">
                      <User
                        size={12}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
                      />
                      <input
                        type="text"
                        placeholder="Nombre del cliente *"
                        value={state.customer}
                        onChange={(e) => actions.setCustomer(e.target.value)}
                        className="w-full h-10 pl-8 pr-3 rounded-xl bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      />

                      {/* Sugerencias de clientes anteriores */}
                      {state.customerSuggestions.length > 0 &&
                        !state.customerSuggestions.some(
                          (c: any) =>
                            c.name.toLowerCase() ===
                            state.customer.toLowerCase().trim()
                        ) && (
                          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl overflow-hidden">
                            {state.customerSuggestions.map((c: any) => (
                              <button
                                key={c.name}
                                type="button"
                                onClick={() => actions.pickCustomer(c)}
                                className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary/5 text-left transition-colors"
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black text-slate-800 truncate">
                                    {c.name}
                                  </p>
                                  <p className="text-[9px] font-bold text-slate-400 truncate">
                                    {c.phone ?? "sin tel"} · {c.visits} compra
                                    {c.visits === 1 ? "" : "s"}
                                  </p>
                                </div>
                                {c.pending_balance > 0 && (
                                  <span className="text-[9px] font-black text-rose-500 tabular-nums shrink-0 ml-2">
                                    Debe {Math.round(c.pending_balance)}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                    </div>

                    <div className="relative">
                      <Phone
                        size={12}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
                      />
                      <input
                        type="tel"
                        inputMode="tel"
                        placeholder="Teléfono / WhatsApp"
                        value={state.phone}
                        onChange={(e) => actions.setPhone(e.target.value)}
                        className="w-full h-10 pl-8 pr-3 rounded-xl bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <SmartLocationInput
                      address={state.address}
                      onAddressChange={actions.setAddress}
                      locationUrl={state.locationUrl}
                      onLocationUrlChange={actions.setLocationUrl}
                    />

                    <div className="relative">
                      <StickyNote
                        size={12}
                        className="absolute left-3 top-3 text-slate-300"
                      />
                      <textarea
                        placeholder="Nota para el ticket (ej. envoltura para regalo, fecha de entrega...)"
                        value={state.notes}
                        onChange={(e) => actions.setNotes(e.target.value)}
                        rows={2}
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>

                    {/* Recordatorio sutil: dirección + ubicación + nota se
                        incluyen en el ticket que ve el cliente. */}
                    <p className="text-[9px] font-bold text-slate-400 italic px-1 flex items-center gap-1">
                      <Sparkles size={9} className="text-primary" />
                      Dirección, ubicación y nota aparecen en el ticket del cliente.
                    </p>

                    {/* Liga de pago (Mercado Pago, Stripe, etc.) */}
                    <div className="relative">
                      <span
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-[10px] font-black"
                        aria-hidden
                      >
                        $/
                      </span>
                      <input
                        type="url"
                        placeholder="Liga de pago (opcional, p.ej. Mercado Pago)"
                        value={state.paymentUrl}
                        onChange={(e) =>
                          actions.setPaymentUrl(e.target.value)
                        }
                        className="w-full h-10 pl-10 pr-3 rounded-xl bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* TOTAL Y FORMULARIO */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            {/* MÉTODO DE ENTREGA */}
            {state.cart.length > 0 && (
              <DeliveryBlock state={state} actions={actions} />
            )}

            <div className="bg-slate-900 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg">
              <span className="text-[10px] text-slate-400 uppercase font-black">
                Total
              </span>
              <p className="text-xl font-black text-white tabular-nums">
                {formatMoney(state.total)}
              </p>
            </div>

            <QuickAmounts
              total={state.total}
              currentPaid={Number(state.paid) || 0}
              onPick={(v) => actions.setPaid(v)}
            />

            <input
              type="number"
              inputMode="decimal"
              placeholder={state.isLayaway ? "Anticipo recibido" : "Pago recibido"}
              value={state.paid || ""}
              onChange={(e) => actions.setPaid(Number(e.target.value))}
              className="w-full h-11 rounded-xl bg-slate-100 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />

            {/* TOGGLE APARTADO */}
            <button
              onClick={() => actions.setIsLayaway(!state.isLayaway)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                state.isLayaway
                  ? "bg-amber-50 border-amber-300"
                  : "bg-white border-slate-100 hover:border-amber-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <Bookmark
                  size={14}
                  className={
                    state.isLayaway ? "text-amber-600" : "text-slate-400"
                  }
                  fill={state.isLayaway ? "currentColor" : "none"}
                />
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                    Apartado
                  </p>
                  <p className="text-[8px] text-slate-400 font-bold">
                    Cliente paga después
                  </p>
                </div>
              </div>
              <div
                className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                  state.isLayaway ? "bg-amber-500" : "bg-slate-200"
                }`}
              >
                <motion.div
                  className="w-4 h-4 bg-white rounded-full shadow-sm"
                  animate={{ x: state.isLayaway ? 16 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </div>
            </button>

            {/* Cambio / saldo pendiente */}
            {state.cart.length > 0 && Number(state.paid) > 0 && (
              <ChangeBanner total={state.total} paid={Number(state.paid)} />
            )}

            <Button
              onClick={handleSaveWithFx}
              disabled={
                !state.customer.trim() ||
                state.loading ||
                state.cart.length === 0
              }
              className={`w-full h-12 rounded-xl text-xs font-black tracking-widest transition-all ${
                state.loading
                  ? "bg-slate-200"
                  : state.isLayaway
                  ? "bg-amber-500 text-white shadow-lg shadow-amber-500/40"
                  : "bg-primary text-white shadow-bloom"
              }`}
            >
              {state.loading
                ? "PROCESANDO..."
                : state.isLayaway
                ? "GUARDAR APARTADO"
                : "CONFIRMAR VENTA"}
            </Button>
          </div>
        </section>
      </div>

      {/* SCANNER (cámara fullscreen) */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />

      {/* TICKET de la última venta cerrada */}
      <TicketView
        open={!!state.lastSale}
        sale={state.lastSale}
        onClose={actions.dismissLastSale}
      />
    </div>
  );
}
/* ════════════════════════ DeliveryBlock ════════════════════════ */
function DeliveryBlock({ state, actions }: { state: any; actions: any }) {
  const method = state.deliveryMethod as "mostrador" | "personal" | "foraneo";

  const opts = [
    { id: "mostrador", label: "Mostrador", icon: Store },
    { id: "personal", label: "Entrega", icon: MapPin },
    { id: "foraneo", label: "Envío", icon: Truck },
  ] as const;

  return (
    <div className="space-y-2 rounded-2xl bg-slate-50 border border-slate-100 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          Método de entrega
        </span>
        {method !== "mostrador" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
              Costo envío
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              value={state.shippingAmount}
              onChange={(e) =>
                actions.setShippingAmount(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              className="w-20 h-7 px-2 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-right tabular-nums outline-none focus:border-primary"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = method === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => actions.setDeliveryMethod(o.id)}
              className={`h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                active
                  ? "bg-primary text-white shadow-bloom"
                  : "bg-white text-slate-500 border border-slate-100 hover:border-primary/30"
              }`}
            >
              <Icon size={13} />
              <span className="text-[8px] font-black uppercase tracking-widest">
                {o.label}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {method === "personal" && (
          <motion.div
            key="personal"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: "cdmx_metro", label: "CDMX · Metro" },
                    { id: "edomex", label: "Edo. de México" },
                  ] as const
                ).map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => actions.setDeliveryZone(z.id)}
                    className={`h-9 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                      state.deliveryZone === z.id
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-500 border border-slate-200"
                    }`}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder={
                  state.deliveryZone === "cdmx_metro"
                    ? "Estación de metro (ej. Pantitlán)"
                    : "Punto de entrega"
                }
                value={state.deliveryStation}
                onChange={(e) => actions.setDeliveryStation(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-primary"
              />
              <input
                type="text"
                placeholder="Horario (ej. Sábado 4-6pm)"
                value={state.deliverySchedule}
                onChange={(e) => actions.setDeliverySchedule(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-primary"
              />
            </div>
          </motion.div>
        )}

        {method === "foraneo" && (
          <motion.div
            key="foraneo"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2">
              <input
                type="text"
                placeholder="Calle y número *"
                value={state.shippingStreet}
                onChange={(e) => actions.setShippingStreet(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-primary"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  placeholder="Colonia *"
                  value={state.shippingColonia}
                  onChange={(e) => actions.setShippingColonia(e.target.value)}
                  className="h-10 px-3 rounded-lg bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-primary"
                />
                <input
                  type="text"
                  placeholder="CP *"
                  inputMode="numeric"
                  value={state.shippingZip}
                  onChange={(e) => actions.setShippingZip(e.target.value)}
                  className="h-10 px-3 rounded-lg bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-primary"
                />
              </div>
              <input
                type="text"
                placeholder="Referencias (puerta, color, etc.)"
                value={state.shippingRefs}
                onChange={(e) => actions.setShippingRefs(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-white border border-slate-200 text-[11px] font-bold outline-none focus:border-primary"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════ QuickAmounts y ChangeBanner ════════════════════════ */
function QuickAmounts({
  total,
  currentPaid,
  onPick,
}: {
  total: number
  currentPaid: number
  onPick: (v: number) => void
}) {
  const presets = [50, 100, 200, 500, 1000].filter((v) => v <= Math.max(total, 1000) * 2)
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onPick(Number(total.toFixed(2)))}
        className={`px-3 h-8 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
          Math.abs(currentPaid - total) < 0.01
            ? "bg-primary text-white border-primary shadow-bloom"
            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:border-primary/40"
        }`}
        title="Pago exacto al total"
      >
        Exacto
      </button>
      {presets.map((v) => {
        const active = Math.abs(currentPaid - v) < 0.01
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`px-3 h-8 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all tabular-nums ${
              active
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-200 hover:border-slate-400"
            }`}
          >
            ${v}
          </button>
        )
      })}
    </div>
  )
}

function ChangeBanner({ total, paid }: { total: number; paid: number }) {
  const diff = paid - total
  if (Math.abs(diff) < 0.005) {
    return (
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-200 dark:border-emerald-500/30 p-3 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
          Cobro exacto
        </p>
        <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
          ✓ Sin cambio
        </p>
      </div>
    )
  }
  if (diff > 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-200 dark:border-emerald-500/30 p-3 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
          Devolver al cliente
        </p>
        <p className="text-3xl md:text-4xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">
          {formatMoney(diff)}
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-200 dark:border-rose-500/30 p-3 text-center">
      <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">
        Falta por cobrar
      </p>
      <p className="text-2xl font-black text-rose-700 dark:text-rose-300 tabular-nums mt-0.5">
        {formatMoney(Math.abs(diff))}
      </p>
    </div>
  )
}

/* ════════════════════════ CustomerHistoryCard ════════════════════════
   Tarjeta visible cuando el admin elige un cliente recurrente desde
   las sugerencias. Sirve para tener contexto sin ir a otra pantalla:
   compras totales, saldo pendiente, monto vida, última visita.
   ════════════════════════════════════════════════════════════════════ */
function CustomerHistoryCard({
  snap,
}: {
  snap: {
    name: string
    visits: number
    total_spent: number
    pending_balance: number
    last_visit: string | null
  }
}) {
  const hasDebt = snap.pending_balance > 0
  const lastVisitText = (() => {
    if (!snap.last_visit) return null
    const days = Math.max(
      0,
      Math.round((Date.now() - new Date(snap.last_visit).getTime()) / 86400000)
    )
    if (days === 0) return "hoy"
    if (days === 1) return "ayer"
    if (days < 30) return `hace ${days} días`
    if (days < 60) return "hace 1 mes"
    return `hace ${Math.round(days / 30)} meses`
  })()

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-3 border ${
        hasDebt
          ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30"
          : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles
            size={11}
            className={
              hasDebt
                ? "text-amber-600 dark:text-amber-400 shrink-0"
                : "text-emerald-600 dark:text-emerald-400 shrink-0"
            }
          />
          <p
            className={`text-[10px] font-black uppercase tracking-widest truncate ${
              hasDebt
                ? "text-amber-700 dark:text-amber-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            Cliente con historial
          </p>
        </div>
        {lastVisitText && (
          <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 shrink-0">
            Última: {lastVisitText}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Compras
          </p>
          <p className="text-sm font-black tabular-nums">{snap.visits}</p>
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Acumulado
          </p>
          <p className="text-sm font-black tabular-nums">
            {formatMoney(snap.total_spent)}
          </p>
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Adeudo
          </p>
          <p
            className={`text-sm font-black tabular-nums ${
              hasDebt
                ? "text-amber-700 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {hasDebt ? formatMoney(snap.pending_balance) : "✓"}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
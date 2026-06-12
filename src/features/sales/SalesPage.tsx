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
  MapPin,
  Navigation,
  StickyNote,
  Bookmark,
  ChevronDown,
  ScanLine,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { toast } from "react-hot-toast";

import { useSalesPage } from "./useSalesPage";
import { TIER_LABEL } from "./salesTier";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import BarcodeScanner from "../../components/ui/BarcodeScanner";

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
  }).format(n || 0);

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
    const handler = () => setScannerOpen(true);
    window.addEventListener("sales:open-scanner", handler);
    return () => window.removeEventListener("sales:open-scanner", handler);
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
        toast.success(`+ ${match.variant_name}`, { duration: 1500 });
        return true; // cierra scanner
      }
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
  const balanceNum = Number(state.balance) || 0;

  return (
    <div className="px-3 pt-1 pb-28">
      {/* HEADER */}
      <div className="mb-3 flex items-center justify-between max-w-5xl mx-auto">
        <h2 className="text-sm font-black italic uppercase tracking-tighter flex items-center gap-2 text-slate-900">
          <ShoppingCart size={14} className="text-primary" />
          Venta Activa
        </h2>
        <p className="text-sm font-black text-primary tabular-nums">
          {money(state.total)}
        </p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* ────────── CATÁLOGO ────────── */}
        <section className="bg-white rounded-[2rem] p-4 border border-slate-100 shadow-sm flex flex-col">
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
                        {money(r.price_menudeo || r.price)}
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
        <section className="bg-white rounded-[2rem] p-4 border border-slate-100 shadow-sm">
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
                    Ahorras {money(savings)}
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
                          {money(item.price)} c/u
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
                          {money(item.qty * item.price)}
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
              <div className="flex items-center gap-2">
                <User size={12} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                  Cliente {state.customer && `· ${state.customer}`}
                </span>
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

                    <div className="relative">
                      <MapPin
                        size={12}
                        className="absolute left-3 top-3 text-slate-300"
                      />
                      <textarea
                        placeholder="Dirección de entrega"
                        value={state.address}
                        onChange={(e) => actions.setAddress(e.target.value)}
                        rows={2}
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>

                    <button
                      onClick={actions.captureLocation}
                      disabled={state.capturingLocation}
                      className="w-full h-10 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <Navigation
                        size={12}
                        className={state.capturingLocation ? "animate-pulse" : ""}
                      />
                      {state.locationUrl
                        ? "Actualizar ubicación GPS"
                        : "Capturar ubicación GPS"}
                    </button>

                    {state.locationUrl && (
                      <a
                        href={state.locationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:underline"
                      >
                        Ver en Google Maps ↗
                      </a>
                    )}

                    <div className="relative">
                      <StickyNote
                        size={12}
                        className="absolute left-3 top-3 text-slate-300"
                      />
                      <textarea
                        placeholder="Notas (opcional)"
                        value={state.notes}
                        onChange={(e) => actions.setNotes(e.target.value)}
                        rows={2}
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* TOTAL Y FORMULARIO */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="bg-slate-900 rounded-2xl px-4 py-3 flex items-center justify-between shadow-lg">
              <span className="text-[10px] text-slate-400 uppercase font-black">
                Total
              </span>
              <p className="text-xl font-black text-white tabular-nums">
                {money(state.total)}
              </p>
            </div>

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
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span className="text-slate-400">
                  {balanceNum > 0 ? "Saldo pendiente" : "Cambio"}
                </span>
                <span
                  className={
                    balanceNum > 0 ? "text-rose-500" : "text-emerald-500"
                  }
                >
                  {money(Math.abs(balanceNum))}
                </span>
              </div>
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
    </div>
  );
}

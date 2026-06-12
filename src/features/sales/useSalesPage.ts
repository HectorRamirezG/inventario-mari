import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-hot-toast";
import { getAllVariants } from "./productLookupService";
import { createSale } from "./salesService";
import { getPricingConfig } from "../pricing/pricingConfigService";
import {
  detectCartTier,
  piecesToNextTier,
  priceForTier,
  type CartItem,
} from "./salesTier";
import type { PricingConfig } from "../pricing/pricingTypes";

const DEFAULT_CONFIG: PricingConfig = {
  id: 1,
  margen_menudeo: 30,
  margen_medio: 25,
  margen_mayoreo: 20,
  umbral_medio: 6,
  umbral_mayoreo: 12,
  costo_extra: 0,
};

export function useSalesPage() {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_CONFIG);

  const [variants, setVariants] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // --- Info del cliente / venta ---
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [locationUrl, setLocationUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isLayaway, setIsLayaway] = useState(false);
  const [paid, setPaid] = useState<number | string>(0);
  const [capturingLocation, setCapturingLocation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPricingConfig(), getAllVariants()])
      .then(([cfg, vars]) => {
        if (cancelled) return;
        if (cfg) setConfig(cfg);
        setVariants(vars);
      })
      .catch((e) => {
        console.error("Error cargando catálogo o configuración:", e);
        toast.error("No se pudo cargar el catálogo");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- Tier global del carrito (cross-product wholesale) ---------- */
  const totalQty = useMemo(
    () => cart.reduce((acc, i) => acc + i.qty, 0),
    [cart]
  );
  const cartTier = useMemo(
    () => detectCartTier(totalQty, config),
    [totalQty, config]
  );

  /* ---------- Cuando cambia el tier global, reprecificamos TODO ---------- */
  const repricedCart = useMemo<CartItem[]>(
    () =>
      cart.map((i) => {
        const price = priceForTier(i, cartTier);
        return { ...i, tier: cartTier, price };
      }),
    [cart, cartTier]
  );

  const total = useMemo(
    () => repricedCart.reduce((a, i) => a + i.price * i.qty, 0),
    [repricedCart]
  );

  const balance = useMemo(() => {
    const p = typeof paid === "string" ? parseFloat(paid) || 0 : paid;
    return total - p;
  }, [total, paid]);

  const nextTierHint = useMemo(
    () => piecesToNextTier(totalQty, config),
    [totalQty, config]
  );

  /* ---------- Mutaciones del carrito ---------- */
  const addToCart = useCallback((v: any) => {
    setCart((prev) => {
      const exist = prev.find((i) => i.variant_id === v.id);
      if (exist) {
        return prev.map((i) =>
          i.variant_id === v.id ? { ...i, qty: i.qty + 1 } : i
        );
      }

      const menudeo = Number(v.price_menudeo) || Number(v.price) || 0;
      const medio = Number(v.price_medio) || 0;
      const mayoreo = Number(v.price_mayoreo) || 0;

      const newItem: CartItem = {
        variant_id: v.id,
        product_id: v.product_id ?? v.products?.id ?? null,
        name: v.products?.name ?? "Producto",
        variant_name: v.variant_name,
        qty: 1,
        stock: Number(v.stock) || 0,
        // La columna `cost` no existe en variants; el costo efectivo
        // es cost_override (si lo hay) o el costo del producto padre.
        cost: Number(v.cost_override ?? v.products?.cost ?? 0),

        price_menudeo: menudeo,
        price_medio: medio,
        price_mayoreo: mayoreo,

        // Estos dos se recalculan con `repricedCart` según el tier global.
        price: menudeo,
        tier: "menudeo",
      };

      return [...prev, newItem];
    });
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    if (qty < 1) return;
    setCart((prev) =>
      prev.map((i) => (i.variant_id === id ? { ...i, qty } : i))
    );
  }, []);

  const removeFromCart = useCallback(
    (id: string) =>
      setCart((prev) => prev.filter((i) => i.variant_id !== id)),
    []
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomer("");
    setPhone("");
    setAddress("");
    setLocationUrl("");
    setNotes("");
    setIsLayaway(false);
    setPaid(0);
  }, []);

  /* ---------- Captura de GPS → Google Maps URL ---------- */
  const captureLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Tu navegador no soporta geolocalización");
      return;
    }
    setCapturingLocation(true);
    const toastId = toast.loading("Obteniendo ubicación...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const url = `https://www.google.com/maps?q=${lat},${lng}`;
        setLocationUrl(url);
        setCapturingLocation(false);
        toast.success("Ubicación capturada", { id: toastId });
      },
      (err) => {
        setCapturingLocation(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Permiso de ubicación denegado"
            : "No se pudo obtener la ubicación";
        toast.error(msg, { id: toastId });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  /* ---------- Guardar venta ---------- */
  const handleSave = useCallback(async () => {
    if (!repricedCart.length) {
      toast.error("Sin productos");
      return;
    }
    if (!customer.trim()) {
      toast.error("Captura el nombre del cliente");
      return;
    }
    // Apartado: requiere al menos algo de anticipo
    if (isLayaway && Number(paid) <= 0) {
      toast.error("Un apartado necesita anticipo");
      return;
    }

    setLoading(true);
    const toastId = toast.loading(
      isLayaway ? "Guardando apartado..." : "Procesando venta..."
    );

    try {
      await createSale({
        customer: customer.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        location: locationUrl.trim() || null,
        notes: notes.trim() || null,
        isLayaway,
        total,
        paid,
        balance,
        items: repricedCart,
      });

      const msg = isLayaway
        ? "Apartado guardado"
        : balance > 0
        ? "Venta guardada (con saldo pendiente)"
        : "Venta cobrada";
      toast.success(msg, { id: toastId });
      clearCart();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al guardar la venta", { id: toastId });
    } finally {
      setLoading(false);
    }
  }, [
    repricedCart,
    customer,
    phone,
    address,
    locationUrl,
    notes,
    isLayaway,
    total,
    paid,
    balance,
    clearCart,
  ]);

  return {
    state: {
      results: variants,
      cart: repricedCart,
      total,
      balance,
      customer,
      phone,
      address,
      locationUrl,
      notes,
      isLayaway,
      capturingLocation,
      paid,
      loading,
      cartTier,
      totalQty,
      nextTierHint,
      config,
    },
    actions: {
      addToCart,
      updateQty,
      removeFromCart,
      clearCart,
      setCustomer,
      setPhone,
      setAddress,
      setLocationUrl,
      setNotes,
      setIsLayaway,
      captureLocation,
      setPaid,
      handleSave,
    },
  };
}
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-hot-toast";
import { getAllVariants } from "./productLookupService";
import { createSale } from "./salesService";
import { getPricingConfig } from "../pricing/pricingConfigService";
import {
  searchCustomers,
  type CustomerSnapshot,
} from "./customerHistoryService";
import {
  detectCartTier,
  piecesToNextTier,
  priceForTier,
  type CartItem,
} from "./salesTier";
import type { PricingConfig } from "../pricing/pricingTypes";
import type { Sale } from "../../types/database";
import { sound } from "../../lib/sound";
import { getBusinessRules } from "../settings/businessRulesService";

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
  const [paymentUrl, setPaymentUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [isLayaway, setIsLayaway] = useState(false);
  const [paid, setPaid] = useState<number | string>(0);
  const [capturingLocation, setCapturingLocation] = useState(false);

  // --- Método de entrega ---
  // mostrador  = entrega en local (default, sin envío)
  // personal   = entrega en persona (zona + estación + horario)
  // foraneo    = envío por paquetería (dirección completa + guía)
  const [deliveryMethod, setDeliveryMethod] = useState<"mostrador" | "personal" | "foraneo">("mostrador");
  const [deliveryZone, setDeliveryZone] = useState<"" | "cdmx_metro" | "edomex">("");
  const [deliveryStation, setDeliveryStation] = useState("");
  const [deliverySchedule, setDeliverySchedule] = useState("");
  const [shippingStreet, setShippingStreet] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [shippingColonia, setShippingColonia] = useState("");
  const [shippingRefs, setShippingRefs] = useState("");
  const [shippingAmount, setShippingAmount] = useState<number | "">("");

  // --- Sugerencias de cliente (histórico) ---
  const [customerSuggestions, setCustomerSuggestions] = useState<
    CustomerSnapshot[]
  >([]);

  // --- Última venta cerrada (para mostrar ticket) ---
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const dismissLastSale = useCallback(() => setLastSale(null), []);

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
    () =>
      repricedCart.reduce((a, i) => a + i.price * i.qty, 0) +
      (Number(shippingAmount) || 0),
    [repricedCart, shippingAmount]
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
    setPaymentUrl("");
    setNotes("");
    setIsLayaway(false);
    setPaid(0);
    setCustomerSuggestions([]);
    setDeliveryMethod("mostrador");
    setDeliveryZone("");
    setDeliveryStation("");
    setDeliverySchedule("");
    setShippingStreet("");
    setShippingZip("");
    setShippingColonia("");
    setShippingRefs("");
    setShippingAmount("");
  }, []);

  /* ---------- Búsqueda de clientes (debounced) ---------- */
  useEffect(() => {
    const q = customer.trim();
    if (q.length < 2) {
      setCustomerSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchCustomers(q, 5).then((res) => {
        if (!cancelled) setCustomerSuggestions(res);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customer]);

  /** Auto-rellena teléfono/dirección/ubicación al elegir un cliente sugerido */
  const pickCustomer = useCallback((c: CustomerSnapshot) => {
    setCustomer(c.name);
    if (c.phone) setPhone(c.phone);
    if (c.address) setAddress(c.address);
    if (c.location) setLocationUrl(c.location);
    setCustomerSuggestions([]);
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

    // Validaciones de entrega
    if (deliveryMethod === "personal") {
      if (!deliveryZone) {
        toast.error("Elige la zona de entrega");
        return;
      }
      if (!deliveryStation.trim()) {
        toast.error("Indica la estación o punto de entrega");
        return;
      }
      if (!deliverySchedule.trim()) {
        toast.error("Indica el horario de entrega");
        return;
      }
    }
    if (deliveryMethod === "foraneo") {
      if (!shippingStreet.trim() || !shippingZip.trim() || !shippingColonia.trim()) {
        toast.error("Completa la dirección de envío (calle, CP, colonia)");
        return;
      }
    }

    // Reglas de negocio
    const rules = getBusinessRules();

    // Regla: anticipo mínimo en apartados
    if (isLayaway && rules.min_layaway_enabled) {
      const minPaid = (total * rules.min_layaway_percent) / 100;
      if (Number(paid) < minPaid) {
        toast.error(
          `El apartado requiere mínimo ${rules.min_layaway_percent}% de anticipo (${minPaid.toFixed(2)})`
        );
        return;
      }
    }

    // Regla: confirmación extra para ventas de alto valor
    if (rules.high_value_enabled && total >= rules.high_value_threshold) {
      const ok = window.confirm(
        `Esta venta supera ${rules.high_value_threshold.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}.\n\n¿Confirmas que es correcta?`
      );
      if (!ok) return;
    }

    setLoading(true);
    const toastId = toast.loading(
      isLayaway ? "Guardando apartado..." : "Procesando venta..."
    );

    try {
      // Componer las notas con info estructurada de entrega
      const deliveryNote = (() => {
        if (deliveryMethod === "mostrador") return "";
        if (deliveryMethod === "personal") {
          const zoneLabel =
            deliveryZone === "cdmx_metro" ? "CDMX · Metro" : "Edo. de México";
          return [
            `Entrega personal — ${zoneLabel}`,
            `Punto: ${deliveryStation.trim()}`,
            `Horario: ${deliverySchedule.trim()}`,
          ].join("\n");
        }
        // foraneo
        return [
          "Envío foráneo (guía paquetería)",
          `Calle: ${shippingStreet.trim()}`,
          `Col.: ${shippingColonia.trim()}  CP: ${shippingZip.trim()}`,
          shippingRefs.trim() ? `Refs: ${shippingRefs.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })();

      const finalAddress =
        deliveryMethod === "foraneo"
          ? [shippingStreet, shippingColonia, shippingZip]
              .filter(Boolean)
              .join(", ")
          : address.trim();

      const finalNotes = [notes.trim(), deliveryNote].filter(Boolean).join("\n\n");

      await createSale({
        customer: customer.trim(),
        phone: phone.trim() || null,
        address: finalAddress || null,
        location: locationUrl.trim() || null,
        payment_url: paymentUrl.trim() || null,
        notes: finalNotes || null,
        isLayaway,
        total,
        paid,
        balance,
        items: repricedCart,
        shipping_amount: Number(shippingAmount) || 0,
        is_foreign_shipping: deliveryMethod === "foraneo",
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
    paymentUrl,
    notes,
    isLayaway,
    total,
    paid,
    balance,
    clearCart,
    deliveryMethod,
    deliveryZone,
    deliveryStation,
    deliverySchedule,
    shippingStreet,
    shippingZip,
    shippingColonia,
    shippingRefs,
    shippingAmount,
    locationUrl,
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
      paymentUrl,
      notes,
      isLayaway,
      capturingLocation,
      paid,
      loading,
      cartTier,
      totalQty,
      nextTierHint,
      config,
      customerSuggestions,
      lastSale,
      // delivery
      deliveryMethod,
      deliveryZone,
      deliveryStation,
      deliverySchedule,
      shippingStreet,
      shippingZip,
      shippingColonia,
      shippingRefs,
      shippingAmount,
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
      setPaymentUrl,
      setNotes,
      setIsLayaway,
      captureLocation,
      setPaid,
      handleSave,
      pickCustomer,
      dismissLastSale,
      setDeliveryMethod,
      setDeliveryZone,
      setDeliveryStation,
      setDeliverySchedule,
      setShippingStreet,
      setShippingZip,
      setShippingColonia,
      setShippingRefs,
      setShippingAmount,
    },
  };
}
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
  priceForTier,
  type CartItem,
} from "./salesTier";
import {
  resolveThresholds,
  tierForLine,
  piecesToNextTierForLine,
} from "../pricing/tierResolver";
import {
  useTierThresholds,
} from "../pricing/tierPricingService";
import type { PricingConfig } from "../pricing/pricingTypes";
import type { Sale } from "../../types/database";
import { sound } from "../../lib/sound";
import { getBusinessRules } from "../settings/businessRulesService";
import { computePresale } from "../products/presaleService";
import { confirmAction } from "../../lib/confirm";
import { debug } from "../../lib/debug";

// Cap defensivo para líneas de preventa/oversell cuando no hay stock
// físico. Aunque el admin quiera vender sin stock, no queremos que un
// error de teclado agregue "50" piezas al carrito de una variante que
// aún no llegó. Mismo valor que la tienda del cliente.
const PREORDER_CAP = 5;

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

  // Umbrales GLOBALES unificados (fuente única: app_settings.tier_thresholds).
  // Hasta la migración de 2026-07-02, la caja admin usaba pricing_config.
  // El hook `useTierThresholds` es reactivo y se comparte con la tienda
  // del cliente, así los umbrales quedan sincronizados entre admin y app.
  const globalThresholds = useTierThresholds();

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
  // Snapshot del cliente "elegido" desde las sugerencias — sirve para
  // mostrar tarjeta de cliente recurrente en la caja (compras totales,
  // saldo pendiente, última visita).
  const [selectedHistory, setSelectedHistory] = useState<CustomerSnapshot | null>(
    null
  );

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
        debug.error("Error cargando catálogo o configuración:", e);
        toast.error("No se pudo cargar el catálogo");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- Tier global del carrito (cross-product wholesale) ----------
   * IMPORTANTE: cada línea calcula su tier POR SEPARADO usando sus
   * propios umbrales (variante > producto > global) y el total del
   * carrito. Este `cartTier` es el tier calculado con los umbrales
   * GLOBALES únicamente — sirve para el banner "Vas a mayoreo cuando
   * llegues a X pz" y para colorear el badge, pero NO reprice
   * globalmente. El repricing real vive en `repricedCart`.
   */
  const totalQty = useMemo(
    () => cart.reduce((acc, i) => acc + i.qty, 0),
    [cart]
  );
  const cartTier = useMemo(
    () => tierForLine(totalQty, globalThresholds),
    [totalQty, globalThresholds]
  );

  /* ---------- Reprice POR LÍNEA con umbrales resueltos ----------
   * Cada línea:
   *   1) Resuelve sus umbrales por cascada (variante > producto > global).
   *   2) Calcula su tier con el total del carrito y sus umbrales.
   *   3) Aplica priceForTier() con SUS precios y SU tier.
   * Las líneas de preventa mantienen su precio congelado (ver is_preorder).
   */
  const repricedCart = useMemo<CartItem[]>(
    () =>
      cart.map((i) => {
        // Preventa / oversell: precio ya fijado al agregar. No repricear.
        if (i.is_preorder) return i;
        const thresholds = resolveThresholds(
          {
            tier_umbral_medio: i.variant_tier_umbral_medio,
            tier_umbral_mayoreo: i.variant_tier_umbral_mayoreo,
          },
          {
            tier_umbral_medio: i.product_tier_umbral_medio,
            tier_umbral_mayoreo: i.product_tier_umbral_mayoreo,
          },
          globalThresholds,
        );
        const tier = tierForLine(totalQty, thresholds);
        const price = priceForTier(i, tier);
        return { ...i, tier, price };
      }),
    [cart, totalQty, globalThresholds]
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
    () => piecesToNextTierForLine(totalQty, globalThresholds),
    [totalQty, globalThresholds]
  );

  /* ---------- Mutaciones del carrito ---------- */
  const addToCart = useCallback((v: any) => {
    const rules = getBusinessRules();
    const stockNum = Number(v.stock) || 0;

    // Precio menudeo base de la variante (referencia para preventa).
    const menudeoBase = Number(v.price_menudeo) || Number(v.price) || 0;

    // ¿El producto padre tiene preventa por PRODUCTO activa? (nueva
    // mecánica). Reemplaza el precio menudeo con el precio de preventa
    // y marca la línea como preorder para no repricear por tier.
    const productForPresale = {
      presale_active: v.products?.presale_active ?? null,
      presale_price: v.products?.presale_price ?? null,
      presale_discount_pct: v.products?.presale_discount_pct ?? null,
      presale_ends_at: v.products?.presale_ends_at ?? null,
      presale_note: v.products?.presale_note ?? null,
    };
    const productPresale = computePresale(productForPresale, menudeoBase);

    // Preventa por REGLA VIEJA: block_oversell=off + stock=0. Precio
    // menudeo con descuento global (`preorder_discount_percent`).
    const preorderPct = Math.max(
      0,
      Math.min(50, Number(rules.preorder_discount_percent) || 0),
    );
    const oversellAvailable = !rules.block_oversell && stockNum <= 0;

    // ¿Esta línea se está agregando como preventa?
    // Prioridad: preventa por producto (explícita del admin) > regla vieja.
    const isPreorderLine = productPresale.active || oversellAvailable;

    setCart((prev) => {
      const exist = prev.find((i) => i.variant_id === v.id);
      const currentQty = exist?.qty ?? 0;
      const nextQty = currentQty + 1;

      // Cap defensivo por línea. Cuando hay stock físico, respetamos ese
      // stock. Cuando la preventa aplica (producto o regla) y NO hay
      // stock, usamos PREORDER_CAP para evitar líneas absurdas.
      const cap = productPresale.active
        ? stockNum > 0 ? stockNum : PREORDER_CAP
        : oversellAvailable
          ? PREORDER_CAP
          : stockNum;

      // Bloqueo defensivo: si preventa NO aplica y no hay stock, avisar.
      if (!isPreorderLine && rules.block_oversell && nextQty > stockNum) {
        if (stockNum <= 0) {
          toast.error("Sin stock disponible — preventa deshabilitada");
        } else {
          toast.error(`Solo hay ${stockNum} pz disponibles`);
        }
        return prev;
      }
      // Cap de preventa: no permitir pasar del cap defensivo.
      if (isPreorderLine && nextQty > cap) {
        toast.error(`Cap de preventa: máximo ${cap} pz por línea`);
        return prev;
      }

      if (exist) {
        return prev.map((i) =>
          i.variant_id === v.id ? { ...i, qty: i.qty + 1 } : i
        );
      }

      const menudeo = menudeoBase;
      const medio = Number(v.price_medio) || 0;
      const mayoreo = Number(v.price_mayoreo) || 0;

      // Precio final de la línea:
      //   - Preventa por producto → precio efectivo (fijo o con %)
      //   - Preventa por regla vieja → menudeo × (1 - preorderPct/100)
      //   - Normal → menudeo (se repricea después según tier del carrito)
      const finalPrice = productPresale.active
        ? productPresale.effectivePrice
        : oversellAvailable && preorderPct > 0
          ? Math.round(menudeo * (1 - preorderPct / 100) * 100) / 100
          : menudeo;

      const newItem: CartItem = {
        variant_id: v.id,
        product_id: v.product_id ?? v.products?.id ?? null,
        name: v.products?.name ?? "Producto",
        variant_name: v.variant_name,
        qty: 1,
        stock: stockNum,
        // La columna `cost` no existe en variants; el costo efectivo
        // es cost_override (si lo hay) o el costo del producto padre.
        cost: Number(v.cost_override ?? v.products?.cost ?? 0),

        price_menudeo: menudeo,
        price_medio: medio,
        price_mayoreo: mayoreo,

        // Estos dos se recalculan con `repricedCart` según el tier global,
        // EXCEPTO cuando is_preorder=true (ver repricedCart).
        price: finalPrice,
        tier: "menudeo",
        is_preorder: isPreorderLine,

        // Overrides de umbrales — RAW desde la BD (se resuelven con
        // cascada en repricedCart). NULL = hereda del siguiente nivel.
        variant_tier_umbral_medio: v.tier_umbral_medio ?? null,
        variant_tier_umbral_mayoreo: v.tier_umbral_mayoreo ?? null,
        product_tier_umbral_medio: v.products?.tier_umbral_medio ?? null,
        product_tier_umbral_mayoreo: v.products?.tier_umbral_mayoreo ?? null,
      };

      // Aviso al admin del modo en que se agregó
      if (productPresale.active) {
        toast.success(
          `Preventa · ${
            productPresale.savingPct > 0
              ? `-${Math.round(productPresale.savingPct)}%`
              : "precio especial"
          }`,
          { icon: "🎁", duration: 1600 },
        );
      } else if (oversellAvailable && preorderPct > 0) {
        toast(`Sin stock · Preventa -${preorderPct}%`, {
          icon: "📦",
          duration: 1600,
        });
      }

      return [...prev, newItem];
    });
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    if (qty < 1) return;
    const rules = getBusinessRules();
    setCart((prev) =>
      prev.map((i) => {
        if (i.variant_id !== id) return i;
        // Preventa: usa cap defensivo (stock si hay, PREORDER_CAP si no).
        if (i.is_preorder) {
          const cap = i.stock > 0 ? i.stock : PREORDER_CAP;
          if (qty > cap) {
            toast.error(`Cap de preventa: máximo ${cap} pz`);
            return i;
          }
          return { ...i, qty };
        }
        if (rules.block_oversell && qty > i.stock) {
          toast.error(`Solo hay ${i.stock} pz disponibles`);
          return i;
        }
        return { ...i, qty };
      })
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
    setSelectedHistory(null);
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
    // Si el admin editó el nombre y ya no coincide con el cliente seleccionado,
    // ocultamos la tarjeta de cliente recurrente para no confundir.
    if (
      selectedHistory &&
      selectedHistory.name.trim().toLowerCase() !== q.toLowerCase()
    ) {
      setSelectedHistory(null);
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
  }, [customer, selectedHistory]);

  /** Auto-rellena teléfono/dirección/ubicación al elegir un cliente sugerido */
  const pickCustomer = useCallback((c: CustomerSnapshot) => {
    setCustomer(c.name);
    if (c.phone) setPhone(c.phone);
    if (c.address) setAddress(c.address);
    if (c.location) setLocationUrl(c.location);
    setCustomerSuggestions([]);
    setSelectedHistory(c);
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
      const ok = await confirmAction({
        title: "Venta de alto valor",
        description: `Esta venta supera ${rules.high_value_threshold.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}. ¿Confirmas que es correcta?`,
        confirmLabel: "Sí, confirmar",
        tone: "primary",
      });
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

      // Milestones: primera venta del día + counter de racha.
      // El sistema central de achievements maneja confetti + toast +
      // sonido del pack activo (no necesita escribir flags manualmente).
      try {
        const { tryUnlock } = await import("../../lib/achievements");
        tryUnlock("first_sale_today");
        // Contador de ventas del día — cuando llega a 10, dispara la racha
        const todayKey = `mari:sales-count:${new Date().toISOString().slice(0, 10)}`;
        const prev = Number(localStorage.getItem(todayKey)) || 0;
        const next = prev + 1;
        localStorage.setItem(todayKey, String(next));
        if (next >= 10) {
          tryUnlock("ten_sales_streak");
        }
        // Suma del revenue del día — para "daily_goal_reached"
        const rules2 = getBusinessRules();
        if (rules2.daily_sales_goal_enabled && rules2.daily_sales_goal_amount > 0) {
          const revKey = `mari:sales-revenue:${new Date().toISOString().slice(0, 10)}`;
          const prevRev = Number(localStorage.getItem(revKey)) || 0;
          const newRev = prevRev + (Number((repricedCart ?? []).reduce(
            (a, it) => a + (Number(it.qty) || 0) * (Number(it.unit_price) || 0),
            0,
          )) || 0);
          localStorage.setItem(revKey, String(newRev));
          if (newRev >= rules2.daily_sales_goal_amount) {
            tryUnlock("daily_goal_reached");
          }
        }
      } catch {}
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
      selectedHistory,
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
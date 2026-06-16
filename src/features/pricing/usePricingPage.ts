import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { toast } from "react-hot-toast";

export function usePricingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [cfg, setCfg] = useState<any>({
    margen_menudeo: 30,
    margen_medio: 25,
    margen_mayoreo: 20,
    umbral_medio: 6,
    umbral_mayoreo: 12,
    costo_extra: 0
  });

  const [rows, setRows] = useState<any[]>([
    {
      key: crypto.randomUUID(),
      productId: "",
      variantId: "",
      quantity: 1,
      manualPrice: "",
      manualExtraCost: "",
      tierApplied: "menudeo"
    }
  ]);

  const fetchData = async () => {
    try {
      const { data: p } = await supabase
        .from("products")
        .select("*, variants(*)");

      const { data: c } = await supabase
        .from("pricing_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (p) setProducts(p);
      if (c) setCfg(c);
    } catch (error) {
      console.error("Error al cargar datos:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const computed = useMemo(() => {
    return rows.map((r) => {
      const product = products.find(p => p.id === r.productId) || null;

      const variant =
        product?.variants?.find((v: any) => v.id === r.variantId) ||
        null;

      // El costo real viene de cost_override en la variante (si lo tiene)
      // o del cost del producto. NUNCA de variant.cost (no existe).
      const costBase = Number(
        variant?.cost_override ?? product?.cost ?? 0
      );

      const globalExtra = Number(cfg?.costo_extra || 0);
      const manualExtra = Number(r.manualExtraCost || 0);

      const totalOperatingCost =
        costBase + globalExtra + manualExtra;

      const m_menudeo = Number(cfg.margen_menudeo) / 100;
      const m_medio = Number(cfg.margen_medio) / 100;
      const m_mayoreo = Number(cfg.margen_mayoreo) / 100;

      const suggestedPrices = {
        menudeo: Math.round(
          totalOperatingCost / (1 - m_menudeo)
        ),
        medio: Math.round(
          totalOperatingCost / (1 - m_medio)
        ),
        mayoreo: Math.round(
          totalOperatingCost / (1 - m_mayoreo)
        )
      };

      const qty = Number(r.quantity) || 0;

      // Tier sugerido por cantidad (solo para resaltar uno)
      let tierByQty: "menudeo" | "medio" | "mayoreo" = "menudeo";
      if (qty >= Number(cfg.umbral_mayoreo)) tierByQty = "mayoreo";
      else if (qty >= Number(cfg.umbral_medio)) tierByQty = "medio";

      // Tier activo = el que el usuario eligió, o el sugerido por qty.
      const tierApplied: "menudeo" | "medio" | "mayoreo" =
        r.tierApplied || tierByQty;

      const tierPrice = suggestedPrices[tierApplied];

      // Precio final: si capturó manualPrice usa ese, si no el del tier elegido.
      const finalPrice =
        Number(r.manualPrice) > 0
          ? Number(r.manualPrice)
          : tierPrice;

      const profit = finalPrice - totalOperatingCost;

      const realMarginPercent =
        finalPrice > 0
          ? (profit / finalPrice) * 100
          : 0;

      return {
        ...r,
        product,
        variant,
        totalOperatingCost,
        suggestedPrices,
        finalPrice,
        realMarginPercent,
        tierApplied
      };
    });
  }, [rows, products, cfg]);

  const addRow = () =>
    setRows([
      ...rows,
      {
        key: crypto.randomUUID(),
        productId: "",
        variantId: "",
        quantity: 1,
        manualPrice: "",
        manualExtraCost: "",
        tierApplied: "menudeo"
      }
    ]);

  const removeRow = (key: string) =>
    setRows(rows.filter(r => r.key !== key));

  const updateRow = (key: string, updates: any) =>
    setRows(
      rows.map(r =>
        r.key === key ? { ...r, ...updates } : r
      )
    );

  // Aplica los 3 precios calculados a la(s) variante(s) reales y registra
  // historial en pricing_operations. Si la fila tiene variantId → solo esa.
  // Si NO tiene variantId → aplica a TODAS las variantes activas del producto.
  const saveAnalysis = async () => {
    const validRows = computed.filter(r => r.productId !== "");
    if (validRows.length === 0) {
      toast.error("Selecciona al menos un producto");
      return;
    }

    const toastId = toast.loading("Aplicando precios a las variantes...");
    setIsSaving(true);

    try {
      let variantsUpdated = 0;

      for (const r of validRows) {
        const sp = r.suggestedPrices;
        const priceBase = Number(r.finalPrice) || Number(sp[r.tierApplied]) || 0;

        const priceUpdate = {
          price: priceBase,
          price_menudeo: Number(sp.menudeo) || 0,
          price_medio: Number(sp.medio) || 0,
          price_mayoreo: Number(sp.mayoreo) || 0,
        };

        // Determinar qué variantes actualizar
        const targetVariantIds: string[] = r.variantId
          ? [r.variantId]
          : (r.product?.variants ?? [])
              .filter((v: any) => v.is_active !== false)
              .map((v: any) => v.id);

        if (targetVariantIds.length === 0) {
          throw new Error(
            `"${r.product?.name}" no tiene variantes para aplicar precios`
          );
        }

        const { error: vError } = await supabase
          .from("variants")
          .update(priceUpdate)
          .in("id", targetVariantIds);

        if (vError) {
          throw new Error(`Error actualizando variantes: ${vError.message}`);
        }

        variantsUpdated += targetVariantIds.length;

        // Historial — una fila por aplicación
        const { error: histError } = await supabase
          .from("pricing_operations")
          .insert([
            {
              product_id: r.productId,
              variant_id: r.variantId || null,
              product_name_snapshot: r.product?.name || "Sin nombre",
              variant_name_snapshot:
                r.variant?.variant_name ||
                (r.variantId ? "Variante" : "Todas las variantes"),
              quantity: Number(r.quantity) || 0,
              extra_cost: Number(r.manualExtraCost) || 0,
              cost_unit: Number(r.totalOperatingCost) || 0,
              cost_final: Number(r.totalOperatingCost) || 0,
              price_menudeo: Number(sp.menudeo) || 0,
              price_medio: Number(sp.medio) || 0,
              price_mayoreo: Number(sp.mayoreo) || 0,
              price_applied: priceBase,
              tier: r.tierApplied || "menudeo",
              total: priceBase * (Number(r.quantity) || 0),
              margin_percent: Number(r.realMarginPercent) || 0,
            }
          ]);

        if (histError) {
          console.error(histError);
          throw new Error(`Error guardando historial: ${histError.message}`);
        }
      }

      toast.success(
        `Precios aplicados a ${variantsUpdated} ${
          variantsUpdated === 1 ? "variante" : "variantes"
        } ✓`,
        { id: toastId }
      );

      await fetchData();

      setRows([
        {
          key: crypto.randomUUID(),
          productId: "",
          variantId: "",
          quantity: 1,
          manualPrice: "",
          manualExtraCost: "",
          tierApplied: "menudeo"
        }
      ]);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Error desconocido", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    products,
    addRow,
    removeRow,
    updateRow,
    computed,
    saveAnalysis,
    isSaving
  };
}
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
      manualExtraCost: ""
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

      // 🔥 AQUÍ ESTÁ EL FIX REAL
      const variant =
        product?.variants?.find((v: any) => v.id === r.variantId) ||
        product?.variants?.[0] ||
        null;

      const costBase = Number(
        variant?.cost ?? product?.cost ?? 0
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

      let tierApplied: "menudeo" | "medio" | "mayoreo" = "menudeo";
      let marginApplied = m_menudeo;

      if (qty >= Number(cfg.umbral_mayoreo)) {
        marginApplied = m_mayoreo;
        tierApplied = "mayoreo";
      } else if (qty >= Number(cfg.umbral_medio)) {
        marginApplied = m_medio;
        tierApplied = "medio";
      }

      const suggestedPrice =
        totalOperatingCost / (1 - marginApplied);

      const finalPrice =
        Number(r.manualPrice) > 0
          ? Number(r.manualPrice)
          : suggestedPrice;

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
        manualExtraCost: ""
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

  const saveAnalysis = async () => {
    const toastId = toast.loading(
      "Sincronizando precios y registrando historial..."
    );
    setIsSaving(true);

    try {
      const validRows = computed.filter(
        r => r.productId !== ""
      );

      if (validRows.length === 0) {
        toast.error("Selecciona al menos un producto", {
          id: toastId
        });
        setIsSaving(false);
        return;
      }

      for (const r of validRows) {
        if (r.variantId) {
          const { error: vError } = await supabase
            .from("variants")
            .update({
              price: Number(r.finalPrice)
            })
            .eq("id", r.variantId);

          if (vError)
            throw new Error(
              `Error en tabla variants: ${vError.message}`
            );
        }

        const { error: histError } = await supabase
          .from("pricing_operations")
          .insert([
            {
              product_id: r.productId,
              product_name_snapshot:
                r.product?.name || "Sin nombre",
              variant_name_snapshot:
                r.variant?.variant_name ||
                r.variant?.name ||
                "Único",
              quantity: Number(r.quantity) || 0,
              cost_unit:
                Number(r.totalOperatingCost) || 0,
              price_applied:
                Number(r.finalPrice) || 0,
              tier: r.tierApplied || "menudeo",
              total:
                Number(r.finalPrice) *
                (Number(r.quantity) || 0),
              margin_percent:
                Number(r.realMarginPercent) || 0,
              created_at: new Date().toISOString()
            }
          ]);

        if (histError) {
          console.error(histError);
          throw new Error(
            `Error en historial: ${histError.message}`
          );
        }
      }

      toast.success("Análisis guardado con éxito.", {
        id: toastId
      });

      await fetchData();

      setRows([
        {
          key: crypto.randomUUID(),
          productId: "",
          variantId: "",
          quantity: 1,
          manualPrice: "",
          manualExtraCost: ""
        }
      ]);
    } catch (error: any) {
      console.error(error);
      toast.error(
        error.message || "Error desconocido",
        { id: toastId }
      );
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
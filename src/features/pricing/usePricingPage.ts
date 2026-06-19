import { useState, useMemo, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { toast } from "react-hot-toast";
import { debug } from "../../lib/debug";

/**
 * Convierte un valor tipo string/number a número tolerante a:
 *  - separador decimal coma (locale es): "10,50" → 10.50
 *  - espacios y separadores de miles: "1 200,50" → 1200.50
 *  - cualquier carácter no numérico residual.
 * En iPhone/Android español los teclados a veces escriben "," como
 * separador decimal y `Number("10,50")` devuelve `NaN`, lo cual hacía
 * que los precios manuales se quedaran en 0 y la calculadora los
 * ignorara al guardar. Esto evita ese bug silencioso.
 */
function parseAmount(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  // Elimina espacios (incl. no-breaking) y símbolos comunes
  s = s.replace(/[\s\u00a0$]/g, "");
  // Si hay coma sin punto → la coma es decimal
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  // Si hay ambos, asumimos coma=miles y punto=decimal → quita comas
  else if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

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
      manualExtraCost: "",
      overrideMenudeo: "",
      overrideMedio: "",
      overrideMayoreo: "",
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
      debug.error("Error al cargar datos:", error);
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

      // Costo real = cost_override de la variante (si elegida) o cost del producto
      const costBase = Number(
        variant?.cost_override ?? product?.cost ?? 0
      );

      const globalExtra = Number(cfg?.costo_extra || 0);
      const manualExtra = parseAmount(r.manualExtraCost);

      const totalOperatingCost =
        costBase + globalExtra + manualExtra;

      const m_menudeo = Number(cfg.margen_menudeo) / 100;
      const m_medio = Number(cfg.margen_medio) / 100;
      const m_mayoreo = Number(cfg.margen_mayoreo) / 100;

      // Fórmula: precio = costo * (1 + margen%)
      // (margen sobre costo, NO margen sobre precio de venta)
      const suggestedPrices = {
        menudeo: Math.round(totalOperatingCost * (1 + m_menudeo) * 100) / 100,
        medio: Math.round(totalOperatingCost * (1 + m_medio) * 100) / 100,
        mayoreo: Math.round(totalOperatingCost * (1 + m_mayoreo) * 100) / 100,
      };

      // Precios FINALES = override manual si existe, si no el sugerido.
      // Usamos parseAmount para tolerar coma decimal del teclado español
      // (antes Number("10,50") devolvía NaN y el override se perdía).
      const ovMen = parseAmount(r.overrideMenudeo);
      const ovMed = parseAmount(r.overrideMedio);
      const ovMay = parseAmount(r.overrideMayoreo);
      const finalMenudeo = ovMen > 0 ? ovMen : suggestedPrices.menudeo;
      const finalMedio = ovMed > 0 ? ovMed : suggestedPrices.medio;
      const finalMayoreo = ovMay > 0 ? ovMay : suggestedPrices.mayoreo;

      const profit = finalMenudeo - totalOperatingCost;
      const realMarginPercent =
        finalMenudeo > 0 ? (profit / finalMenudeo) * 100 : 0;

      return {
        ...r,
        product,
        variant,
        totalOperatingCost,
        suggestedPrices,
        finalMenudeo,
        finalMedio,
        finalMayoreo,
        realMarginPercent,
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
        manualExtraCost: "",
        overrideMenudeo: "",
        overrideMedio: "",
        overrideMayoreo: "",
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
        const priceMen = Number(r.finalMenudeo) || 0;
        const priceMed = Number(r.finalMedio) || 0;
        const priceMay = Number(r.finalMayoreo) || 0;

        if (priceMen <= 0 && priceMed <= 0 && priceMay <= 0) {
          throw new Error(
            `${r.product?.name}: necesitas costo > 0 o precios manuales`
          );
        }

        // Construir update SOLO con columnas que tengan precio > 0.
        // Si el costo es 0 y el usuario sólo puso un precio manual en una
        // categoría (ej. menudeo), las otras tendrían 0 y borraríamos los
        // precios previos en la BD. Para evitarlo, omitimos los 0.
        const priceUpdate: Record<string, number> = {};
        if (priceMen > 0) {
          priceUpdate.price = priceMen;
          priceUpdate.price_menudeo = priceMen;
        }
        if (priceMed > 0) {
          priceUpdate.price_medio = priceMed;
        }
        if (priceMay > 0) {
          priceUpdate.price_mayoreo = priceMay;
        }

        if (Object.keys(priceUpdate).length === 0) {
          throw new Error(
            `${r.product?.name}: ningún precio quedó > 0`
          );
        }

        // Determinar qué variantes actualizar
        const targetVariantIds: string[] = r.variantId
          ? [r.variantId]
          : (r.product?.variants ?? [])
              .filter((v: any) => v.is_active !== false)
              .map((v: any) => v.id);

        if (targetVariantIds.length === 0) {
          throw new Error(
            `"${r.product?.name}" no tiene variantes para aplicar precios. ` +
              `Crea una variante primero desde Inventario.`
          );
        }

        const { data: updatedRows, error: vError } = await supabase
          .from("variants")
          .update(priceUpdate)
          .in("id", targetVariantIds)
          .select("id");

        if (vError) {
          throw new Error(`Error actualizando variantes: ${vError.message}`);
        }

        // Si Supabase reportó 0 filas afectadas, lo más probable es RLS.
        if (!updatedRows || updatedRows.length === 0) {
          throw new Error(
            `0 variantes actualizadas para "${r.product?.name}". ` +
              `Revisa permisos (RLS) o que las variantes existan.`
          );
        }

        variantsUpdated += updatedRows.length;

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
              quantity: targetVariantIds.length,
              extra_cost: parseAmount(r.manualExtraCost),
              cost_unit: Number(r.totalOperatingCost) || 0,
              cost_final: Number(r.totalOperatingCost) || 0,
              price_menudeo: priceMen,
              price_medio: priceMed,
              price_mayoreo: priceMay,
              price_applied: priceMen,
              tier: "menudeo",
              total: priceMen,
              margin_percent: Number(r.realMarginPercent) || 0,
            }
          ]);

        if (histError) {
          // El historial es secundario: si falla NO revertimos los precios.
          debug.error("[pricing] historial falló (no crítico):", histError);
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
          manualExtraCost: "",
          overrideMenudeo: "",
          overrideMedio: "",
          overrideMayoreo: "",
        }
      ]);
    } catch (error: any) {
      debug.error(error);
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
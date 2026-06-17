import { useState } from "react";
import { toast } from "react-hot-toast";
import { createProduct, createVariant } from "../products/productService";
import { applyMovement } from "./movementService";
import { debug } from "../../lib/debug";

/**
 * Hook para Creación de Productos
 * Ajustado para usar 'onSuccess' y sincronizar con InventoryPage.
 */
export function useCreateProduct(onClose: () => void, onSuccess: () => void) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState<number | "">("");
  const [minStock, setMinStock] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const cleanName = name.trim();
    const numCost = Number(cost);

    if (!cleanName) return toast.error("El nombre es obligatorio");
    if (cost === "" || numCost <= 0) return toast.error("El costo debe ser mayor a 0");

    setSaving(true);
    try {
      await createProduct({
        name: cleanName,
        category: category.trim() || undefined,
        cost: numCost,
        min_stock: minStock === "" ? 0 : Number(minStock)
      });

      toast.success("Producto creado con éxito");

      setName("");
      setCategory("");
      setCost("");
      setMinStock("");

      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al crear producto");
    } finally {
      setSaving(false);
    }
  }

  return {
    name,
    setName,
    category,
    setCategory,
    cost,
    setCost,
    minStock,
    setMinStock,
    saving,
    save
  };
}

/**
 * Hook para Creación de Variantes
 */
export function useCreateVariant(productId: string | null, onClose: () => void, onSuccess: () => void) {
  const [variantName, setVariantName] = useState("");
  const [sku, setSku] = useState("");
  const [initialStock, setInitialStock] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!productId) return toast.error("Error: Producto no identificado");
    if (!variantName.trim()) return toast.error("La variante necesita un nombre");

    setSaving(true);
    try {
      const v = await createVariant({
        product_id: productId,
        variant_name: variantName.trim(),
        sku: sku.trim() || undefined
      });

      const qty = initialStock === "" ? 0 : Number(initialStock);

      if (qty > 0) {
        await applyMovement({
          variantId: v.id,
          type: "entrada",
          quantity: qty
        });
      }

      toast.success(qty > 0 ? "Variante y stock inicial creados" : "Variante creada");
      
      setVariantName(""); setSku(""); setInitialStock("");
      onClose();
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message ?? "Error creando variante");
    } finally {
      setSaving(false);
    }
  }

  return { variantName, setVariantName, sku, setSku, initialStock, setInitialStock, saving, save };
}

export function useMovementModal(variantId: string | null, type: "entrada" | "venta", onClose: () => void, onSuccess: () => void) {
  const [qty, setQty] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  async function apply() {
    if (!variantId) return toast.error("Error: ID de variante no encontrado");
    
    const q = Number(qty);
    if (!qty || q <= 0) return toast.error("La cantidad debe ser mayor a 0");

    setSaving(true);
    try {
      await applyMovement({
        variantId,
        type,
        quantity: q
      });

      toast.success(type === "entrada" ? "✅ Entrada registrada" : "🛒 Venta registrada");
      
      setQty("");
      onClose();
      onSuccess();
    } catch (e: any) {
      debug.error(e);
      toast.error(e?.message ?? "Error en el movimiento");
    } finally {
      setSaving(false);
    }
  }

  return { qty, setQty, saving, apply };
}
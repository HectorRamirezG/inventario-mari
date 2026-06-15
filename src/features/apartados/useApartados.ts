import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  addPayment,
  cancelSale,
  listApartados,
} from "./apartadosService";
import { supabase } from "../../lib/supabase";
import { sound } from "../../lib/sound";
import type { Sale } from "../../types/database";

export type ApartadosFilter = "pending" | "paid" | "all";

export function useApartados() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ApartadosFilter>("pending");
  const [onlyLayaway, setOnlyLayaway] = useState(false);
  const [search, setSearch] = useState("");
  // IDs de ventas que tienen al menos un comprobante PENDING sin revisar
  const [pendingProofIds, setPendingProofIds] = useState<Set<string>>(new Set());

  const refreshProofs = useCallback(async (saleIds: string[]) => {
    if (saleIds.length === 0) {
      setPendingProofIds(new Set());
      return;
    }
    try {
      const { data } = await supabase
        .from("payment_proofs")
        .select("sale_id")
        .eq("status", "pending")
        .in("sale_id", saleIds);
      setPendingProofIds(new Set((data ?? []).map((p: any) => p.sale_id)));
    } catch {
      /* silencio: tabla puede no existir aún */
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listApartados({
        status: filter,
        onlyLayaway,
        limit: 200,
      });
      setSales(data);
      refreshProofs(data.map((s) => s.id));
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando apartados");
    } finally {
      setLoading(false);
    }
  }, [filter, onlyLayaway, refreshProofs]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh cuando admin aprueba un pago desde el drawer global
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("mari:apartado-refresh", handler);
    return () => window.removeEventListener("mari:apartado-refresh", handler);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        (s.customer_name ?? "").toLowerCase().includes(q) ||
        (s.customer_phone ?? "").toLowerCase().includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q)
    );
  }, [sales, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => {
        acc.count += 1;
        acc.total += Number(s.total) || 0;
        acc.paid += Number(s.paid) || 0;
        acc.balance += Number(s.balance) || 0;
        return acc;
      },
      { count: 0, total: 0, paid: 0, balance: 0 }
    );
  }, [filtered]);

  const handleAddPayment = useCallback(
    async (saleId: string, amount: number, method = "efectivo") => {
      const toastId = toast.loading("Registrando abono...");
      try {
        await addPayment(saleId, amount, method);
        sound.success();
        toast.success("Abono registrado 💖", { id: toastId });
        await refresh();
        return true;
      } catch (e: any) {
        sound.error();
        toast.error(e?.message ?? "Error al abonar", { id: toastId });
        return false;
      }
    },
    [refresh]
  );

  const handleCancelSale = useCallback(
    async (saleId: string) => {
      if (
        !window.confirm(
          "¿Cancelar esta venta? El stock se devolverá al inventario."
        )
      )
        return false;
      const toastId = toast.loading("Cancelando venta...");
      try {
        await cancelSale(saleId);
        toast.success("Venta cancelada (stock devuelto)", { id: toastId });
        await refresh();
        return true;
      } catch (e: any) {
        toast.error(e?.message ?? "Error al cancelar", { id: toastId });
        return false;
      }
    },
    [refresh]
  );

  return {
    state: {
      sales: filtered,
      loading,
      filter,
      onlyLayaway,
      search,
      totals,
      pendingProofIds,
    },
    actions: {
      setFilter,
      setOnlyLayaway,
      setSearch,
      refresh,
      handleAddPayment,
      handleCancelSale,
    },
  };
}

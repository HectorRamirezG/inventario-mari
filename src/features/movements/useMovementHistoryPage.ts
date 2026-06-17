import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { toast } from "react-hot-toast";
import { getMovementHistory, registrarAbono } from "./movementHistoryService";

export function useMovementHistoryPage() {
  const [type, setType] = useState<"all" | "entrada" | "venta">("all");
  const [q, setQ] = useState("");
  // El filter se computa con valor diferido para no bloquear input
  const deferredQ = useDeferredValue(q);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [montoAbono, setMontoAbono] = useState("");
  const [isSavingAbono, setIsSavingAbono] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const data = await getMovementHistory({ limit: 100 });
      setRows(data || []);
    } catch (e) {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Pull-to-refresh global + eventos de apartados
  useEffect(() => {
    const handler = () => { void refresh(); };
    window.addEventListener("mari:pull-refresh", handler);
    window.addEventListener("mari:apartado-refresh", handler);
    return () => {
      window.removeEventListener("mari:pull-refresh", handler);
      window.removeEventListener("mari:apartado-refresh", handler);
    };
  }, []);

  const filtered = useMemo(() => {
    let result = rows;

    // 1. Filtro por Tipo (Si el SQL no lo hace, lo hace el TS)
    if (type === "venta") result = result.filter(r => r.sale_id !== null);
    if (type === "entrada") result = result.filter(r => r.sale_id === null);

    // 2. Filtro por búsqueda
    const s = deferredQ.trim().toLowerCase();
    if (s) {
      result = result.filter((r) => {
        const customerMatch = (r.customer || "").toLowerCase().includes(s);
        const itemMatch = r.items?.some((i: any) => 
          (i.name || "").toLowerCase().includes(s)
        );
        return customerMatch || itemMatch;
      });
    }

    return result;
  }, [deferredQ, rows, type]);

  const ejecutarAbono = async () => {
    if (!montoAbono || Number(montoAbono) <= 0) return toast.error("Monto inválido");
    setIsSavingAbono(true);
    try {
      // Usamos sale_id que viene de tu consulta
      await registrarAbono(selectedSale.sale_id, Number(montoAbono));
      toast.success("Pago registrado");
      setSelectedSale(null);
      setMontoAbono("");
      refresh();
    } catch (e) {
      toast.error("Error al guardar");
    } finally {
      setIsSavingAbono(false);
    }
  };

  return { 
    type, setType, q, setQ, filtered, loading,
    selectedSale, setSelectedSale, montoAbono, setMontoAbono,
    isSavingAbono, ejecutarAbono 
  };
}
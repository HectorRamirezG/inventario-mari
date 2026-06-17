import { useState, useEffect, useMemo, useCallback } from "react";
// Asumo que este servicio ya trae los campos price_medio y price_mayoreo
import { getPricingHistory } from "./pricingHistoryService";
import { debug } from "../../lib/debug";

export function usePricingHistory() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [tier, setTier] = useState<any>("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fromISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - Number(range));
    return d.toISOString();
  }, [range]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPricingHistory({ fromISO, type: tier });
      setRows(data);
    } catch (e) {
      debug.error("Error al traer historial:", e);
    } finally {
      setLoading(false);
    }
  }, [fromISO, tier]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    return rows.filter(r => 
      (r.product_name || "").toLowerCase().includes(q.toLowerCase())
    );
  }, [q, rows]);

  const stats = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    return {
      total,
      count: filtered.length,
      avg: filtered.length ? total / filtered.length : 0
    };
  }, [filtered]);

  return { 
    range, setRange, tier, setTier, q, setQ, 
    filtered, loading, refresh, 
    totalFiltered: stats.total, 
    totalCount: stats.count, 
    averagePrice: stats.avg 
  };
}
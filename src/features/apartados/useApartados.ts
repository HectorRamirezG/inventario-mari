import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import Fuse from "fuse.js";
import {
  addPayment,
  cancelSale,
  getLatestProofActivity,
  listApartados,
} from "./apartadosService";
import { supabase } from "../../lib/supabase";
import { sound } from "../../lib/sound";
import { confirmAction } from "../../lib/confirm";
import { promptDialog } from "../../lib/prompt";
import type { Sale } from "../../types/database";

export type ApartadosFilter = "pending" | "paid" | "all";

export function useApartados() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  // Default = "all" para no ocultar tarjetas al admin (antes era "pending").
  const [filter, setFilter] = useState<ApartadosFilter>("all");
  const [onlyLayaway, setOnlyLayaway] = useState(false);
  const [search, setSearch] = useState("");
  // IDs de ventas que tienen al menos un comprobante PENDING sin revisar
  const [pendingProofIds, setPendingProofIds] = useState<Set<string>>(new Set());
  // Mapa sale_id → ISO date del comprobante más reciente (para ordenar por
  // última actividad: si un cliente sube un comprobante, su tarjeta brinca
  // al inicio del tablero).
  const [latestProofAt, setLatestProofAt] = useState<Record<string, string>>({});
  /**
   * Mapa sale_id → status de la comanda ACTIVA más reciente (si la hay).
   * Sólo nos importa la más reciente porque una venta normalmente tiene
   * sólo una comanda viva en cualquier momento. Sirve para mostrar el
   * chip "🛵 En camino" / "✅ Entregada" en la tarjeta.
   */
  const [deliveryStatusBySale, setDeliveryStatusBySale] = useState<
    Record<string, string>
  >({});

  const refreshDelivery = useCallback(async (saleIds: string[]) => {
    if (saleIds.length === 0) {
      setDeliveryStatusBySale({});
      return;
    }
    try {
      const { data } = await supabase
        .from("delivery_notes")
        .select("sale_id, status, created_at")
        .in("sale_id", saleIds)
        .order("created_at", { ascending: false });
      if (!data) return;
      // Nos quedamos con la primera (más reciente) por sale_id.
      const map: Record<string, string> = {};
      for (const row of data as Array<{
        sale_id: string;
        status: string;
        created_at: string;
      }>) {
        if (!map[row.sale_id]) map[row.sale_id] = row.status;
      }
      setDeliveryStatusBySale(map);
    } catch {
      /* silencio: tabla puede no existir aún */
    }
  }, []);

  const refreshProofs = useCallback(async (saleIds: string[]) => {
    if (saleIds.length === 0) {
      setPendingProofIds(new Set());
      setLatestProofAt({});
      return;
    }
    try {
      const [{ data: pending }, latest] = await Promise.all([
        supabase
          .from("payment_proofs")
          .select("sale_id")
          .eq("status", "pending")
          .in("sale_id", saleIds),
        getLatestProofActivity(saleIds),
      ]);
      setPendingProofIds(new Set((pending ?? []).map((p: any) => p.sale_id)));
      setLatestProofAt(latest);
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
      const ids = data.map((s) => s.id);
      refreshProofs(ids);
      refreshDelivery(ids);
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando apartados");
    } finally {
      setLoading(false);
    }
  }, [filter, onlyLayaway, refreshProofs, refreshDelivery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh cuando admin aprueba un pago desde el drawer global
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("mari:apartado-refresh", handler);
    window.addEventListener("mari:pull-refresh", handler);
    // Atajo desde la paleta de comandos: filtrar solo apartados pendientes
    const overdueHandler = () => {
      setFilter("pending");
      setOnlyLayaway(true);
    };
    window.addEventListener("apartados:filter-overdue", overdueHandler);
    // Atajo desde el CommandPalette universal: filtra por folio/cliente
    const focusHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      if (detail.query) setSearch(String(detail.query));
      if (detail.saleId) setSearch(String(detail.saleId).slice(0, 8));
    };
    window.addEventListener("apartados:focus", focusHandler);
    return () => {
      window.removeEventListener("mari:apartado-refresh", handler);
      window.removeEventListener("mari:pull-refresh", handler);
      window.removeEventListener("apartados:filter-overdue", overdueHandler);
      window.removeEventListener("apartados:focus", focusHandler);
    };
  }, [refresh]);

  // Realtime: cuando llega un comprobante o pago nuevo, refrescamos
  // sólo los timestamps de actividad (no toda la lista) para que la
  // tarjeta correspondiente brinque al inicio sin parpadear.
  useEffect(() => {
    if (sales.length === 0) return;
    const ids = sales.map((s) => s.id);
    const idsFilter = `sale_id=in.(${ids.join(",")})`;
    const channel = supabase
      .channel("apartados-activity")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payment_proofs",
          filter: idsFilter,
        },
        () => refreshProofs(ids)
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payments",
          filter: idsFilter,
        },
        () => refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_notes",
          filter: idsFilter,
        },
        () => refreshDelivery(ids)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sales, refresh, refreshProofs, refreshDelivery]);

  // Realtime adicional: escucha INSERT/UPDATE de cualquier sale para
  // que cuando entre una venta nueva (o cambie status) aparezca en la
  // lista sin esperar al pull-refresh. Independiente del listener
  // anterior (que filtra por sale_id, lo cual excluye INSERT nuevos).
  useEffect(() => {
    let debounceId: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(refresh, 500);
    };
    const channel = supabase
      .channel("apartados-sales-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales" },
        schedule,
      )
      .subscribe();
    return () => {
      if (debounceId) clearTimeout(debounceId);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  /**
   * Última actividad de una venta = max(created_at, último pago, último
   * comprobante). Se usa para ordenar el tablero. Como `sales` no tiene
   * `updated_at`, ésta es la mejor aproximación.
   */
  const lastActivityFor = useCallback(
    (s: Sale): number => {
      const ts: number[] = [new Date(s.created_at).getTime()];
      for (const p of s.payments ?? []) {
        const t = new Date(p.created_at).getTime();
        if (Number.isFinite(t)) ts.push(t);
      }
      const proof = latestProofAt[s.id];
      if (proof) {
        const t = new Date(proof).getTime();
        if (Number.isFinite(t)) ts.push(t);
      }
      return Math.max(...ts);
    },
    [latestProofAt]
  );

  // Fuse index — fuzzy search tolerante a typos en nombre/teléfono/folio/notas.
  // Re-creado solo cuando cambia la lista de sales.
  const fuse = useMemo(
    () =>
      new Fuse(sales, {
        keys: [
          { name: "customer_name", weight: 0.5 },
          { name: "customer_phone", weight: 0.2 },
          { name: "id", weight: 0.15 },
          { name: "notes", weight: 0.15 },
        ],
        threshold: 0.35,
        minMatchCharLength: 2,
        ignoreLocation: true,
      }),
    [sales]
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    const list = !q
      ? sales
      : fuse.search(q).map((r) => r.item);
    // Sort descendente por última actividad (tarjeta más fresca al inicio)
    return [...list].sort(
      (a, b) => lastActivityFor(b) - lastActivityFor(a)
    );
  }, [sales, search, lastActivityFor, fuse]);

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
      const ok = await confirmAction({
        title: "¿Cancelar esta venta?",
        description:
          "El stock se devolverá al inventario automáticamente. El cliente recibirá una notificación con el motivo. No se puede deshacer.",
        confirmLabel: "Sí, cancelar venta",
        tone: "danger",
      });
      if (!ok) return false;
      // Pedimos motivo opcional para que el cliente sepa POR QUÉ.
      // Si lo deja en blanco, igual cancela pero sin motivo.
      const reason = await promptDialog({
        title: "Motivo de cancelación (opcional)",
        description:
          "Se lo mandamos al cliente para que entienda. Ejemplos: 'Sin stock', 'Pago no acreditado', 'Cliente solicitó cancelar'.",
        placeholder: "Ej. Sin stock disponible…",
        confirmLabel: "Cancelar venta",
        cancelLabel: "Salir sin cancelar",
        multiline: true,
        maxLength: 280,
      });
      // Si el usuario presiona "Salir sin cancelar" devuelve null → abortar
      if (reason === null) return false;
      const toastId = toast.loading("Cancelando venta...");
      try {
        await cancelSale(saleId, reason || null);
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
      deliveryStatusBySale,
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

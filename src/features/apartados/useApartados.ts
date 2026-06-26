import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-hot-toast"
import Fuse from "fuse.js"

import {
  addPayment,
  cancelSale,
  getLatestProofActivity,
  listApartados,
  runAutoCancelIdleSales,
} from "./apartadosService"
import { supabase } from "../../lib/supabase"
import { sound } from "../../lib/sound"
import { confirmAction } from "../../lib/confirm"
import { promptDialog } from "../../lib/prompt"
import { useRealtimeSubscription } from "../../lib/useRealtimeSubscription"
import { useDebouncedCallback } from "../../lib/useDebouncedCallback"
import { useDebouncedValue } from "../../lib/useDebouncedValue"
import { runWithUndo } from "../../lib/withUndo"
import type { Sale } from "../../types/database"

export type ApartadosFilter = "pending" | "paid" | "all"

export const apartadosQueryKey = (
  filter: ApartadosFilter,
  onlyLayaway: boolean,
) => ["apartados", filter, onlyLayaway] as const

interface ApartadosBundle {
  sales: Sale[]
  pendingProofIds: Set<string>
  latestProofAt: Record<string, string>
  deliveryStatusBySale: Record<string, string>
}

const EMPTY_BUNDLE: ApartadosBundle = {
  sales: [],
  pendingProofIds: new Set(),
  latestProofAt: {},
  deliveryStatusBySale: {},
}

async function fetchApartadosBundle(
  filter: ApartadosFilter,
  onlyLayaway: boolean,
): Promise<ApartadosBundle> {
  const sales = await listApartados({ status: filter, onlyLayaway, limit: 200 })
  const ids = sales.map((s) => s.id)
  if (ids.length === 0) return { ...EMPTY_BUNDLE, sales }

  const [pendingRes, latest, deliveryRes] = await Promise.all([
    supabase
      .from("payment_proofs")
      .select("sale_id")
      .in("status", ["pending", "pending_verification"])
      .in("sale_id", ids),
    getLatestProofActivity(ids),
    supabase
      .from("delivery_notes")
      .select("sale_id, status, created_at")
      .in("sale_id", ids)
      .order("created_at", { ascending: false }),
  ])

  const pendingProofIds = new Set(
    ((pendingRes.data ?? []) as Array<{ sale_id: string }>).map(
      (p) => p.sale_id,
    ),
  )
  const deliveryStatusBySale: Record<string, string> = {}
  for (const row of (deliveryRes.data ?? []) as Array<{
    sale_id: string
    status: string
  }>) {
    if (!deliveryStatusBySale[row.sale_id]) {
      deliveryStatusBySale[row.sale_id] = row.status
    }
  }

  return {
    sales,
    pendingProofIds,
    latestProofAt: latest,
    deliveryStatusBySale,
  }
}

export function useApartados() {
  const queryClient = useQueryClient()
  // Default = "all" para no ocultar tarjetas al admin (antes era "pending").
  const [filter, setFilter] = useState<ApartadosFilter>("all")
  const [onlyLayaway, setOnlyLayaway] = useState(false)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)

  const queryKey = apartadosQueryKey(filter, onlyLayaway)
  const { data, isLoading, refetch } = useQuery<ApartadosBundle>({
    queryKey,
    queryFn: () => fetchApartadosBundle(filter, onlyLayaway),
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  })

  const bundle = data ?? EMPTY_BUNDLE
  const { sales, pendingProofIds, latestProofAt, deliveryStatusBySale } = bundle

  const refresh = useCallback(async () => {
    try {
      await refetch()
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando apartados")
    }
  }, [refetch])

  // Realtime: una sola invalidación coalesced para todas las tablas
  // relacionadas. React Query refetch reemplaza el bundle entero.
  const invalidateAll = useDebouncedCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["apartados"] })
  }, 500)

  useRealtimeSubscription("sales", invalidateAll)
  useRealtimeSubscription("payments", invalidateAll)
  useRealtimeSubscription("payment_proofs", invalidateAll)
  useRealtimeSubscription("delivery_notes", invalidateAll)

  // Regla `auto_cancel_idle_enabled`: al montar la página de apartados,
  // ejecutamos un barrido best-effort que cancela apartados pendientes
  // sin actividad. Si canceló algo, recargamos la lista.
  useEffect(() => {
    let mounted = true
    runAutoCancelIdleSales().then((n) => {
      if (mounted && n > 0) {
        invalidateAll()
        toast.success(`${n} apartado(s) auto-cancelados por inactividad`)
      }
    })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Eventos broadcast de la app + paleta de comandos.
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener("mari:apartado-refresh", handler)
    window.addEventListener("mari:pull-refresh", handler)
    const overdueHandler = () => {
      setFilter("pending")
      setOnlyLayaway(true)
    }
    window.addEventListener("apartados:filter-overdue", overdueHandler)
    const focusHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {}
      if (detail.query) setSearch(String(detail.query))
      if (detail.saleId) setSearch(String(detail.saleId).slice(0, 8))
    }
    window.addEventListener("apartados:focus", focusHandler)
    return () => {
      window.removeEventListener("mari:apartado-refresh", handler)
      window.removeEventListener("mari:pull-refresh", handler)
      window.removeEventListener("apartados:filter-overdue", overdueHandler)
      window.removeEventListener("apartados:focus", focusHandler)
    }
  }, [refresh])

  // Última actividad = max(created_at, último pago, último comprobante).
  const lastActivityFor = useCallback(
    (s: Sale): number => {
      const ts: number[] = [new Date(s.created_at).getTime()]
      for (const p of s.payments ?? []) {
        const t = new Date(p.created_at).getTime()
        if (Number.isFinite(t)) ts.push(t)
      }
      const proof = latestProofAt[s.id]
      if (proof) {
        const t = new Date(proof).getTime()
        if (Number.isFinite(t)) ts.push(t)
      }
      return Math.max(...ts)
    },
    [latestProofAt],
  )

  // Fuse index reconstruido sólo cuando cambia la lista.
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
    [sales],
  )

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim()
    const list = !q ? sales : fuse.search(q).map((r) => r.item)
    return [...list].sort((a, b) => lastActivityFor(b) - lastActivityFor(a))
  }, [sales, debouncedSearch, lastActivityFor, fuse])

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => {
        acc.count += 1
        acc.total += Number(s.total) || 0
        acc.paid += Number(s.paid) || 0
        acc.balance += Number(s.balance) || 0
        return acc
      },
      { count: 0, total: 0, paid: 0, balance: 0 },
    )
  }, [filtered])

  const handleAddPayment = useCallback(
    async (saleId: string, amount: number, method = "efectivo") => {
      const toastId = toast.loading("Registrando abono...")
      try {
        await addPayment(saleId, amount, method)
        sound.success()
        toast.success("Abono registrado 💖", { id: toastId })
        await refresh()
        return true
      } catch (e: any) {
        sound.error()
        toast.error(e?.message ?? "Error al abonar", { id: toastId })
        return false
      }
    },
    [refresh],
  )

  const handleCancelSale = useCallback(
    async (saleId: string) => {
      const ok = await confirmAction({
        title: "¿Cancelar esta venta?",
        description:
          "El stock se devolverá al inventario y el cliente recibirá una notificación con el motivo. Tendrás 5 segundos para deshacer.",
        confirmLabel: "Sí, cancelar venta",
        tone: "danger",
      })
      if (!ok) return false
      const reason = await promptDialog({
        title: "Motivo de cancelación (opcional)",
        description:
          "Se lo mandamos al cliente para que entienda. Ejemplos: 'Sin stock', 'Pago no acreditado', 'Cliente solicitó cancelar'.",
        placeholder: "Ej. Sin stock disponible…",
        confirmLabel: "Cancelar venta",
        cancelLabel: "Salir sin cancelar",
        multiline: true,
        maxLength: 280,
      })
      if (reason === null) return false
      // Snapshot del cache para revertir si user da Deshacer dentro del delay.
      const key = apartadosQueryKey(filter, onlyLayaway)
      const snapshot = queryClient.getQueryData<ApartadosBundle>(key)
      runWithUndo({
        message: "Venta cancelada (stock por liberar)",
        optimisticUI: () => {
          queryClient.setQueryData<ApartadosBundle>(key, (prev) =>
            prev
              ? { ...prev, sales: prev.sales.filter((s) => s.id !== saleId) }
              : prev,
          )
        },
        revertUI: () => {
          if (snapshot) queryClient.setQueryData(key, snapshot)
        },
        commit: async () => {
          await cancelSale(saleId, reason || null)
          await refresh()
        },
      })
      return true
    },
    [filter, onlyLayaway, queryClient, refresh],
  )

  return {
    state: {
      sales: filtered,
      loading: isLoading,
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
  }
}
